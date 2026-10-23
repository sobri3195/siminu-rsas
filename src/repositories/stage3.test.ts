import "fake-indexeddb/auto";
import { beforeEach, it, expect } from "vitest";
import { db } from "../storage/db";
import { seed } from "../storage/seed";
import {
  ensureTemplates,
  createDraft,
  saveDraft,
  draftAction,
  restoreDraftVersion,
} from "./drafts";
import { draftDocx } from "./docx";
import { unzipSync, strFromU8 } from "fflate";
beforeEach(async () => {
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
  await seed();
  await ensureTemplates();
});
it("naskah versi immutable, pemeriksaan berjenjang, DOCX teks dan persetujuan gugur saat isi berubah", async () => {
  let d = await createDraft("template-0", "user-0", "unit-19");
  d = await saveDraft(
    d.id,
    d.revision,
    {
      ...d.content,
      to: "Kepala RSAU",
      body: "Isi nota dinas yang dapat diedit.",
    },
    "user-0",
  );
  const version = d.version;
  d = await draftAction(d.id, d.revision, "submit", "user-0", "", [
    "user-3",
    "user-4",
  ]);
  d = await draftAction(d.id, d.revision, "review", "user-3");
  expect(d.stage).toBe("Pemeriksaan");
  d = await draftAction(d.id, d.revision, "review", "user-4");
  expect(d.stage).toBe("Persetujuan");
  d = await draftAction(d.id, d.revision, "approve", "user-2");
  expect(d.approvedVersion).toBe(version);
  d = await draftAction(d.id, d.revision, "number", "user-1");
  expect(d.content.number).toMatch(/^B\//);
  const packed = await draftDocx(d.kind, d.content);
  const files = unzipSync(new Uint8Array(await packed.arrayBuffer()));
  expect(strFromU8(files["word/document.xml"])).toContain(
    "Isi nota dinas yang dapat diedit.",
  );
  const outgoingId = d.outgoingId!;
  const issuedNumber = d.content.number;
  d = await saveDraft(
    d.id,
    d.revision,
    { ...d.content, body: "Perubahan setelah disetujui" },
    "user-0",
  );
  expect((await db.outgoing.get(outgoingId))?.number).toBe(issuedNumber);
  expect(d.outgoingId).toBeUndefined();
  expect(d.stage).toBe("Draf");
  expect(d.approvedVersion).toBeUndefined();
  expect(
    (await db.draftVersions.where({ draftId: d.id, version }).first())?.content
      .body,
  ).toBe("Isi nota dinas yang dapat diedit.");
  const restored = await restoreDraftVersion(
    d.id,
    version,
    d.revision,
    "user-0",
    "Kembalikan isi",
  );
  expect(restored.content.body).toBe("Isi nota dinas yang dapat diedit.");
  expect(restored.version).toBeGreaterThan(d.version);
  expect(restored.approvedVersion).toBeUndefined();
});
it("ICS memakai UTC dari zona waktu asal dan benturan hanya peringatan", async () => {
  const { agendaICS, agendaConflicts, saveAgenda } = await import("./agenda");
  const e = {
    id: "agenda-test",
    title: "Undangan rapat",
    date: "2026-10-23",
    start: "08:00",
    end: "09:00",
    location: "Ruang A",
    invitedUserId: "user-2",
  };
  await saveAgenda(e);
  const next = { ...e, id: "agenda-overlap", start: "08:30", end: "09:30" };
  expect(await agendaConflicts(next)).toHaveLength(1);
  await expect(saveAgenda(next)).rejects.toThrow(/Benturan/);
  await saveAgenda(next, true);
  const ics = agendaICS([e], "Asia/Jakarta");
  expect(ics).toContain("DTSTART:20261023T010000Z");
  expect(ics).toContain("DTEND:20261023T020000Z");
});
it("keputusan rapat idempoten dan hubungan berkas tidak menghapus sumber", async () => {
  const { saveMinutes, decisionTasks } = await import("./minutes");
  const { linkToCase, unlinkFromCase } = await import("./cases");
  const { now, today } = await import("../utils");
  const m = await saveMinutes(
    {
      id: "minutes-test",
      title: "Rapat koordinasi",
      date: today(),
      chair: "Ketua Demo",
      participants: "Tim",
      discussion: "Bahas kegiatan",
      decisions: [
        {
          id: "dec-1",
          text: "Siapkan laporan",
          userId: "user-3",
          unitId: "unit-19",
          deadline: today(),
        },
      ],
      attachmentIds: [],
      revision: 0,
      createdAt: now(),
      updatedAt: now(),
    },
    undefined,
  );
  const results = await Promise.all([
    decisionTasks(m.id, ["dec-1"], true),
    decisionTasks(m.id, ["dec-1"], true),
  ]);
  expect(results.reduce((n, r) => n + r.created, 0)).toBe(1);
  expect(await db.tasks.where({ minutesId: m.id }).count()).toBe(1);
  await db.caseFiles.add({
    id: "case-1",
    title: "Rapat",
    description: "",
    links: [],
    createdAt: now(),
    updatedAt: now(),
  });
  await linkToCase("case-1", [{ kind: "minutes", id: m.id }]);
  await unlinkFromCase("case-1", "minutes", m.id);
  expect(await db.minutes.get(m.id)).toBeTruthy();
});
it("impor CSV memvalidasi baris, tidak menimpa konflik, dan bulk memproses hanya item valid", async () => {
  const { ensureCatalogs } = await import("./catalogs");
  await ensureCatalogs();
  const { readSpreadsheet, previewImport, commitImport, columns } =
    await import("./spreadsheet");
  const csv =
    "agenda,pengirim,nomor,tanggal,diterima,perihal,jenis,derajat,klasifikasi,unit\n0999/SM/2026,Mitra,B/baru,2026-10-23,2026-10-23,Surat valid,Surat dinas,Biasa,Biasa,unit-19\n1000/SM/2026,Mitra,B/buruk,2026-02-31,2026-02-31,Surat invalid,Surat dinas,Biasa,Biasa,unit-19";
  const sheet = await readSpreadsheet(new File([csv], "register.csv"));
  const mapping = Object.fromEntries(columns.map((k) => [k, k]));
  const rows = await previewImport(sheet, mapping, "incoming");
  expect(rows[0].errors).toHaveLength(0);
  expect(rows[1].errors.length).toBeGreaterThan(0);
  const result = await commitImport(sheet, mapping, "incoming", true);
  expect(result.map((r) => r.status)).toEqual(["Berhasil", "Dilewati"]);
  const repeated = await commitImport(sheet, mapping, "incoming", true);
  expect(repeated[0].status).toBe("Dilewati");
  expect(await db.letters.count()).toBe(33);
  const { bulkLetters } = await import("./bulk");
  const bulk = await bulkLetters(
    ["letter-28", "letter-0"],
    "archive",
    "Admin",
    {},
  );
  expect(bulk.map((r) => r.status)).toEqual(["Berhasil", "Gagal"]);
  expect((await db.letters.get("letter-0"))?.status).toBe("Menunggu disposisi");
});
it("cadangan skema 3 mencakup naskah, versi, notulen, bundel dan Blob; paket v2 tetap dibaca", async () => {
  const { createFullBackup, validateFullBackup, checksum } =
    await import("./fullBackup");
  const { stage3Schemas } = await import("./stage3Schemas");
  const { saveMinutes } = await import("./minutes");
  const { now, today } = await import("../utils");
  const { zipSync } = await import("fflate");
  let d = await createDraft("template-0", "user-0", "unit-10");
  d = await saveDraft(
    d.id,
    d.revision,
    { ...d.content, body: "Isi cadangan lengkap" },
    "user-0",
  );
  await saveMinutes(
    {
      id: "minutes-backup",
      title: "Notulen cadangan",
      date: today(),
      chair: "Ketua",
      participants: "Tim",
      discussion: "Pembahasan",
      decisions: [],
      attachmentIds: [],
      revision: 0,
      createdAt: now(),
      updatedAt: now(),
    },
    undefined,
    [new File(["Bukti notulen asli"], "bukti.txt")],
  );
  let pkg = await validateFullBackup(await createFullBackup());
  expect(pkg.manifest.schemaVersion).toBe(6);
  expect(pkg.tables.draftVersions).toHaveLength(2);
  expect(pkg.tables.minutes).toHaveLength(1);
  expect(
    await pkg.attachments
      .find((a) => a.letterId === "minutes-backup")
      ?.blob.text(),
  ).toBe("Bukti notulen asli");
  await db.drafts.clear();
  await db.draftVersions.clear();
  await db.minutes.clear();
  await db.attachments.where({ letterId: "minutes-backup" }).delete();
  const legacy = unzipSync(
    new Uint8Array(await (await createFullBackup()).arrayBuffer()),
  );
  const meta = JSON.parse(strFromU8(legacy["metadata.json"]));
  const manifest = JSON.parse(strFromU8(legacy["manifest.json"]));
  for (const key of Object.keys(stage3Schemas)) {
    delete meta.tables[key];
    delete manifest.counts[key];
  }
  legacy["metadata.json"] = new TextEncoder().encode(JSON.stringify(meta));
  manifest.schemaVersion = 2;
  manifest.metadata.bytes = legacy["metadata.json"].length;
  manifest.metadata.sha256 = await checksum(legacy["metadata.json"]);
  legacy["manifest.json"] = new TextEncoder().encode(JSON.stringify(manifest));
  pkg = await validateFullBackup(new Blob([zipSync(legacy)]));
  expect(pkg.tables.drafts).toEqual([]);
  expect(pkg.tables.letters).toHaveLength(32);
});
it("median menghitung observasi lengkap dan mengecualikan timestamp hilang/negatif", async () => {
  const { summarize, durationHours } = await import("./analytics");
  expect(summarize([undefined, 1, 3])).toEqual({ n: 2, missing: 1, median: 2 });
  expect(durationHours(undefined, "2026-10-23T00:00:00Z")).toBeUndefined();
  expect(
    durationHours("2026-10-23T02:00:00Z", "2026-10-23T01:00:00Z"),
  ).toBeUndefined();
});
it("migrasi v2 ke v3 mempertahankan metadata, Blob dan menambahkan tabel baru", async () => {
  const { default: Dexie } = await import("dexie");
  const { createDatabase } = await import("../storage/db");
  const { id } = await import("../utils");
  const name = "v2-migration-" + id();
  const fresh = [
    "drafts",
    "draftVersions",
    "draftDecisions",
    "templates",
    "minutes",
    "caseFiles",
    "searchPages",
  ];
  const stores = Object.fromEntries(
    db.tables
      .filter((t) => !fresh.includes(t.name))
      .map((t) => [
        t.name,
        [
          t.schema.primKey.src,
          ...t.schema.indexes
            .map((i) => i.src)
            .filter((s) => s !== "minutesId"),
        ].join(","),
      ]),
  );
  const old = new Dexie(name);
  old.version(2).stores(stores);
  const letter = (await db.letters.get("letter-0"))!;
  await old.table("letters").add(letter);
  await old.table("attachments").add({
    id: "old-blob",
    letterId: letter.id,
    name: "lama.txt",
    type: "text/plain",
    blob: new Blob(["Dokumen sebelum v3"]),
  });
  old.close();
  const migrated = createDatabase(name);
  await migrated.open();
  expect(await migrated.letters.get(letter.id)).toEqual(letter);
  expect(await (await migrated.attachments.get("old-blob"))?.blob.text()).toBe(
    "Dokumen sebelum v3",
  );
  expect(await migrated.drafts.count()).toBe(0);
  migrated.close();
  await Dexie.delete(name);
});
