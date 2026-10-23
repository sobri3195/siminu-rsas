import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, it, expect } from "vitest";
import { db, createDatabase } from "../storage/db";
import { seed } from "../storage/seed";
import { ensureCatalogs } from "./catalogs";
import { register, issue, cancelDisposition } from "./workflow";
import { correctLetter } from "./letters";
import {
  createFullBackup,
  validateFullBackup,
  restoreFullBackup,
  findConflicts,
  checksum,
} from "./fullBackup";
import { strToU8, unzipSync, zipSync } from "fflate";
import { id, now, today } from "../utils";
import type { IncomingLetter, Disposition } from "../types";
beforeEach(async () => {
  await db.transaction("rw", db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
  await seed();
  await ensureCatalogs();
});
const letter = (): IncomingLetter => ({
  id: id(),
  agenda: "auto",
  sender: "Demo baru",
  number: "B/baru",
  date: today(),
  received: today(),
  subject: "Uji penyimpanan baru",
  summary: "",
  kind: "Surat dinas",
  urgency: "Biasa",
  classification: "Biasa",
  status: "Terdaftar",
  attachmentIds: [],
  createdAt: now(),
});
it("ZIP pulih dengan jumlah dan SHA-256 lampiran sama; cadangan otomatis tersedia", async () => {
  const blob = await createFullBackup();
  const pkg = await validateFullBackup(blob);
  expect(pkg.manifest.files.length).toBe(32);
  const expected = await checksum(
    new Uint8Array(await pkg.attachments[0].blob.arrayBuffer()),
  );
  await db.attachments.clear();
  const result = await restoreFullBackup(pkg, "replace", {});
  expect(result.restored).toBeGreaterThan(100);
  expect(await db.attachments.count()).toBe(32);
  expect(await db.letters.count()).toBe(32);
  const restored = (await db.attachments.toArray()).find(
    (a) => a.id === pkg.attachments[0].id,
  )!;
  expect(
    await checksum(new Uint8Array(await restored.blob.arrayBuffer())),
  ).toBe(expected);
  expect(await db.recovery.count()).toBe(1);
});
it("menolak checksum rusak dan referensi hilang sebelum database berubah", async () => {
  const original = await createFullBackup();
  const files = unzipSync(new Uint8Array(await original.arrayBuffer()));
  files["files/000000.bin"] = strToU8("rusak");
  await expect(validateFullBackup(new Blob([zipSync(files)]))).rejects.toThrow(
    /Checksum/,
  );
  expect(await db.letters.count()).toBe(32);
  expect(await db.attachments.count()).toBe(32);
});
it("konflik ID wajib dipilih; pilihan lokal menjaga koreksi", async () => {
  const pkg = await validateFullBackup(await createFullBackup());
  const old = (await db.letters.get("letter-0"))!;
  await correctLetter(
    old.id,
    old.revision || 1,
    { ...old, subject: "Koreksi lokal" },
    "Uji konflik",
    "Admin",
  );
  const conflicts = await findConflicts(pkg);
  expect(conflicts.some((c) => c.id === old.id)).toBe(true);
  await expect(restoreFullBackup(pkg, "merge", {})).rejects.toThrow(/konflik/);
  const choices = Object.fromEntries(
    conflicts.map((c) => [`${c.table}:${c.id}`, "local" as const]),
  );
  await restoreFullBackup(pkg, "merge", choices);
  expect((await db.letters.get(old.id))?.subject).toBe("Koreksi lokal");
});
it("alokasi agenda dalam transaksi unik saat permintaan bersamaan", async () => {
  const a = letter(),
    b = letter();
  await Promise.all([register(a, [], "A", true), register(b, [], "B", true)]);
  expect(a.agenda).not.toBe(b.agenda);
  expect(await db.letters.count()).toBe(34);
});
it("konflik revisi menolak edit lama dan mempertahankan jejak sebelum/sesudah", async () => {
  const old = (await db.letters.get("letter-0"))!;
  await correctLetter(
    old.id,
    old.revision || 1,
    { ...old, subject: "Perubahan pertama" },
    "Alasan",
    "Admin",
  );
  await expect(
    correctLetter(
      old.id,
      old.revision || 1,
      { ...old, subject: "Perubahan usang" },
      "Alasan kedua",
      "Admin",
    ),
  ).rejects.toThrow(/Konflik edit/);
  const log = (await db.activities.where({ letterId: old.id }).toArray()).find(
    (l) => l.before,
  );
  expect(log?.after).toHaveProperty("subject", "Perubahan pertama");
});
it("migrasi v1 menjaga metadata dan byte Blob, serta mode contoh berbeda database", async () => {
  const name = "migration-" + id();
  const legacy = new Dexie(name);
  const stores = Object.fromEntries(
    db.tables
      .filter((t) => !["sequences", "catalogs", "recovery"].includes(t.name))
      .map((t) => [
        t.name,
        [
          t.schema.primKey.src,
          ...t.schema.indexes
            .map((i) => i.src)
            .filter((i) => i !== "[year+register+agenda]"),
        ].join(","),
      ]),
  );
  legacy.version(1).stores(stores);
  const old = letter();
  await legacy.table("letters").add(old);
  await legacy.table("attachments").add({
    id: "old-file",
    letterId: old.id,
    name: "lama.txt",
    type: "text/plain",
    blob: new Blob(["byte asli"]),
  });
  legacy.close();
  const migrated = createDatabase(name);
  await migrated.open();
  expect((await migrated.letters.get(old.id))?.revision).toBe(1);
  expect((await migrated.letters.get(old.id))?.subject).toBe(old.subject);
  expect(await (await migrated.attachments.get("old-file"))?.blob.text()).toBe(
    "byte asli",
  );
  migrated.close();
  await Dexie.delete(name);
  const separate = createDatabase("isolated-" + id());
  await separate.open();
  expect(await separate.letters.count()).toBe(0);
  expect(await db.letters.count()).toBe(32);
  const separateName = separate.name;
  separate.close();
  await Dexie.delete(separateName);
});
it("penerima ganda dan tanggal invalid ditolak; pembatalan menyimpan tugas Dibatalkan", async () => {
  const l = letter();
  await register(l, [], "A", true);
  const recipient = {
    unitId: "unit-19",
    unitName: "KA SIMRS",
    userId: "user-3",
    kind: "Utama" as const,
    instruction: "Tindak lanjuti",
    deadline: today(),
  };
  const d: Disposition = {
    id: id(),
    letterId: l.id,
    giver: "Kepala",
    recipients: [recipient, recipient],
    instructions: ["Tindak lanjuti"],
    notes: "",
    deadline: today(),
    review: true,
    createdAt: now(),
  };
  await expect(issue(d, "K")).rejects.toThrow(/ganda/);
  await expect(
    issue(
      {
        ...d,
        id: id(),
        recipients: [{ ...recipient, deadline: "2026-02-31" }],
      },
      "K",
    ),
  ).rejects.toThrow(/Tenggat/);
  const valid = { ...d, id: id(), recipients: [recipient] };
  await issue(valid, "K");
  await cancelDisposition(valid.id, "Perubahan kebutuhan", "K");
  expect(
    (await db.tasks.where({ dispositionId: valid.id }).first())?.status,
  ).toBe("Dibatalkan");
  expect((await db.dispositions.get(valid.id))?.reason).toBe(
    "Perubahan kebutuhan",
  );
});

it("paket dengan referensi rusak ditolak walaupun checksum metadata dihitung ulang", async () => {
  const { strFromU8 } = await import("fflate");
  const files = unzipSync(
    new Uint8Array(await (await createFullBackup()).arrayBuffer()),
  );
  const metadata = JSON.parse(strFromU8(files["metadata.json"]));
  metadata.tables.tasks[0].unitId = "unit-tidak-ada";
  files["metadata.json"] = strToU8(JSON.stringify(metadata));
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  manifest.metadata.sha256 = await checksum(files["metadata.json"]);
  manifest.metadata.bytes = files["metadata.json"].length;
  files["manifest.json"] = strToU8(JSON.stringify(manifest));
  await expect(validateFullBackup(new Blob([zipSync(files)]))).rejects.toThrow(
    /Referensi units/,
  );
  expect(await db.letters.count()).toBe(32);
});
it("pemulihan menolak perubahan lokal setelah pratinjau konflik", async () => {
  const pkg = await validateFullBackup(await createFullBackup());
  await findConflicts(pkg);
  await db.letters.update("letter-0", {
    subject: "Perubahan setelah pratinjau",
    revision: 5,
  });
  await expect(restoreFullBackup(pkg, "replace", {})).rejects.toThrow(
    /Data lokal berubah/,
  );
  expect((await db.letters.get("letter-0"))?.subject).toBe(
    "Perubahan setelah pratinjau",
  );
});
it("CSV menangani tanda kutip, huruf Indonesia dan awalan formula dengan spasi", async () => {
  const { csvCell } = await import("../utils/csv");
  expect(csvCell('  =HYPERLINK("x")')).toBe('"\'  =HYPERLINK(""x"")"');
  expect(csvCell("Koordinasi — selesai")).toBe('"Koordinasi — selesai"');
});
