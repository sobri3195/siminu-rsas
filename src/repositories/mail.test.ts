import "fake-indexeddb/auto";
import { beforeEach, it, expect, vi } from "vitest";
import Dexie from "dexie";
import { unzipSync, strFromU8, strToU8, zipSync } from "fflate";
import { db, createDatabase } from "../storage/db";
import { seed } from "../storage/seed";
import { ensureNota } from "./nota";
import {
  ensureTemplates,
  createDraft,
  saveDraft,
  draftAction,
  restoreDraftVersion,
} from "./drafts";
import {
  createReplyDraft,
  setReplyAssignment,
  replyStage,
  reviseMail,
  duplicateMail,
  changeDraftAttachment,
  updateDraftLinks,
  addDispatchTarget,
  recordDispatch,
  receiveDispatch,
  archiveMail,
  cancelMailNumber,
  targetStatus,
  linkFollowup,
  assertReplyClosed,
} from "./mail";
import {
  createFullBackup,
  validateFullBackup,
  validateReferences,
  restoreFullBackup,
  findConflicts,
  checksum,
} from "./fullBackup";
import { draftDocx } from "./docx";
import { register } from "./workflow";
import { id, now, today } from "../utils";
import type { OfficialDraft, MailDispatch } from "../types";
beforeEach(async () => {
  await db.transaction("rw", db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
  await seed();
  await ensureTemplates();
  await ensureNota();
  const l = (await db.letters.get("letter-0"))!;
  await db.letters.add({
    ...l,
    id: "mail-source",
    number: "SOURCE/1",
    date: today(),
    received: today(),
    agenda: "9000/SM/" + today().slice(0, 4),
    status: "Terdaftar",
    attachmentIds: [],
    createdAt: now(),
  });
});
async function assignment() {
  return setReplyAssignment(
    {
      id: "mail-source",
      decision: "Perlu balasan",
      picId: "user-4",
      picName: "",
      unitId: "unit-19",
      unitName: "",
      deadline: today(),
      instructions: "Siapkan jawaban sesuai data pengguna.",
      reviewerId: "user-3",
      reason: "Penilaian petugas",
      revision: 0,
      updatedAt: "",
      userId: "",
    },
    0,
    "user-1",
  );
}
async function draft() {
  await assignment();
  let d = await createReplyDraft("mail-source", "template-5", "user-4");
  return saveDraft(
    d.id,
    d.revision,
    {
      ...d.content,
      to: "Instansi tujuan",
      body: "**Jawaban** berdasarkan data yang dipilih.\n| Kolom | Nilai |\n| A | B |",
      signer: "Pejabat (contoh)",
      date: today(),
    },
    "user-4",
  );
}
async function approve(d: OfficialDraft) {
  d = await draftAction(d.id, d.revision, "submit", "user-4", "", ["user-3"]);
  d = await draftAction(d.id, d.revision, "review", "user-3");
  return draftAction(d.id, d.revision, "approve", "user-2");
}
async function issue() {
  let d = await draft();
  d = await approve(d);
  return draftAction(d.id, d.revision, "number", "user-1");
}
const shipping = (outgoingId: string, targetId: string): MailDispatch => ({
  id: id(),
  targetId,
  outgoingId,
  recipient: "Pihak tujuan",
  sentAt: new Date(Date.now() - 60000).toISOString(),
  medium: "Kurir",
  userId: "",
  userName: "",
  tracking: "RESI-1",
  proofIds: [],
  receivedAt: "",
  receiptIds: [],
  note: "Catatan manual",
  status: "Tercatat dikirim",
  revision: 1,
  createdAt: now(),
});
it("penilaian tidak menganggap semua surat perlu balasan; penutupan membutuhkan alasan dan snapshot PIC tetap", async () => {
  await expect(assertReplyClosed("mail-source")).resolves.toBeUndefined();
  let a = await assignment();
  await expect(assertReplyClosed(a.id)).rejects.toThrow(/terbuka/);
  await db.users.update("user-4", { name: "Nama berubah", active: false });
  expect((await db.replyAssignments.get(a.id))?.picName).toBe("Citra Demo");
  await expect(
    setReplyAssignment(
      { ...a, decision: "Tidak perlu balasan", reason: "" },
      a.revision,
      "user-1",
    ),
  ).rejects.toThrow(/Alasan/);
  a = await setReplyAssignment(
    {
      ...a,
      decision: "Tidak perlu balasan",
      reason: "Cukup informasi tanpa jawaban",
    },
    a.revision,
    "user-1",
  );
  await expect(assertReplyClosed(a.id)).resolves.toBeUndefined();
  expect(await db.activities.filter((e) => e.letterId === a.id).count()).toBe(
    2,
  );
});
it("Buat Balasan idempoten, sumber/tujuan terisi, lampiran hanya dipilih, tambahan dan multi referensi eksplisit", async () => {
  await assignment();
  await db.attachments.add({
    id: "source-file",
    letterId: "mail-source",
    name: "asli.txt",
    type: "text/plain",
    blob: new Blob(["asli"]),
  });
  await db.letters.update("mail-source", { attachmentIds: ["source-file"] });
  const [a, b] = await Promise.all([
    createReplyDraft("mail-source", "template-5", "user-4"),
    createReplyDraft("mail-source", "template-5", "user-4"),
  ]);
  expect(a.id).toBe(b.id);
  expect(a.attachmentIds).toEqual([]);
  expect(a.content.referenceText).toContain("SOURCE/1");
  const extra = await createReplyDraft(
    "mail-source",
    "template-5",
    "user-4",
    true,
    "double-request",
    ["source-file"],
  );
  const replay = await createReplyDraft(
    "mail-source",
    "template-5",
    "user-4",
    true,
    "double-request",
    ["source-file"],
  );
  expect(extra.id).toBe(replay.id);
  expect(extra.attachmentIds[0]).not.toBe("source-file");
  let d = await updateDraftLinks(
    extra.id,
    extra.revision,
    ["mail-source", "letter-1"],
    "user-4",
  );
  expect(d.incomingIds).toHaveLength(2);
  d = await updateDraftLinks(d.id, d.revision, ["mail-source"], "user-4");
  expect(await db.letters.get("letter-1")).toBeTruthy();
});
it("alur koreksi, persetujuan, nomor, dua tujuan, satu diterima, arsip dan ZIP seluruh bukti", async () => {
  let d = await draft();
  d = await draftAction(d.id, d.revision, "submit", "user-4", "", ["user-3"]);
  d = await draftAction(
    d.id,
    d.revision,
    "return",
    "user-3",
    "Perbaiki bagian isi",
  );
  d = await saveDraft(
    d.id,
    d.revision,
    { ...d.content, body: "Jawaban direvisi oleh penyusun." },
    "user-4",
  );
  d = await approve(d);
  expect(replyStage("mail-source", [d], [], [])).toBe("Siap diterbitkan");
  d = await draftAction(d.id, d.revision, "number", "user-1");
  await addDispatchTarget(
    d.outgoingId!,
    "Tujuan kedua",
    "Alamat 2",
    "user-1",
    "second",
  );
  let ts = await db.dispatchTargets.toArray();
  const main = ts.find(
    (t) => t.outgoingId === d.outgoingId && t.id !== "second",
  )!;
  await recordDispatch(shipping(d.outgoingId!, main.id), "user-1", [
    new File(["BUKTI"], "bukti.txt", { type: "text/plain" }),
  ]);
  expect(
    replyStage("mail-source", [d], ts, await db.dispatches.toArray()),
  ).toBe("Belum tercatat dikirim");
  await expect(
    archiveMail(d.outgoingId!, "user-1", "Lemari A"),
  ).rejects.toThrow();
  await recordDispatch(shipping(d.outgoingId!, "second"), "user-1");
  const first = (await db.dispatches.where({ targetId: main.id }).first())!;
  await receiveDispatch(first.id, first.revision, now(), "user-1", [
    new File(["TERIMA"], "terima.txt"),
  ]);
  expect(targetStatus(main, await db.dispatches.toArray())).toBe("Diterima");
  expect(
    targetStatus(
      ts.find((t) => t.id === "second")!,
      await db.dispatches.toArray(),
    ),
  ).toBe("Tercatat dikirim");
  d = (await db.drafts.get(d.id))!;
  expect(
    replyStage("mail-source", [d], ts, await db.dispatches.toArray()),
  ).toBe("Selesai");
  await archiveMail(d.outgoingId!, "user-1", "Lemari A");
  const pkg = await validateFullBackup(await createFullBackup());
  expect(pkg.manifest.schemaVersion).toBe(6);
  expect(pkg.tables.dispatches).toHaveLength(2);
  await findConflicts(pkg);
  await restoreFullBackup(pkg, "replace", {});
  expect(await db.dispatches.count()).toBe(2);
  const proof = (await db.dispatches.get(first.id))!.proofIds[0];
  expect(await (await db.attachments.get(proof))!.blob.text()).toBe("BUKTI");
  expect((await db.outgoing.get(d.outgoingId!))!.physicalLocation).toBe(
    "Lemari A",
  );
});
it("pemberian nomor dua tab atomik dan nomor batal tidak digunakan ulang, termasuk konflik manual", async () => {
  let a = await issue();
  let b = await duplicateMail(a.id, "user-4");
  b = await approve(b);
  const result = await Promise.allSettled([
    draftAction(b.id, b.revision, "number", "user-1", "CUSTOM/1"),
    draftAction(b.id, b.revision, "number", "user-1", "CUSTOM/1"),
  ]);
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  await cancelMailNumber(a.content.number, "user-1", "Kesalahan tujuan");
  const n = (await db.mailNumbers.get(a.content.number))!;
  expect(n.state).toBe("Dibatalkan");
  let c = await duplicateMail(b.id, "user-4");
  c = await approve(c);
  await expect(
    draftAction(c.id, c.revision, "number", "user-1", n.id),
  ).rejects.toThrow(/digunakan/);
  expect((await db.drafts.get(c.id))!.stage).toBe("Penomoran");
});
it("pola tanpa sequence tidak menggantung dan nomor paralel dokumen berbeda tetap unik", async () => {
  let a = await draft(),
    b = await duplicateMail(a.id, "user-4");
  a = await approve(a);
  b = await approve(b);
  await db.settings.update("main", { mailNumberPattern: "TETAP" });
  await expect(
    draftAction(a.id, a.revision, "number", "user-1"),
  ).rejects.toThrow(/seq/);
  await db.settings.update("main", {
    mailNumberPattern: "{seq}/{month}/{year}",
  });
  const [x, y] = await Promise.all([
    draftAction(a.id, a.revision, "number", "user-1"),
    draftAction(b.id, b.revision, "number", "user-1"),
  ]);
  expect(x.content.number).not.toBe(y.content.number);
});
it("isi disetujui berubah membatalkan persetujuan; surat terbit terkunci dan revisi mempertahankan nomor lama", async () => {
  let d = await draft();
  d = await approve(d);
  d = await saveDraft(
    d.id,
    d.revision,
    { ...d.content, body: "Perubahan sebelum terbit" },
    "user-4",
  );
  expect(d.approvedVersion).toBeUndefined();
  d = await approve(d);
  d = await draftAction(d.id, d.revision, "number", "user-1");
  const old = d.outgoingId,
    num = d.content.number;
  await expect(
    saveDraft(
      d.id,
      d.revision,
      { ...d.content, body: "Edit diam-diam" },
      "user-4",
    ),
  ).rejects.toThrow(/dikunci/);
  d = await reviseMail(d.id, d.revision, "user-4", "Koreksi isi surat");
  expect(d.content.number).toBe("");
  expect(d.approvedVersion).toBeUndefined();
  expect((await db.outgoing.get(old!))!.number).toBe(num);
  expect(await db.mailNumbers.get(num)).toBeTruthy();
});
it("placeholder, lampiran hilang, jumlah salah, tanggal dan referensi palsu memblokir pengajuan", async () => {
  let d = await draft();
  for (const patch of [
    { body: "[isi sendiri]" },
    { signer: "" },
    { attachmentCount: "2" },
    { referenceText: "surat lain", date: "2099-01-01" },
  ]) {
    d = await saveDraft(d.id, d.revision, { ...d.content, ...patch }, "user-4");
    await expect(
      draftAction(d.id, d.revision, "submit", "user-4", "", ["user-3"]),
    ).rejects.toThrow();
    d = await saveDraft(
      d.id,
      d.revision,
      {
        ...d.content,
        body: "Isi lengkap",
        signer: "Pejabat",
        attachmentCount: "0",
        date: today(),
      },
      "user-4",
    );
  }
  await db.drafts.update(d.id, { attachmentIds: ["missing"] });
  await expect(
    draftAction(d.id, d.revision, "submit", "user-4", "", ["user-3"]),
  ).rejects.toThrow(/Lampiran hilang/);
});
it("konflik revision menolak input lama; quota gagal tidak membuat versi atau Blob parsial", async () => {
  let d = await draft(),
    stale = d;
  d = await saveDraft(
    d.id,
    d.revision,
    { ...d.content, body: "Tab pertama" },
    "user-4",
  );
  await expect(
    saveDraft(
      stale.id,
      stale.revision,
      { ...stale.content, body: "Tab lama" },
      "user-4",
    ),
  ).rejects.toThrow(/Konflik/);
  const count = await db.draftVersions.count();
  const spy = vi
    .spyOn(db.attachments, "add")
    .mockRejectedValueOnce(new DOMException("Penuh", "QuotaExceededError"));
  await expect(
    changeDraftAttachment(d.id, d.revision, "user-4", [
      new File(["a"], "a.txt"),
    ]),
  ).rejects.toThrow(/Penuh/);
  spy.mockRestore();
  expect((await db.drafts.get(d.id))!.revision).toBe(d.revision);
  expect(await db.draftVersions.count()).toBe(count);
});
it("lampiran pengganti dan urutan punya riwayat; restore versi membuat versi baru dengan referensi dan berkas awal", async () => {
  let d = await draft();
  d = await changeDraftAttachment(d.id, d.revision, "user-4", [
    new File(["LAMA"], "a.txt"),
    new File(["B"], "b.txt"),
  ]);
  const v = d.version,
    old = d.attachmentIds[0];
  d = await changeDraftAttachment(
    d.id,
    d.revision,
    "user-4",
    [new File(["BARU"], "a-baru.txt")],
    old,
  );
  expect(await (await db.attachments.get(old))!.blob.text()).toBe("LAMA");
  d = await restoreDraftVersion(
    d.id,
    v,
    d.revision,
    "user-4",
    "Kembali berkas lama",
  );
  expect(d.version).toBeGreaterThan(v);
  expect(d.attachmentIds[0]).toBe(old);
  const pkg = await validateFullBackup(await createFullBackup());
  expect(
    pkg.tables.draftVersions.some((v) => v.attachmentIds?.includes(old)),
  ).toBe(true);
});
it("percobaan gagal dan dikirim ulang terpisah; penerimaan tidak mendahului kirim dan hanya mengubah satu tujuan", async () => {
  const d = await issue(),
    t = (await db.dispatchTargets
      .where({ outgoingId: d.outgoingId! })
      .first())!;
  const a = shipping(d.outgoingId!, t.id);
  a.status = "Gagal dikirim";
  a.note = "Alamat tidak ditemukan";
  await recordDispatch(a, "user-1");
  expect(targetStatus(t, await db.dispatches.toArray())).toBe("Gagal dikirim");
  const b = shipping(d.outgoingId!, t.id);
  b.status = "Dikirim ulang";
  await recordDispatch(b, "user-1");
  await recordDispatch(b, "user-1");
  expect(await db.dispatches.count()).toBe(2);
  expect(targetStatus(t, await db.dispatches.toArray())).toBe("Dikirim ulang");
  await expect(
    receiveDispatch(b.id, 1, "2000-01-01T00:00:00.000Z", "user-1"),
  ).rejects.toThrow(/konsisten/);
  await receiveDispatch(b.id, 1, now(), "user-1");
  await expect(receiveDispatch(b.id, 1, now(), "user-1")).rejects.toThrow(
    /Konflik/,
  );
});
it("DOCX memakai teks editable, markup dan tabel yang sama, A4 dan font hitam", async () => {
  const d = await draft();
  const blob = await draftDocx(d.kind, d.content);
  const entries = unzipSync(new Uint8Array(await blob.arrayBuffer())),
    xml = strFromU8(entries["word/document.xml"]);
  expect(xml).toContain("Jawaban");
  expect(xml).toContain("<w:tbl>");
  expect(xml).toContain("w:b");
  expect(xml).toContain("11906");
  expect(strFromU8(entries["word/styles.xml"])).toContain("000000");
  expect(xml).not.toContain("<w:drawing>");
});
it("impor menolak nomor lintas pemilik, bukti hilang dan hubungan rusak sebelum menulis", async () => {
  const d = await issue();
  const p = await validateFullBackup(await createFullBackup());
  let bad = structuredClone(p.tables);
  bad.outgoing.push({
    ...bad.outgoing.find((o) => o.id === d.outgoingId)!,
    id: "clash",
  });
  expect(() => validateReferences(bad, p.attachments)).toThrow(/Konflik nomor/);
  bad = structuredClone(p.tables);
  bad.mailNumbers[0].outgoingId = "missing";
  expect(() => validateReferences(bad, p.attachments)).toThrow();
  bad = structuredClone(p.tables);
  bad.mailLinks.push({
    id: "bad",
    fromId: "mail-source",
    toId: "missing",
    reason: "alasan",
    userId: "user-1",
    createdAt: now(),
  });
  expect(() => validateReferences(bad, p.attachments)).toThrow(/Referensi/);
});
it("melepas rangkaian tidak menghapus sumber dan agenda tetap unik dalam register/tahun", async () => {
  await linkFollowup("mail-source", "letter-1", "user-1", "Surat lanjutan");
  await linkFollowup("mail-source", "letter-1", "user-1", "Lepas tautan", true);
  expect(await db.mailLinks.count()).toBe(0);
  expect(await db.letters.get("letter-1")).toBeTruthy();
  const l = (await db.letters.get("mail-source"))!;
  await expect(
    register({ ...l, id: "duplicate-agenda" }, [], "Admin"),
  ).rejects.toThrow(/agenda/);
});
it("paket skema 5 tanpa tabel surat terpadu tetap dapat dibaca", async () => {
  const entries = unzipSync(
      new Uint8Array(await (await createFullBackup()).arrayBuffer()),
    ),
    manifest = JSON.parse(strFromU8(entries["manifest.json"])),
    metadata = JSON.parse(strFromU8(entries["metadata.json"]));
  for (const k of [
    "replyAssignments",
    "mailNumbers",
    "dispatchTargets",
    "dispatches",
    "mailLinks",
  ]) {
    delete metadata.tables[k];
    delete manifest.counts[k];
  }
  manifest.schemaVersion = 5;
  entries["metadata.json"] = strToU8(JSON.stringify(metadata));
  manifest.metadata.bytes = entries["metadata.json"].length;
  manifest.metadata.sha256 = await checksum(entries["metadata.json"]);
  entries["manifest.json"] = strToU8(JSON.stringify(manifest));
  const p = await validateFullBackup(
    new Blob([Uint8Array.from(zipSync(entries))]),
  );
  expect(p.tables.mailNumbers).toEqual([]);
  expect(p.tables.letters.length).toBeGreaterThan(0);
});
it("migrasi database v5 mempertahankan dokumen/Blob tanpa membuat penilaian atau pengiriman palsu", async () => {
  const name = "mail-migration-" + id(),
    legacy = new Dexie(name);
  legacy.version(5).stores({ letters: "id", attachments: "id" });
  await legacy.open();
  await legacy.table("letters").add({ id: "old", subject: "Lama" });
  await legacy
    .table("attachments")
    .add({ id: "old-file", letterId: "old", blob: new Blob(["KEEP"]) });
  legacy.close();
  const upgraded = createDatabase(name);
  await upgraded.open();
  expect((await upgraded.letters.get("old"))!.subject).toBe("Lama");
  expect(await (await upgraded.attachments.get("old-file"))!.blob.text()).toBe(
    "KEEP",
  );
  expect(await upgraded.replyAssignments.count()).toBe(0);
  expect(await upgraded.dispatches.count()).toBe(0);
  upgraded.close();
  await Dexie.delete(name);
});
it("pratinjau impor mendeteksi nomor sama dengan ID berbeda; merge ditolak dan replace menyimpan recovery", async () => {
  const d = await issue(),
    pkg = await validateFullBackup(await createFullBackup());
  const o = (await db.outgoing.get(d.outgoingId!))!;
  await db.outgoing.add({
    ...o,
    id: "perangkat-lain",
    draftId: undefined,
    integrated: false,
  });
  await findConflicts(pkg);
  expect(pkg.numberConflicts?.join(" ")).toContain(d.content.number);
  await expect(restoreFullBackup(pkg, "merge", {})).rejects.toThrow(
    /Konflik nomor antarperangkat/,
  );
  await restoreFullBackup(pkg, "replace", {});
  expect(await db.outgoing.get("perangkat-lain")).toBeUndefined();
  expect(await db.recovery.count()).toBe(1);
});
it("menambah tujuan membuka status pengiriman kembali; penerimaan yang sudah tercatat tidak dihapus percobaan baru", async () => {
  let d = await issue();
  const t = (await db.dispatchTargets
    .where({ outgoingId: d.outgoingId! })
    .first())!;
  const a = shipping(d.outgoingId!, t.id);
  await recordDispatch(a, "user-1");
  expect((await db.drafts.get(d.id))!.stage).toBe("Tercatat dikirim");
  await receiveDispatch(a.id, 1, now(), "user-1");
  const failed = shipping(d.outgoingId!, t.id);
  failed.status = "Gagal dikirim";
  failed.note = "Percobaan tambahan gagal";
  await recordDispatch(failed, "user-1");
  expect(targetStatus(t, await db.dispatches.toArray())).toBe("Diterima");
  await addDispatchTarget(d.outgoingId!, "Tujuan baru", "Alamat", "user-1");
  d = (await db.drafts.get(d.id))!;
  expect(d.stage).toBe("Pengiriman");
  expect((await db.outgoing.get(d.outgoingId!))!.status).toBe(
    "Pengiriman sebagian",
  );
  expect(
    replyStage(
      "mail-source",
      [d],
      await db.dispatchTargets.toArray(),
      await db.dispatches.toArray(),
    ),
  ).toBe("Belum tercatat dikirim");
});
