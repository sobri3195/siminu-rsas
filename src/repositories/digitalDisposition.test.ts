import "fake-indexeddb/auto";
import { beforeEach, expect, it } from "vitest";
import Dexie from "dexie";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { dispositionSchemas } from "./dispositionSchemas";
import { db, createDatabase } from "../storage/db";
import { seed } from "../storage/seed";
import { ensureNota } from "./nota";
import {
  createDispositionDraft,
  saveDispositionDraft,
  publishDisposition,
  markDispositionRead,
  digitalTaskAction,
  delegateDigital,
  extendDigitalDeadline,
  cancelDigitalDisposition,
  dispositionProgress,
  deadlineState,
  dispositionOutput,
} from "./digitalDisposition";
import {
  createFullBackup,
  validateFullBackup,
  findConflicts,
  restoreFullBackup,
  validateReferences,
  checksum,
} from "./fullBackup";
import { archive } from "./workflow";
import { digitalOverview } from "./dispositionReports";
import { now, today, id } from "../utils";
import type {
  Disposition,
  DispositionDraft,
  DigitalRecipient,
  Task,
} from "../types";
beforeEach(async () => {
  await db.transaction("rw", db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
  await seed();
  await ensureNota();
  for (const [uid, name, unitId, role] of [
    ["dt-urtu", "URTU (contoh)", "unit-10", "Kepala Unit"],
    ["dt-worker", "Pelaksana (contoh)", "unit-10", "Pelaksana"],
    ["dt-mutu", "Mutu (contoh)", "unit-2", "Kepala Unit"],
  ] as const) {
    await db.users.add({ id: uid, name, unitId, role, active: true });
    await db.positions.add({
      id: uid,
      name,
      unitId,
      userId: uid,
      active: true,
    });
  }
  const l = (await db.letters.get("letter-0"))!;
  await db.letters.add({
    ...l,
    id: "dt-letter",
    agenda: "9999/SM/2026",
    status: "Menunggu disposisi",
    attachmentIds: [],
  });
});
async function draft(info = false) {
  let d = await createDispositionDraft("dt-letter", "user-2");
  const recipients: DigitalRecipient[] = [];
  for (const [i, uid] of ["dt-urtu", "user-3", "dt-mutu"].entries()) {
    const u = (await db.users.get(uid))!,
      unit = (await db.units.get(u.unitId))!,
      pos = (await db.positions
        .filter((p) => p.userId === uid && p.unitId === unit.id)
        .first())!;
    recipients.push({
      id: "dt-r" + i,
      unitId: unit.id,
      unitName: unit.name,
      userId: uid,
      userName: u.name,
      positionId: pos.id,
      positionName: pos.name,
      assignmentStart: "",
      assignmentEnd: "",
      kind: info || i === 2 ? "Tembusan" : i === 0 ? "Utama" : "Pendukung",
      instruction:
        info || i === 2 ? "Untuk diketahui" : "Pelajari dan laporkan hasilnya.",
      deadline: today(),
    });
  }
  return saveDispositionDraft(
    d.id,
    d.revision,
    {
      ...d.content,
      mode: info ? "Untuk diketahui" : "Penugasan",
      recipients,
      notes: "Catatan contoh",
      reviewerId: "user-2",
    },
    "",
    "user-2",
  );
}
async function issued() {
  const d = await draft();
  return publishDisposition(d.id, d.revision, "user-2");
}
async function task(uid: string, did: string) {
  return (await db.tasks
    .filter((t) => t.userId === uid && t.dispositionId === did)
    .first())!;
}
async function action(
  t: Task,
  kind: Parameters<typeof digitalTaskAction>[2],
  uid = t.userId,
  text = "Catatan tindakan",
  files: File[] = [],
) {
  const latest = (await db.tasks.get(t.id))!;
  return digitalTaskAction(
    t.id,
    latest.revision || 1,
    kind,
    uid,
    text,
    kind === "submit"
      ? {
          id: id(),
          taskId: t.id,
          action: "Pelaksanaan",
          date: today(),
          result: "Hasil dari pengguna",
          obstacles: "",
          next: "",
          attachmentIds: [],
          createdAt: now(),
        }
      : undefined,
    files,
  );
}
it("penerbitan idempoten/atomik; draf usang ditolak dan tembusan bukan tugas", async () => {
  const d = await draft();
  const results = await Promise.all([
    publishDisposition(d.id, d.revision, "user-2"),
    publishDisposition(d.id, d.revision, "user-2"),
  ]);
  expect(results[0].id).toBe(results[1].id);
  expect(await db.tasks.where({ dispositionId: results[0].id }).count()).toBe(
    2,
  );
  expect(
    await db.recipientReceipts.where({ dispositionId: results[0].id }).count(),
  ).toBe(3);
  const other = await draft();
  await saveDispositionDraft(
    other.id,
    other.revision,
    { ...other.content, notes: "Tab pertama" },
    "",
    "user-2",
  );
  await expect(
    saveDispositionDraft(
      other.id,
      other.revision,
      { ...other.content, notes: "Tab lama" },
      "",
      "user-2",
    ),
  ).rejects.toThrow(/Konflik revisi/);
});
it("membuka detail hanya menandai penerima sendiri; baca/diskusi/terima tidak menyelesaikan tugas", async () => {
  const d = await issued();
  await markDispositionRead(d.id, "user-0");
  expect(
    (
      await db.recipientReceipts.where({ dispositionId: d.id }).toArray()
    ).filter((r) => r.readAt),
  ).toHaveLength(0);
  await markDispositionRead(d.id, "dt-urtu");
  const t = await task("dt-urtu", d.id);
  expect(t.status).toBe("Belum diterima");
  expect(t.readAt).toBeTruthy();
  expect(
    (
      await db.recipientReceipts.where({ dispositionId: d.id }).toArray()
    ).filter((r) => r.readAt),
  ).toHaveLength(1);
  await action(t, "discussion", t.userId, "Siap");
  const accepted = await action(t, "accept");
  expect(accepted.status).toBe("Diterima");
  await expect(action(accepted, "approve", "user-3")).rejects.toThrow(
    /pemeriksa/,
  );
});
it("alur URTU/SIMRS/delegasi, perbaikan hasil dan tembusan belum baca tetap konsisten sampai arsip", async () => {
  const d = await issued();
  let parent = await action(await task("dt-urtu", d.id), "accept"),
    support = await action(await task("user-3", d.id), "accept");
  const child = await delegateDigital(
    parent.id,
    parent.revision!,
    "dt-worker",
    "Siapkan bahan",
    today(),
    "Pembagian pekerjaan",
    true,
    "dt-urtu",
  );
  expect((await db.tasks.get(parent.id))?.status).toBe("Diterima");
  await expect(action(parent, "submit")).rejects.toThrow(/konsolidasikan/);
  await action(child, "accept");
  await action(child, "submit");
  await action(child, "approve", "dt-urtu");
  parent = (await db.tasks.get(parent.id))!;
  await action(parent, "submit");
  await action(support, "submit");
  await action(support, "return", "user-2", "Tambahkan bukti");
  expect((await db.tasks.get(support.id))?.status).toBe("Perlu perbaikan");
  await action(support, "submit");
  expect(await db.reports.where({ taskId: support.id }).count()).toBe(2);
  await action(support, "approve", "user-2");
  await action(parent, "approve", "user-2");
  expect((await db.letters.get(d.letterId))?.status).toBe("Selesai");
  expect(
    (
      await db.recipientReceipts
        .where({ dispositionId: d.id, userId: "dt-mutu" })
        .first()
    )?.readAt,
  ).toBeUndefined();
  const p = dispositionProgress(d, await db.tasks.toArray());
  expect(p.done).toBe(p.total);
  expect(p.status).toBe("Selesai");
  await archive(d.letterId, "Petugas");
  expect((await db.letters.get(d.letterId))?.status).toBe("Diarsipkan");
});
it("informasi hanya memakai progres baca, penugasan tanpa penerima wajib dan penerima ganda ditolak", async () => {
  let q = await draft(true);
  const d = await publishDisposition(q.id, q.revision, "user-2");
  expect(await db.tasks.where({ dispositionId: d.id }).count()).toBe(0);
  await markDispositionRead(d.id, "dt-mutu");
  const p = dispositionProgress(d, [], await db.recipientReceipts.toArray());
  expect(p.done).toBe(1);
  expect(p.total).toBe(3);
  q = await draft();
  q = await saveDispositionDraft(
    q.id,
    q.revision,
    { ...q.content, recipients: [q.content.recipients[2]] },
    "",
    "user-2",
  );
  await expect(publishDisposition(q.id, q.revision, "user-2")).rejects.toThrow(
    /penerima wajib/,
  );
  q = await draft();
  q = await saveDispositionDraft(
    q.id,
    q.revision,
    {
      ...q.content,
      recipients: [
        q.content.recipients[0],
        { ...q.content.recipients[0], id: "duplicate", kind: "Tembusan" },
      ],
    },
    "",
    "user-2",
  );
  await expect(publishDisposition(q.id, q.revision, "user-2")).rejects.toThrow(
    /ganda/,
  );
});
it("delegasi siklus/kembali ke rantai ditolak dan tugas induk tidak selesai otomatis", async () => {
  const d = await issued();
  let t = await action(await task("dt-urtu", d.id), "accept");
  await expect(
    delegateDigital(
      t.id,
      t.revision!,
      "dt-urtu",
      "Instruksi",
      today(),
      "Alasan",
      true,
      t.userId,
    ),
  ).rejects.toThrow();
  const child = await delegateDigital(
    t.id,
    t.revision!,
    "dt-worker",
    "Instruksi",
    today(),
    "Alasan",
    true,
    t.userId,
  );
  await action(child, "accept");
  await expect(
    delegateDigital(
      child.id,
      2,
      "dt-urtu",
      "Instruksi",
      today(),
      "Alasan",
      true,
      "dt-worker",
    ),
  ).rejects.toThrow();
  expect((await db.tasks.get(t.id))?.completedAt).toBeUndefined();
});
it("revisi mempertahankan versi, menambah/menghapus penerima, dan instruksi material meminta konfirmasi ulang", async () => {
  const d = await issued();
  const old = await action(await task("dt-urtu", d.id), "accept");
  let r = await createDispositionDraft(d.letterId, "user-2", d.id);
  r = await saveDispositionDraft(
    r.id,
    r.revision,
    {
      ...r.content,
      notes: "Catatan baru",
      recipients: r.content.recipients
        .filter((p) => p.userId !== "user-3")
        .map((p) =>
          p.userId === "dt-urtu"
            ? { ...p, instruction: "Instruksi material baru" }
            : p,
        ),
    },
    "Perubahan kebutuhan",
    "user-2",
  );
  const next = await publishDisposition(r.id, r.revision, "user-2");
  expect(next.version).toBe(2);
  expect(
    await db.dispositionVersions.where({ dispositionId: d.id }).count(),
  ).toBe(2);
  expect((await db.tasks.get(old.id))?.reconfirmRequired).toBe(true);
  expect((await task("user-3", d.id)).status).toBe("Dibatalkan");
  await expect(action((await db.tasks.get(old.id))!, "submit")).rejects.toThrow(
    /penerimaan/,
  );
  await action((await db.tasks.get(old.id))!, "accept");
  expect(
    (
      await db.dispositionVersions
        .where({ dispositionId: d.id, version: 1 })
        .first()
    )?.snapshot.recipients[0].instruction,
  ).not.toContain("material");
});
it("snapshot jabatan/nama tetap, masa penugasan dan unit nonaktif menolak penerbitan baru", async () => {
  const d = await issued();
  await db.users.update("dt-urtu", { name: "Pengganti" });
  await db.positions.update("dt-urtu", {
    name: "Jabatan baru",
    assignmentEnd: "2020-01-01",
  });
  expect((await db.dispositions.get(d.id))?.recipients[0].userName).toBe(
    "URTU (contoh)",
  );
  let q = await draft();
  await expect(publishDisposition(q.id, q.revision, "user-2")).rejects.toThrow(
    /masa penugasan/,
  );
  await db.positions.update("dt-urtu", { assignmentEnd: "" });
  await db.units.update("unit-19", { active: false });
  q = await draft();
  await expect(publishDisposition(q.id, q.revision, "user-2")).rejects.toThrow(
    /aktif/,
  );
});
it("perpanjangan menyimpan sebelum/sesudah; tanggal kosong bukan tepat waktu; konflik tugas ditolak", async () => {
  const d = await issued(),
    t = await task("dt-urtu", d.id),
    extended = await extendDigitalDeadline(
      t.id,
      t.revision!,
      "2099-12-31",
      "Penyesuaian jadwal",
      "user-2",
    );
  expect(extended.deadline).toBe("2099-12-31");
  expect(
    await db.dispositionVersions.where({ dispositionId: d.id }).count(),
  ).toBe(2);
  expect(
    (
      await db.activities
        .filter((a) => a.taskId === t.id && !!a.event?.startsWith("Tenggat"))
        .first()
    )?.before,
  ).toBeTruthy();
  await expect(
    digitalTaskAction(t.id, t.revision!, "accept", t.userId),
  ).rejects.toThrow(/Konflik revisi/);
  expect(deadlineState({ ...t, deadline: "" })).toBe("Tanpa tenggat");
});
it("seluruh disposisi aktif mempengaruhi agregat dan pengarsipan tidak menutup tugas terbuka", async () => {
  const a = await issued(),
    b = await issued();
  for (const t of await db.tasks.where({ dispositionId: a.id }).toArray()) {
    await action(t, "accept");
    await action(t, "submit");
    await action(t, "approve", "user-2");
  }
  expect((await db.letters.get(a.letterId))?.status).toBe(
    "Dalam tindak lanjut",
  );
  await expect(archive(a.letterId, "Admin")).rejects.toThrow();
  await cancelDigitalDisposition(
    b.id,
    b.revision!,
    "Tidak diperlukan",
    "user-2",
  );
  expect((await db.letters.get(a.letterId))?.status).toBe("Selesai");
});
it("pembatalan hanya membatalkan tugas terbuka; laporan, hasil selesai dan byte bukti tetap", async () => {
  const d = await issued(),
    t = await task("dt-urtu", d.id);
  await action(t, "accept");
  await action(t, "submit", t.userId, "", [
    new File(["bukti asli"], "bukti.txt"),
  ]);
  await action(t, "approve", "user-2");
  await cancelDigitalDisposition(d.id, d.revision!, "Arahan ditutup", "user-2");
  expect((await db.tasks.get(t.id))?.status).toBe("Selesai");
  const report = (await db.reports.where({ taskId: t.id }).first())!;
  expect(
    await (await db.attachments.get(report.attachmentIds[0]))?.blob.text(),
  ).toBe("bukti asli");
  expect((await task("user-3", d.id)).status).toBe("Dibatalkan");
});
it("ZIP skema 5 mencakup disposisi bertingkat dan Blob; referensi rusak ditolak sebelum pemulihan", async () => {
  const d = await issued();
  const p = await action(await task("dt-urtu", d.id), "accept"),
    child = await delegateDigital(
      p.id,
      p.revision!,
      "dt-worker",
      "Bahan",
      today(),
      "Pembagian",
      true,
      p.userId,
    );
  await action(child, "accept");
  await action(child, "submit", child.userId, "", [
    new File(["data hasil"], "hasil.txt"),
  ]);
  const pkg = await validateFullBackup(await createFullBackup());
  expect(pkg.manifest.schemaVersion).toBe(5);
  expect(pkg.tables.dispositionVersions).toHaveLength(1);
  const bad = structuredClone(pkg.tables);
  bad.recipientReceipts[0].recipientId = "missing";
  expect(() => validateReferences(bad, pkg.attachments)).toThrow(/penerima/);
  await db.tasks.clear();
  await findConflicts(pkg);
  await restoreFullBackup(pkg, "replace", {});
  expect((await db.tasks.get(child.id))?.parentId).toBe(p.id);
  expect((await db.dispositions.get(d.id))?.issuerId).toBe("user-2");
  expect(
    (await db.reports.where({ taskId: child.id }).first())?.attachmentIds,
  ).toHaveLength(1);
});
it("keluaran agenda/Nota Dinas perlu konfirmasi dan memakai sumber idempoten", async () => {
  const d = await issued();
  await expect(
    dispositionOutput(d.id, "user-2", "notes", false),
  ).rejects.toThrow(/Konfirmasi/);
  const ids = await Promise.all([
    dispositionOutput(d.id, "user-2", "notes", true),
    dispositionOutput(d.id, "user-2", "notes", true),
  ]);
  expect(ids[0]).toBe(ids[1]);
  expect((await db.notes.get(ids[0]))?.content.dispositionId).toBe(d.id);
  const eid = await dispositionOutput(d.id, "user-2", "events", true, {
    title: "Rapat tindak lanjut",
    date: today(),
    start: "08:00",
    end: "09:00",
    location: "Ruang contoh",
  });
  expect((await db.events.get(eid))?.dispositionId).toBe(d.id);
  await validateFullBackup(await createFullBackup());
});
it("laporan memisahkan terlambat terbuka dan selesai terlambat; observasi hilang tidak dianggap nol", async () => {
  const d = await issued(),
    t = await task("dt-urtu", d.id);
  await db.tasks.update(t.id, { deadline: "2000-01-01" });
  const data = await digitalOverview("2000-01-01", "2099-12-31");
  expect(
    data.rows
      .find(([label]) => label === "Terlambat dan masih terbuka")?.[1]
      .map((t) => t.id),
  ).toContain(t.id);
  expect(data.metrics[0].n).toBe(0);
  await action(t, "accept");
  await action(t, "submit");
  await action(t, "approve", "user-2");
  const next = await digitalOverview("2000-01-01", "2099-12-31");
  expect(
    next.rows
      .find(([label]) => label === "Selesai melewati tenggat")?.[1]
      .map((t) => t.id),
  ).toContain(t.id);
});
it("migrasi v4→v5 mempertahankan surat, tugas lama, Nota Dinas, dan Blob tanpa timestamp baca buatan", async () => {
  const name = "disposition-migration-" + id(),
    old = new Dexie(name),
    fresh = [
      "dispositionDrafts",
      "dispositionVersions",
      "recipientReceipts",
      "dispositionOutputs",
    ];
  old
    .version(4)
    .stores(
      Object.fromEntries(
        db.tables
          .filter((t) => !fresh.includes(t.name))
          .map((t) => [
            t.name,
            [t.schema.primKey.src, ...t.schema.indexes.map((i) => i.src)].join(
              ",",
            ),
          ]),
      ),
    );
  await old.table("letters").add({ id: "old-letter", subject: "Data lama" });
  await old.table("tasks").add({ id: "old-task", status: "Dibaca" });
  await old
    .table("notes")
    .add({ id: "old-note", content: { subject: "Nota lama" } });
  await old
    .table("attachments")
    .add({ id: "old-file", blob: new Blob(["asli"]) });
  old.close();
  const next = createDatabase(name);
  await next.open();
  expect((await next.letters.get("old-letter"))?.subject).toBe("Data lama");
  expect((await next.tasks.get("old-task"))?.revision).toBe(1);
  expect((await next.tasks.get("old-task"))?.readAt).toBeUndefined();
  expect((await next.notes.get("old-note"))?.content.subject).toBe("Nota lama");
  expect(await (await next.attachments.get("old-file"))?.blob.text()).toBe(
    "asli",
  );
  next.close();
  await Dexie.delete(name);
});

it("tugas tanpa laporan memerlukan catatan dan tetap menunggu pemeriksaan bila diwajibkan", async () => {
  let q = await draft();
  q = await saveDispositionDraft(
    q.id,
    q.revision,
    { ...q.content, reportRequired: false },
    "",
    "user-2",
  );
  const d = await publishDisposition(q.id, q.revision, "user-2"),
    t = await action(await task("dt-urtu", d.id), "accept");
  await expect(
    digitalTaskAction(t.id, t.revision!, "complete", t.userId, ""),
  ).rejects.toThrow(/Catatan/);
  const result = await action(
    t,
    "complete",
    t.userId,
    "Pekerjaan selesai tanpa laporan",
  );
  expect(result.status).toBe("Hasil dikirim");
  expect(await db.reports.where({ taskId: t.id }).count()).toBe(0);
  await action(result, "approve", "user-2");
  expect((await db.tasks.get(t.id))?.completedAt).toBeTruthy();
});
it("penerima selesai yang dilepas menjadi riwayat dan keluar dari pembagi kewajiban aktif", async () => {
  const d = await issued(),
    t = await task("dt-urtu", d.id);
  await action(t, "accept");
  await action(t, "submit");
  await action(t, "approve", "user-2");
  let q = await createDispositionDraft(d.letterId, "user-2", d.id);
  q = await saveDispositionDraft(
    q.id,
    q.revision,
    {
      ...q.content,
      recipients: q.content.recipients.filter((r) => r.userId !== "dt-urtu"),
    },
    "Lingkup berkurang",
    "user-2",
  );
  const next = await publishDisposition(q.id, q.revision, "user-2");
  expect((await db.tasks.get(t.id))?.status).toBe("Selesai");
  expect((await db.tasks.get(t.id))?.retired).toBe(true);
  expect(dispositionProgress(next, await db.tasks.toArray()).total).toBe(1);
  await validateFullBackup(await createFullBackup());
});
it("paket skema 4 dipulihkan dengan tabel digital kosong dan data sebelumnya tetap utuh", async () => {
  const entries = unzipSync(
      new Uint8Array(await (await createFullBackup()).arrayBuffer()),
    ),
    meta = JSON.parse(strFromU8(entries["metadata.json"])),
    manifest = JSON.parse(strFromU8(entries["manifest.json"]));
  for (const key of Object.keys(dispositionSchemas)) {
    delete meta.tables[key];
    delete manifest.counts[key];
  }
  manifest.schemaVersion = 4;
  manifest.appVersion = "4.0.0";
  entries["metadata.json"] = strToU8(JSON.stringify(meta));
  manifest.metadata.bytes = entries["metadata.json"].length;
  manifest.metadata.sha256 = await checksum(entries["metadata.json"]);
  entries["manifest.json"] = strToU8(JSON.stringify(manifest));
  const pkg = await validateFullBackup(
    new Blob([Uint8Array.from(zipSync(entries))]),
  );
  expect(pkg.tables.dispositionDrafts).toEqual([]);
  await findConflicts(pkg);
  await restoreFullBackup(pkg, "replace", {});
  expect(await db.letters.count()).toBe(33);
  expect(await db.recipientReceipts.count()).toBe(0);
  expect(await db.attachments.count()).toBeGreaterThan(0);
});
