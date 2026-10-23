import { db, dataMode } from "../storage/db";
import { samplePdf } from "../storage/seed";
import { register } from "./workflow";
import { createDraft, saveDraft } from "./drafts";
import { id, now, today } from "../utils";
import type {
  OfficialDraft,
  ReplyAssignment,
  MailDispatch,
  DispatchTarget,
  DraftContent,
  DraftStage,
} from "../types";
import { z } from "zod";
export const replyStages = [
  "Belum ada konsep",
  "Sedang disusun",
  "Dalam pemeriksaan",
  "Perlu perbaikan",
  "Siap diterbitkan",
  "Belum tercatat dikirim",
  "Selesai",
] as const;
const editorRoles = ["Admin Sistem", "Petugas Urtu/Administrasi"];
async function actor(uid: string, administrative = false) {
  const u = await db.users.get(uid);
  if (!u?.active || (administrative && !editorRoles.includes(u.role)))
    throw Error("Pilih petugas administrasi atau admin aktif.");
  return u;
}
export async function mailAudit(
  letterId: string,
  uid: string,
  text: string,
  before?: unknown,
  after?: unknown,
) {
  const u = await actor(uid);
  await db.activities.add({
    id: id(),
    letterId,
    userId: uid,
    author: u.name,
    text,
    createdAt: now(),
    before,
    after,
  });
}
export async function setReplyAssignment(
  value: ReplyAssignment,
  expected: number,
  uid: string,
) {
  return db.transaction("rw", db.tables, async () => {
    await actor(uid, true);
    const l = await db.letters.get(value.id),
      old = await db.replyAssignments.get(value.id);
    if (!l || (old?.revision || 0) !== expected)
      throw Error(
        "Surat hilang atau konflik revisi penilaian. Muat data terbaru.",
      );
    if (!value.reason.trim())
      throw Error("Alasan penilaian/penutupan wajib diisi.");
    if (
      !["Perlu penilaian", "Perlu balasan", "Tidak perlu balasan"].includes(
        value.decision,
      )
    )
      throw Error("Penilaian tidak valid.");
    let picName = "",
      unitName = "";
    if (value.decision === "Perlu balasan") {
      const pic = await actor(value.picId),
        unit = await db.units.get(value.unitId),
        reviewer = await actor(value.reviewerId);
      if (
        !unit?.active ||
        pic.unitId !== unit.id ||
        !reviewer.active ||
        !z.iso.date().safeParse(value.deadline).success ||
        !value.instructions.trim()
      )
        throw Error(
          "PIC sesuai unit, tenggat, arahan, dan pemeriksa wajib lengkap.",
        );
      picName = pic.name;
      unitName = unit.name;
    }
    const next = {
      ...value,
      picName,
      unitName,
      revision: expected + 1,
      userId: uid,
      updatedAt: now(),
    };
    await db.replyAssignments.put(next);
    await mailAudit(
      l.id,
      uid,
      "Penilaian kebutuhan balasan: " + value.reason,
      old,
      next,
    );
    return next;
  });
}
export async function createReplyDraft(
  letterId: string,
  templateId: string,
  uid: string,
  additional = false,
  requestId: string = id(),
  selectedFiles: string[] = [],
) {
  return db.transaction("rw", db.tables, async () => {
    const u = await actor(uid),
      l = await db.letters.get(letterId);
    if (!l) throw Error("Surat sumber tidak ditemukan.");
    const replay = await db.drafts.get(requestId);
    if (replay) return replay;
    const active = (await db.drafts.toArray()).find(
      (d) =>
        d.incomingIds?.includes(letterId) &&
        !["Diarsipkan", "Tercatat dikirim"].includes(d.stage),
    );
    if (active && !additional) return active;
    const assignment = await db.replyAssignments.get(letterId);
    if (
      assignment?.decision === "Perlu balasan" &&
      uid !== assignment.picId &&
      !editorRoles.includes(u.role)
    )
      throw Error("Penyusunan untuk PIC yang ditetapkan.");
    const d = await createDraft(
      templateId,
      uid,
      assignment?.unitId || u.unitId,
    );
    await db.drafts.delete(d.id);
    await db.draftVersions.where({ draftId: d.id }).delete();
    d.id = requestId;
    d.integrated = true;
    d.incomingIds = [letterId];
    d.content = {
      ...d.content,
      to: l.sender,
      address: l.institution || "",
      subject: "Balasan: " + l.subject,
      conceptNumber: "KONSEP-" + requestId.slice(0, 8),
      referenceText: `Surat ${l.sender}, nomor ${l.number}, tanggal ${l.date}, perihal ${l.subject}.`,
      attachmentCount: String(selectedFiles.length),
      font: "Times New Roman",
      margin: "25",
    };
    d.reviewerIds = assignment?.reviewerId ? [assignment.reviewerId] : [];
    for (const aid of selectedFiles) {
      if (!l.attachmentIds.includes(aid))
        throw Error("Lampiran pilihan bukan milik sumber.");
      const a = await db.attachments.get(aid);
      if (!a) throw Error("Lampiran sumber hilang.");
      const nextId = id();
      await db.attachments.add({
        ...a,
        id: nextId,
        letterId: d.id,
        addedAt: now(),
      });
      d.attachmentIds.push(nextId);
    }
    await db.drafts.add(d);
    await snapshotDraft(d, uid, "Konsep balasan dibuat");
    await mailAudit(
      letterId,
      uid,
      "Konsep balasan dibuat; lampiran hanya disalin jika dipilih.",
      undefined,
      { draftId: d.id },
    );
    return d;
  });
}
export async function snapshotDraft(
  d: OfficialDraft,
  uid: string,
  reason: string,
) {
  const current = await db.draftVersions
    .where({ draftId: d.id, version: d.version })
    .first();
  // Content version stays stable during decisions; stage snapshots have separate decision rows.
  if (!current)
    await db.draftVersions.add({
      id: id(),
      draftId: d.id,
      version: d.version,
      content: d.content,
      authorId: uid,
      reason,
      stage: d.stage,
      attachmentIds: [...d.attachmentIds],
      incomingIds: [...(d.incomingIds || [])],
      createdAt: now(),
    });
}
export async function checkDraftForSubmission(d: OfficialDraft) {
  const c = d.content;
  const errors: string[] = [];
  if (!c.to.trim() || !c.subject.trim() || !c.body.trim() || !c.signer.trim())
    errors.push("Tujuan, perihal, isi, dan penandatangan wajib lengkap");
  if (
    /\[[^\]]+\]|\{[^}]+\}|\b(TODO|TBD|XXX)\b/i.test(Object.values(c).join(" "))
  )
    errors.push("Masih ada placeholder");
  if (!z.iso.date().safeParse(c.date).success || c.date > today())
    errors.push("Tanggal surat harus valid dan tidak di masa depan");
  if (!d.incomingIds?.length && c.referenceText?.trim())
    errors.push("Pilih referensi surat berdasarkan ID");
  for (const lid of d.incomingIds || []) {
    const l = await db.letters.get(lid);
    if (!l) errors.push("Referensi surat hilang");
    else if (c.date < l.date)
      errors.push("Tanggal balasan mendahului surat sumber");
  }
  if (
    c.attachmentCount !== undefined &&
    (!/^\d+$/.test(c.attachmentCount) ||
      Number(c.attachmentCount) !== d.attachmentIds.length)
  )
    errors.push("Jumlah lampiran disebut tidak sesuai berkas");
  for (const aid of d.attachmentIds)
    if (!(await db.attachments.get(aid)))
      errors.push("Lampiran hilang: " + aid);
  if (errors.length) throw Error(errors.join(". ") + ".");
}
export async function issueMailNumber(
  d: OfficialDraft,
  uid: string,
  manualNumber = "",
) {
  await actor(uid, true);
  await checkDraftForSubmission(d);
  const settings = await db.settings.get("main");
  const unit = await db.units.get(d.unitId);
  const roman = [
    "I",
    "II",
    "III",
    "IV",
    "V",
    "VI",
    "VII",
    "VIII",
    "IX",
    "X",
    "XI",
    "XII",
  ][Number(d.content.date.slice(5, 7)) - 1];
  const key = `mail:${d.unitId}:${d.kind}:${d.content.date.slice(0, 4)}`;
  let n = (await db.sequences.get(key))?.value || 0;
  const pattern =
    settings?.mailNumberPattern || "B/{seq}/{kind}/{unit}/{month}/{year}";
  if (!manualNumber.trim() && !pattern.includes("{seq}"))
    throw Error("Pola nomor otomatis harus memiliki {seq}.");
  const render = () =>
    pattern
      .replaceAll("{seq}", String(n).padStart(4, "0"))
      .replaceAll("{kind}", d.kind)
      .replaceAll("{unit}", unit?.name || d.unitId)
      .replaceAll("{month}", roman)
      .replaceAll("{year}", d.content.date.slice(0, 4));
  let number = manualNumber.trim();
  do {
    n++;
    if (!manualNumber.trim()) number = render();
    else break;
  } while (await numberUsed(number));
  if (!number || /[{}]/.test(number) || (await numberUsed(number)))
    throw Error(
      "Nomor resmi sudah digunakan/dibatalkan atau pola tidak valid.",
    );
  if (!manualNumber.trim() && !pattern.includes("{seq}"))
    throw Error("Pola nomor otomatis harus memiliki {seq}.");
  const outgoingId = `mail-out:${d.id}:${d.version}`;
  await db.mailNumbers.add({
    id: number,
    draftId: d.id,
    version: d.version,
    outgoingId,
    createdAt: now(),
    userId: uid,
    state: "Digunakan",
    reason: "",
  });
  await db.sequences.put({ id: key, value: n });
  await db.outgoing.add({
    id: outgoingId,
    integrated: true,
    draftId: d.id,
    draftVersion: d.version,
    incomingId: d.incomingIds?.[0],
    incomingIds: d.incomingIds,
    subject: d.content.subject,
    recipient: d.content.to,
    number,
    status: "Belum dikirim",
    unitId: d.unitId,
    kind: d.kind,
    classification: "Biasa",
    documentDate: d.content.date,
    attachmentIds: [...d.attachmentIds],
    createdAt: now(),
    revision: 1,
  });
  d.content = { ...d.content, number };
  d.outgoingId = outgoingId;
  d.stage = "Pengiriman";
  await db.dispatchTargets.add({
    id: `${outgoingId}:utama`,
    outgoingId,
    name: d.content.to,
    address: d.content.address || "",
    createdAt: now(),
  });
}
async function numberUsed(n: string) {
  return !!(
    (await db.mailNumbers.get(n)) ||
    (await db.noteNumbers.get(n)) ||
    (await db.outgoing.filter((o) => o.number === n).first())
  );
}
export async function reviseMail(
  draftId: string,
  expected: number,
  uid: string,
  reason: string,
) {
  return db.transaction("rw", db.tables, async () => {
    await actor(uid);
    const d = await db.drafts.get(draftId);
    if (
      !d ||
      d.revision !== expected ||
      !reason.trim() ||
      !["Pengiriman", "Tercatat dikirim"].includes(d.stage)
    )
      throw Error("Pilih surat terbit terkini dan isi alasan revisi.");
    const next: OfficialDraft = {
      ...d,
      version: d.version + 1,
      revision: d.revision + 1,
      stage: "Draf",
      content: { ...d.content, number: "" },
      approvedVersion: undefined,
      reviewingVersion: undefined,
      outgoingId: undefined,
      reviewIndex: 0,
      updatedAt: now(),
    };
    await db.drafts.put(next);
    await snapshotDraft(next, uid, "Revisi surat terbit: " + reason);
    await db.draftDecisions.add({
      id: id(),
      draftId,
      version: next.version,
      action: "Revisi diterbitkan",
      userId: uid,
      note: reason,
      createdAt: now(),
    });
    return next;
  });
}
export async function duplicateMail(draftId: string, uid: string) {
  return db.transaction("rw", db.tables, async () => {
    const u = await actor(uid),
      old = await db.drafts.get(draftId);
    if (!old) throw Error("Konsep hilang.");
    const d = await createDraft(old.templateId, uid, u.unitId);
    d.integrated = true;
    d.content = {
      ...old.content,
      number: "",
      conceptNumber: "KONSEP-" + d.id.slice(0, 8),
    };
    d.incomingIds = [...(old.incomingIds || [])];
    d.supersedesId = old.id;
    for (const aid of old.attachmentIds) {
      const a = await db.attachments.get(aid);
      if (!a) throw Error("Lampiran hilang.");
      const nextId = id();
      await db.attachments.add({ ...a, id: nextId, letterId: d.id });
      d.attachmentIds.push(nextId);
    }
    await db.draftVersions.where({ draftId: d.id }).delete();
    await db.drafts.put(d);
    await snapshotDraft(d, uid, "Duplikasi konsep");
    return d;
  });
}
export async function updateDraftLinks(
  did: string,
  rev: number,
  lids: string[],
  uid: string,
) {
  return db.transaction("rw", db.tables, async () => {
    await actor(uid);
    let d = await db.drafts.get(did);
    if (!d || d.revision !== rev) throw Error("Konflik revisi.");
    if (["Pengiriman", "Tercatat dikirim", "Diarsipkan"].includes(d.stage))
      throw Error("Referensi surat terbit dikunci.");
    for (const lid of lids)
      if (!(await db.letters.get(lid))) throw Error("Surat referensi hilang.");
    const text = (await db.letters.bulkGet(lids))
      .map((l) => `${l!.number} / ${l!.date} / ${l!.subject}`)
      .join("\n");
    d = await saveDraft(
      did,
      rev,
      { ...d.content, referenceText: text },
      uid,
      "Perubahan referensi yang dipilih",
    );
    d.incomingIds = [...new Set(lids)];
    d.integrated = true;
    await db.drafts.put(d);
    await db.draftVersions
      .where({ draftId: did, version: d.version })
      .modify({ incomingIds: d.incomingIds });
    return d;
  });
}
export async function changeDraftAttachment(
  did: string,
  rev: number,
  uid: string,
  files: File[],
  replaceId = "",
  meta?: { id: string; title: string; caption: string; order: number },
) {
  return db.transaction("rw", db.tables, async () => {
    await actor(uid);
    let d = await db.drafts.get(did);
    if (!d || d.revision !== rev) throw Error("Konflik revisi lampiran.");
    if (!["Draf", "Perbaikan"].includes(d.stage))
      throw Error("Lampiran dapat diubah pada tahap draf/perbaikan.");
    if (replaceId && !d.attachmentIds.includes(replaceId))
      throw Error("Lampiran pengganti tidak cocok.");
    const aids = [...d.attachmentIds];
    for (const f of files) {
      if (f.size > 20 * 1024 * 1024)
        throw Error("Batas lampiran 20 MB per berkas.");
      const aid = id();
      await db.attachments.add({
        id: aid,
        letterId: did,
        name: f.name,
        title: f.name,
        caption: "",
        order: aids.length,
        size: f.size,
        type: f.type,
        blob: f,
        addedAt: now(),
        replacesId: replaceId || undefined,
      });
      if (replaceId) aids.splice(aids.indexOf(replaceId), 1, aid);
      else aids.push(aid);
    }
    if (meta) {
      if (!aids.includes(meta.id)) throw Error("Lampiran hilang.");
      const original = await db.attachments.get(meta.id);
      if (!original) throw Error("Lampiran hilang.");
      const nextId = id();
      await db.attachments.add({
        ...original,
        ...meta,
        id: nextId,
        replacesId: meta.id,
        addedAt: now(),
      });
      aids.splice(aids.indexOf(meta.id), 1);
      aids.splice(Math.max(0, Math.min(meta.order, aids.length)), 0, nextId);
    }
    d.attachmentIds = aids;
    d.version++;
    d.revision++;
    d.updatedAt = now();
    d.approvedVersion = undefined;
    d.reviewingVersion = undefined;
    d.content = { ...d.content, attachmentCount: String(aids.length) };
    await db.drafts.put(d);
    await snapshotDraft(
      d,
      uid,
      replaceId
        ? "Penggantian berkas, versi lama dipertahankan"
        : "Perubahan lampiran",
    );
    return d;
  });
}
export async function addReviewComment(
  did: string,
  rev: number,
  uid: string,
  section: string,
  text: string,
) {
  return db.transaction("rw", db.tables, async () => {
    const u = await actor(uid);
    const d = await db.drafts.get(did);
    if (!d || d.revision !== rev || !text.trim() || !section.trim())
      throw Error("Versi, bagian, dan catatan wajib valid.");
    if (
      u.role !== "Admin Sistem" &&
      d.reviewerIds[d.reviewIndex] !== uid &&
      u.role !== "Kepala RSAU"
    )
      throw Error("Catatan hanya untuk pemeriksa.");
    await db.draftDecisions.add({
      id: id(),
      draftId: did,
      version: d.version,
      action: "Catatan pemeriksaan",
      section,
      note: text,
      userId: uid,
      createdAt: now(),
    });
  });
}
export function draftStatus(d: OfficialDraft) {
  const map: Record<DraftStage, string> = {
    Draf: "Draf",
    Perbaikan: "Perlu perbaikan",
    Pemeriksaan: "Dalam pemeriksaan",
    Persetujuan: "Menunggu persetujuan",
    Penomoran: "Disetujui",
    Pengiriman: "Bernomor",
    "Tercatat dikirim": "Tercatat dikirim",
    Diarsipkan: "Diarsipkan",
  };
  return map[d.stage];
}
export function targetStatus(
  target: DispatchTarget,
  dispatches: MailDispatch[],
) {
  if (
    dispatches.some(
      (d) =>
        d.targetId === target.id && d.status === "Diterima" && d.receivedAt,
    )
  )
    return "Diterima";
  return (
    dispatches
      .filter((d) => d.targetId === target.id)
      .sort(
        (a, b) =>
          (b.attempt || 0) - (a.attempt || 0) ||
          b.createdAt.localeCompare(a.createdAt) ||
          b.id.localeCompare(a.id),
      )[0]?.status || "Belum dikirim"
  );
}
export function replyStage(
  lid: string,
  drafts: OfficialDraft[],
  targets: DispatchTarget[],
  dispatches: MailDispatch[],
) {
  const ds = drafts.filter((d) => d.incomingIds?.includes(lid));
  if (!ds.length) return "Belum ada konsep";
  const stages = ds.map((d) => {
    if (["Draf"].includes(d.stage)) return "Sedang disusun";
    if (d.stage === "Perbaikan") return "Perlu perbaikan";
    if (["Pemeriksaan", "Persetujuan"].includes(d.stage))
      return "Dalam pemeriksaan";
    if (d.stage === "Penomoran") return "Siap diterbitkan";
    const ts = targets.filter((t) => t.outgoingId === d.outgoingId);
    return ts.length &&
      ts.every((t) =>
        ["Tercatat dikirim", "Diterima", "Dikirim ulang"].includes(
          targetStatus(t, dispatches),
        ),
      )
      ? "Selesai"
      : "Belum tercatat dikirim";
  });
  return replyStages.find((s) => (stages as string[]).includes(s)) || "Selesai";
}
export async function assertReplyClosed(lid: string) {
  const a = await db.replyAssignments.get(lid);
  if (!a || a.decision === "Tidak perlu balasan") return;
  if (
    a.decision === "Perlu penilaian" ||
    replyStage(
      lid,
      await db.drafts.toArray(),
      await db.dispatchTargets.toArray(),
      await db.dispatches.toArray(),
    ) !== "Selesai"
  )
    throw Error(
      "Kewajiban balasan masih terbuka. Catat semua tujuan dikirim atau tutup tanpa balasan dengan alasan.",
    );
}
export async function addDispatchTarget(
  outgoingId: string,
  name: string,
  address: string,
  uid: string,
  requestId: string = id(),
) {
  return db.transaction("rw", db.tables, async () => {
    await actor(uid, true);
    const o = await db.outgoing.get(outgoingId);
    if (!o?.number || o.status === "Diarsipkan" || o.cancelledReason)
      throw Error("Pilih surat terbit aktif.");
    if (!name.trim()) throw Error("Tujuan wajib diisi.");
    if (await db.dispatchTargets.get(requestId)) return;
    await db.dispatchTargets.add({
      id: requestId,
      outgoingId,
      name,
      address,
      createdAt: now(),
    });
    await db.outgoing.update(o.id, {
      status: "Pengiriman sebagian",
      sentAt: undefined,
      revision: (o.revision || 1) + 1,
    });
    if (o.draftId) {
      const d = await db.drafts.get(o.draftId);
      if (d?.outgoingId === o.id)
        await db.drafts.update(d.id, {
          stage: "Pengiriman",
          revision: d.revision + 1,
          updatedAt: now(),
        });
    }
    await mailAudit(
      o.incomingId || "",
      uid,
      "Tujuan pengiriman ditambahkan",
      undefined,
      { targetId: requestId, name, address },
    );
  });
}
export async function recordDispatch(
  value: MailDispatch,
  uid: string,
  files: File[] = [],
) {
  return db.transaction("rw", db.tables, async () => {
    const u = await actor(uid, true);
    if (await db.dispatches.get(value.id)) return;
    const target = await db.dispatchTargets.get(value.targetId),
      o = await db.outgoing.get(value.outgoingId);
    if (
      !target ||
      target.outgoingId !== o?.id ||
      o.status === "Diarsipkan" ||
      o.cancelledReason ||
      !o.number
    )
      throw Error("Tujuan tidak valid atau surat dikunci.");
    if (
      !z.iso.datetime({ offset: true }).safeParse(value.sentAt).success ||
      value.sentAt > now() ||
      !value.recipient.trim()
    )
      throw Error(
        "Penerima dan waktu pengiriman yang sudah terjadi wajib valid.",
      );
    if (
      !["Tercatat dikirim", "Gagal dikirim", "Dikirim ulang"].includes(
        value.status,
      )
    )
      throw Error("Status percobaan tidak valid.");
    if (value.status === "Gagal dikirim" && !value.note.trim())
      throw Error("Alasan kegagalan wajib diisi.");
    if (
      value.status === "Dikirim ulang" &&
      !(await db.dispatches.where({ targetId: target.id }).count())
    )
      throw Error("Pengiriman ulang memerlukan percobaan sebelumnya.");
    const proofIds: string[] = [];
    for (const f of files) {
      if (f.size > 20 * 1024 * 1024)
        throw Error("Batas bukti 20 MB per berkas.");
      const aid = id();
      await db.attachments.add({
        id: aid,
        letterId: o.id,
        name: f.name,
        type: f.type,
        blob: f,
        title: f.name,
        size: f.size,
        addedAt: now(),
      });
      proofIds.push(aid);
    }
    const attempt =
      (await db.dispatches.where({ targetId: target.id }).count()) + 1;
    await db.dispatches.add({
      ...value,
      attempt,
      userId: uid,
      userName: u.name,
      proofIds,
      receiptIds: [],
      receivedAt: "",
      revision: 1,
      createdAt: now(),
    });
    const all = await db.dispatches.where({ outgoingId: o.id }).toArray(),
      ts = await db.dispatchTargets.where({ outgoingId: o.id }).toArray();
    const complete = ts.every((t) =>
      ["Diterima", "Tercatat dikirim", "Dikirim ulang"].includes(
        targetStatus(t, all),
      ),
    );
    await db.outgoing.update(o.id, {
      status: complete ? "Tercatat dikirim" : "Pengiriman sebagian",
      sentAt: complete ? value.sentAt : undefined,
      revision: (o.revision || 1) + 1,
    });
    if (o.draftId) {
      const d = await db.drafts.get(o.draftId);
      if (d?.outgoingId === o.id)
        await db.drafts.update(d.id, {
          stage: complete ? "Tercatat dikirim" : "Pengiriman",
          revision: d.revision + 1,
          updatedAt: now(),
        });
    }
    await mailAudit(
      o.incomingId || "",
      uid,
      "Catatan pengiriman manual",
      undefined,
      { dispatchId: value.id, status: value.status, targetId: target.id },
    );
  });
}
export async function receiveDispatch(
  did: string,
  expected: number,
  date: string,
  uid: string,
  files: File[] = [],
) {
  return db.transaction("rw", db.tables, async () => {
    await actor(uid, true);
    const d = await db.dispatches.get(did);
    if (!d || d.revision !== expected)
      throw Error("Konflik revisi penerimaan.");
    if (
      d.status === "Gagal dikirim" ||
      !z.iso.datetime({ offset: true }).safeParse(date).success ||
      date < d.sentAt ||
      date > now()
    )
      throw Error("Tanggal penerimaan tidak konsisten.");
    const receiptIds = [...d.receiptIds];
    for (const f of files) {
      if (f.size > 20 * 1024 * 1024) throw Error("Bukti maksimal 20 MB.");
      const aid = id();
      await db.attachments.add({
        id: aid,
        letterId: d.outgoingId,
        name: f.name,
        type: f.type,
        blob: f,
        size: f.size,
        addedAt: now(),
      });
      receiptIds.push(aid);
    }
    await db.dispatches.update(did, {
      status: "Diterima",
      receivedAt: date,
      receiptIds,
      revision: d.revision + 1,
    });
    await mailAudit("", uid, "Penerimaan dicatat manual", d, {
      receivedAt: date,
      dispatchId: did,
    });
  });
}
export async function cancelMailNumber(
  number: string,
  uid: string,
  reason: string,
) {
  return db.transaction("rw", db.tables, async () => {
    await actor(uid, true);
    const n = await db.mailNumbers.get(number);
    if (!n || !reason.trim()) throw Error("Nomor dan alasan wajib tersedia.");
    await db.mailNumbers.update(number, { state: "Dibatalkan", reason });
    await db.outgoing.update(n.outgoingId, {
      status: "Dibatalkan",
      cancelledReason: reason,
    });
    const d = await db.drafts.get(n.draftId);
    if (d?.outgoingId === n.outgoingId) {
      const next: OfficialDraft = {
        ...d,
        version: d.version + 1,
        revision: d.revision + 1,
        stage: "Draf",
        content: { ...d.content, number: "" },
        approvedVersion: undefined,
        reviewingVersion: undefined,
        outgoingId: undefined,
        reviewIndex: 0,
        updatedAt: now(),
      };
      await db.drafts.put(next);
      await snapshotDraft(next, uid, "Nomor dibatalkan: " + reason);
    }
    await mailAudit("", uid, "Pembatalan nomor tanpa penggunaan ulang", n, {
      reason,
    });
  });
}
export async function archiveMail(
  outgoingId: string,
  uid: string,
  location: string,
) {
  return db.transaction("rw", db.tables, async () => {
    await actor(uid, true);
    const o = await db.outgoing.get(outgoingId);
    if (!o) throw Error("Surat hilang.");
    for (const lid of o.incomingIds || []) await assertReplyClosed(lid);
    const ts = await db.dispatchTargets.where({ outgoingId }).toArray(),
      ds = await db.dispatches.where({ outgoingId }).toArray();
    if (
      !o.cancelledReason &&
      (!ts.length ||
        ts.some((t) =>
          ["Belum dikirim", "Gagal dikirim"].includes(targetStatus(t, ds)),
        ))
    )
      throw Error("Masih ada tujuan belum berhasil dikirim.");
    await db.outgoing.update(outgoingId, {
      status: "Diarsipkan",
      physicalLocation: location,
    });
    if (o.draftId) {
      const d = await db.drafts.get(o.draftId);
      if (d?.outgoingId === outgoingId)
        await db.drafts.update(d.id, {
          stage: "Diarsipkan",
          revision: d.revision + 1,
          updatedAt: now(),
        });
    }
    await mailAudit(o.incomingId || "", uid, "Surat keluar diarsipkan", o, {
      physicalLocation: location,
    });
  });
}
export async function linkFollowup(
  fromId: string,
  toId: string,
  uid: string,
  reason: string,
  remove = false,
) {
  return db.transaction("rw", db.tables, async () => {
    await actor(uid, true);
    if (
      fromId === toId ||
      !(await db.letters.get(fromId)) ||
      !(await db.letters.get(toId)) ||
      !reason.trim()
    )
      throw Error("Pilih dua surat berbeda dan isi alasan.");
    const key = fromId + ":" + toId;
    if (remove) await db.mailLinks.delete(key);
    else
      await db.mailLinks.put({
        id: key,
        fromId,
        toId,
        userId: uid,
        reason,
        createdAt: now(),
      });
    await mailAudit(
      fromId,
      uid,
      remove
        ? "Hubungan dilepas: " + reason
        : "Surat lanjutan ditautkan: " + reason,
    );
  });
}

export async function prepareMailExample(uid: string) {
  if (dataMode !== "demo")
    throw Error("Contoh hanya tersedia di database contoh terpisah.");
  return db.transaction("rw", db.tables, async () => {
    const u = await actor(uid, true),
      lid = "mail-example-source";
    if (!(await db.letters.get(lid)))
      await register(
        {
          id: lid,
          agenda: "",
          sender: "Instansi Pengirim (CONTOH)",
          institution: "Instansi simulasi",
          physicalLocation: "Lemari contoh",
          number: "SUMBER/CONTOH/1",
          date: today(),
          received: today(),
          subject: "Permintaan jawaban — CONTOH/DEMO",
          kind: "Surat dinas",
          urgency: "Biasa",
          classification: "Biasa",
          summary: "Data fiktif untuk mempelajari alur surat terpadu.",
          status: "Terdaftar",
          targetUnitId: "unit-10",
          attachmentIds: [],
          createdAt: now(),
        },
        [
          new File(
            [samplePdf("Surat sumber CONTOH")],
            "surat-sumber-contoh.pdf",
            { type: "application/pdf" },
          ),
        ],
        u.name,
        true,
      );
    if (!(await db.replyAssignments.get(lid)))
      await setReplyAssignment(
        {
          id: lid,
          decision: "Perlu balasan",
          picId: "user-1",
          picName: "",
          unitId: "unit-10",
          unitName: "",
          deadline: today(),
          instructions:
            "Susun jawaban contoh berdasarkan isi yang dimasukkan sendiri.",
          reviewerId: "user-2",
          reason: "Skenario uji coba pengguna — CONTOH",
          revision: 0,
          updatedAt: "",
          userId: uid,
        },
        0,
        uid,
      );
    const d = await createReplyDraft(
      lid,
      "template-5",
      uid,
      false,
      "mail-example-draft",
    );
    return d;
  });
}
