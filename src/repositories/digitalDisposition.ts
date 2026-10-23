import { z } from "zod";
import { createNote, saveNote } from "./nota";
import { saveAgenda } from "./agenda";
import { db } from "../storage/db";
import { id, now, today } from "../utils";
import { aggregate } from "./workflow";
import { dispositionContentSchema } from "./dispositionSchemas";
import type {
  Disposition,
  DispositionContent,
  DispositionDraft,
  DigitalRecipient,
  Task,
  CompletionReport,
  User,
} from "../types";
export const noteSuggestions = [
  "Pelajari dan laporkan hasilnya.",
  "Koordinasikan dengan unit terkait.",
  "Siapkan bahan untuk pembahasan.",
  "Tunjuk personel untuk mewakili dan laporkan hasil kegiatan.",
];
export const isOpen = (t: Task) =>
  !t.retired && !["Selesai", "Dibatalkan"].includes(t.status);
export const deadlineState = (t: Task, date = today()) =>
  !t.deadline
    ? "Tanpa tenggat"
    : !isOpen(t)
      ? "Ditutup"
      : t.deadline < date
        ? "Terlambat"
        : t.deadline === date
          ? "Jatuh tempo hari ini"
          : "Belum jatuh tempo";
export function dispositionProgress(
  d: Disposition,
  tasks: Task[],
  receipts: {
    dispositionId: string;
    readAt?: string;
    retired?: boolean;
  }[] = [],
) {
  const relevant = tasks.filter(
      (t) =>
        t.dispositionId === d.id && t.status !== "Dibatalkan" && !t.retired,
    ),
    done = relevant.filter((t) => t.status === "Selesai").length;
  const info = d.mode === "Untuk diketahui",
    reads = receipts.filter((r) => r.dispositionId === d.id && !r.retired);
  return {
    total: info ? reads.length : relevant.length,
    done: info ? reads.filter((r) => r.readAt).length : done,
    label: info ? "penerima telah membaca" : "kewajiban selesai",
    status: d.cancelled
      ? "Dibatalkan"
      : info
        ? "Untuk diketahui"
        : !relevant.length
          ? "Belum diterima"
          : relevant.every((t) => t.status === "Selesai")
            ? "Selesai"
            : relevant.some((t) => t.status === "Hasil dikirim")
              ? "Menunggu pemeriksaan"
              : relevant.every((t) =>
                    ["Belum diterima", "Belum dibaca", "Dibaca"].includes(
                      t.status,
                    ),
                  )
                ? "Belum diterima"
                : "Dalam tindak lanjut",
  };
}
async function user(uid: string) {
  const u = await db.users.get(uid);
  if (!u?.active) throw Error("Pengguna tidak aktif.");
  return u;
}
const canGive = (u: User) => ["Admin Sistem", "Kepala RSAU"].includes(u.role);
const assertRevision = (actual: number | undefined, expected: number) => {
  if ((actual || 1) !== expected)
    throw Error(
      "Konflik revisi: data berubah di tab lain. Input dipertahankan; muat versi terbaru setelah menyalin perubahan.",
    );
};
async function audit(
  d: Disposition,
  uid: string,
  event: string,
  before: unknown,
  after: unknown,
  taskId?: string,
) {
  const u = await db.users.get(uid);
  await db.activities.add({
    id: id(),
    letterId: d.letterId,
    dispositionId: d.id,
    dispositionVersion: d.version || 1,
    userId: uid,
    taskId,
    event,
    text: event,
    author: u?.name || uid,
    before,
    after,
    createdAt: now(),
  });
}
async function version(d: Disposition, uid: string, reason: string) {
  await db.dispositionVersions.add({
    id: id(),
    dispositionId: d.id,
    version: d.version || 1,
    snapshot: structuredClone(d),
    userId: uid,
    reason,
    createdAt: now(),
  });
}
async function issuer(d: Disposition, uid: string) {
  const u = await user(uid);
  if (u.role !== "Admin Sistem" && d.issuerId !== uid)
    throw Error(
      "Hanya pemberi disposisi atau admin yang dapat merevisi/membatalkan.",
    );
  return u;
}
export async function createDispositionDraft(
  letterId: string,
  uid: string,
  sourceId?: string,
) {
  return db.transaction("rw", db.tables, async () => {
    const u = await user(uid);
    if (!canGive(u))
      throw Error("Penerbitan hanya oleh Kepala RSAU atau admin.");
    const l = await db.letters.get(letterId);
    if (!l || l.status === "Diarsipkan")
      throw Error("Surat sumber tidak tersedia.");
    const old = sourceId ? await db.dispositions.get(sourceId) : undefined;
    if (
      sourceId &&
      (!old?.digital || old.cancelled || old.letterId !== letterId)
    )
      throw Error("Disposisi sumber tidak aktif.");
    if (old) await issuer(old, uid);
    const content: DispositionContent = old
      ? {
          letterId,
          giverId: old.issuerId!,
          giver: old.giver,
          giverPosition: old.issuerPosition || "",
          mode: old.mode || "Penugasan",
          recipients: structuredClone(old.recipients) as DigitalRecipient[],
          instructions: [...old.instructions],
          notes: old.notes,
          deadline: old.deadline,
          reportRequired: old.reportRequired !== false,
          review: old.review,
          reviewerId: old.reviewerId || old.issuerId!,
        }
      : {
          letterId,
          giverId: uid,
          giver: u.name,
          giverPosition:
            (await db.positions.filter((p) => p.userId === uid).first())
              ?.name || u.role,
          mode: "Penugasan",
          recipients: [],
          instructions: ["Tindak lanjuti"],
          notes: "",
          deadline: "",
          reportRequired: true,
          review: true,
          reviewerId: uid,
        };
    const d: DispositionDraft = {
      id: id(),
      authorId: uid,
      content,
      revision: 1,
      createdAt: now(),
      updatedAt: now(),
      sourceId,
      sourceRevision: old?.revision || (old ? 1 : undefined),
      reason: "",
    };
    await db.dispositionDrafts.add(d);
    return d;
  });
}
export async function saveDispositionDraft(
  did: string,
  expected: number,
  content: DispositionContent,
  reason: string,
  uid: string,
) {
  const c = dispositionContentSchema.parse(content);
  return db.transaction("rw", [db.dispositionDrafts, db.users], async () => {
    const d = await db.dispositionDrafts.get(did),
      u = await user(uid);
    if (!d || d.publishedId) throw Error("Draf tidak dapat diubah.");
    if (d.authorId !== uid && u.role !== "Admin Sistem")
      throw Error("Draf milik pengguna lain.");
    assertRevision(d.revision, expected);
    if (
      c.giverId !== d.content.giverId ||
      c.giver !== d.content.giver ||
      c.giverPosition !== d.content.giverPosition ||
      c.letterId !== d.content.letterId
    )
      throw Error(
        "Identitas pemberi dan surat sumber tidak dapat diganti diam-diam.",
      );
    if (JSON.stringify(c) === JSON.stringify(d.content) && d.reason === reason)
      return d;
    const next = {
      ...d,
      content: c,
      reason,
      revision: d.revision + 1,
      updatedAt: now(),
    };
    await db.dispositionDrafts.put(next);
    return next;
  });
}
export function dispositionWarnings(c: DispositionContent) {
  const warnings: string[] = [];
  if (
    c.instructions.includes("Arsipkan") &&
    c.instructions.some((x) =>
      ["Tindak lanjuti", "Siapkan", "Hadir"].includes(x),
    )
  )
    warnings.push(
      "Arsipkan dipilih bersama instruksi pekerjaan; pengarsipan tetap menunggu kewajiban selesai.",
    );
  if (
    c.instructions.includes("Hadir") &&
    c.instructions.includes("Untuk mewakili")
  )
    warnings.push(
      "Hadir dan Untuk mewakili dipilih bersamaan; perjelas penerima yang hadir.",
    );
  for (const r of c.recipients)
    if (r.kind !== "Tembusan" && r.instruction.trim() === "Untuk diketahui")
      warnings.push(
        r.unitName +
          ": penerima wajib hanya diberi instruksi informasi; pastikan kewajiban ini memang diperlukan.",
      );
  for (const r of c.recipients)
    if (r.kind === "Tembusan" && r.instruction !== "Untuk diketahui")
      warnings.push(
        r.unitName + ": tembusan hanya informasi, bukan tugas wajib.",
      );
  return warnings;
}
async function validatePublication(c: DispositionContent) {
  if (!c.giverPosition.trim() || !c.instructions.length || !c.recipients.length)
    throw Error("Jabatan, instruksi, dan penerima wajib terisi.");
  if (
    c.mode === "Penugasan" &&
    !c.recipients.some((r) => r.kind !== "Tembusan")
  )
    throw Error("Penugasan memerlukan minimal satu penerima wajib.");
  if (
    c.mode === "Untuk diketahui" &&
    c.recipients.some((r) => r.kind !== "Tembusan")
  )
    throw Error(
      "Untuk diketahui hanya boleh berisi penerima informasi/tembusan.",
    );
  if (
    new Set(c.recipients.map((r) => r.userId)).size !== c.recipients.length ||
    new Set(c.recipients.map((r) => r.id)).size !== c.recipients.length
  )
    throw Error("Penerima ganda atau peran bertentangan.");
  const at = today();
  for (const r of c.recipients) {
    const unit = await db.units.get(r.unitId),
      u = await user(r.userId),
      p = r.positionId ? await db.positions.get(r.positionId) : undefined;
    if (!unit?.active || u.unitId !== r.unitId)
      throw Error("Pilih pengguna aktif pada unit penerima yang sesuai.");
    if (
      r.positionId &&
      (!p ||
        p.active === false ||
        p.unitId !== r.unitId ||
        (p.userId && p.userId !== u.id) ||
        (p.assignmentStart && p.assignmentStart > at) ||
        (p.assignmentEnd && p.assignmentEnd < at))
    )
      throw Error("Jabatan/masa penugasan tidak sesuai penerima.");
    if (!r.instruction.trim())
      throw Error("Instruksi tiap penerima wajib terisi.");
    // Snapshot labels come from current master, never from editable request labels.
    r.unitName = unit.name;
    r.userName = u.name;
    r.positionName = p?.name || "Tanpa jabatan";
    r.assignmentStart = p?.assignmentStart || "";
    r.assignmentEnd = p?.assignmentEnd || "";
  }
  if (c.review) {
    const reviewer = await user(c.reviewerId);
    if (!["Admin Sistem", "Kepala RSAU", "Kepala Unit"].includes(reviewer.role))
      throw Error("Pemeriksa hasil harus pimpinan atau admin.");
  }
}
export async function publishDisposition(
  draftId: string,
  expected: number,
  uid: string,
  acknowledged = false,
) {
  return db.transaction("rw", db.tables, async () => {
    const draft = await db.dispositionDrafts.get(draftId),
      u = await user(uid);
    if (!draft || !canGive(u)) throw Error("Draf/pemberi tidak tersedia.");
    if (draft.publishedId) {
      const issued = await db.dispositions.get(draft.publishedId);
      if (!issued) throw Error("Hasil penerbitan hilang.");
      return issued;
    }
    assertRevision(draft.revision, expected);
    if (draft.authorId !== uid && u.role !== "Admin Sistem")
      throw Error("Draf milik pengguna lain.");
    const c = structuredClone(draft.content);
    if (c.mode === "Untuk diketahui") {
      c.reportRequired = false;
      c.review = false;
    }
    await validatePublication(c);
    if (dispositionWarnings(c).length && !acknowledged)
      throw Error("Periksa dan akui peringatan instruksi sebelum penerbitan.");
    const l = await db.letters.get(c.letterId);
    if (!l || l.status === "Diarsipkan")
      throw Error("Surat tidak dapat diberi disposisi.");
    const old = draft.sourceId
      ? await db.dispositions.get(draft.sourceId)
      : undefined;
    if (draft.sourceId) {
      if (!old || old.cancelled) throw Error("Sumber revisi tidak aktif.");
      await issuer(old, uid);
      assertRevision(old.revision, draft.sourceRevision!);
      if (!draft.reason.trim()) throw Error("Alasan revisi wajib diisi.");
      if (old.issuerId !== c.giverId)
        throw Error("Pemberi disposisi tidak boleh berubah.");
    }
    const d: Disposition = {
      id: old?.id || id(),
      letterId: c.letterId,
      giver: c.giver,
      issuerId: c.giverId,
      issuerPosition: c.giverPosition,
      issuedAt: old?.issuedAt || now(),
      digital: true,
      mode: c.mode,
      recipients: c.recipients,
      instructions: c.instructions,
      notes: c.notes,
      deadline: c.deadline,
      review: c.review,
      reportRequired: c.reportRequired,
      reviewerId: c.reviewerId,
      createdAt: old?.createdAt || now(),
      updatedAt: now(),
      version: (old?.version || 0) + 1,
      revision: (old?.revision || 0) + 1,
      reason: old ? draft.reason : undefined,
    };
    const existing = old
      ? await db.tasks.where({ dispositionId: d.id }).toArray()
      : [];
    if (old) {
      const previous = old.recipients as DigitalRecipient[];
      const material =
        JSON.stringify(old.instructions) !== JSON.stringify(c.instructions) ||
        old.reportRequired !== c.reportRequired ||
        old.review !== c.review ||
        old.reviewerId !== c.reviewerId;
      for (const t of existing.filter(
        (t) => !t.parentId && t.status !== "Dibatalkan",
      )) {
        const r = c.recipients.find(
          (r) =>
            r.id === t.recipientId &&
            r.userId === t.userId &&
            r.unitId === t.unitId &&
            r.kind !== "Tembusan",
        );
        if (!r) {
          await cancelBranch(
            t,
            d,
            uid,
            "Penerima dihapus pada revisi: " + draft.reason,
          );
          continue;
        }
        if (t.status === "Selesai") {
          const before = previous.find((r) => r.id === t.recipientId);
          if (
            material ||
            before?.instruction !== r.instruction ||
            before?.deadline !== r.deadline
          )
            throw Error(
              "Kewajiban selesai tidak dapat diubah; tambahkan penerima/kewajiban baru.",
            );
          continue;
        }
        const changed = material || t.instruction !== r.instruction;
        const next = {
          ...t,
          instruction: r.instruction,
          deadline: r.deadline,
          review: c.review,
          reportRequired: c.reportRequired,
          reviewerId: c.reviewerId,
          revision: (t.revision || 1) + 1,
          ...(changed
            ? {
                status: "Belum diterima" as const,
                reconfirmRequired: true,
                acceptedAt: undefined,
                startedAt: undefined,
                submittedAt: undefined,
                reviewedAt: undefined,
                completedAt: undefined,
              }
            : {}),
        };
        await db.tasks.put(next);
        await audit(
          d,
          uid,
          changed
            ? "Revisi material; konfirmasi ulang diperlukan"
            : "Catatan/tenggat direvisi",
          t,
          next,
          t.id,
        );
      }
      for (const receipt of await db.recipientReceipts
        .where({ dispositionId: d.id })
        .toArray())
        if (
          !c.recipients.some(
            (r) => r.id === receipt.recipientId && r.userId === receipt.userId,
          )
        )
          await db.recipientReceipts.update(receipt.id, { retired: true });
    }
    for (const r of c.recipients) {
      const receiptId = d.id + ":" + r.id,
        oldReceipt = await db.recipientReceipts.get(receiptId);
      if (oldReceipt && oldReceipt.userId !== r.userId)
        throw Error("Gunakan ID penerima baru saat mengganti pengguna.");
      if (!oldReceipt)
        await db.recipientReceipts.add({
          id: receiptId,
          dispositionId: d.id,
          recipientId: r.id,
          userId: r.userId,
          unitId: r.unitId,
          userName: r.userName,
          positionName: r.positionName,
        });
      else if (oldReceipt.retired)
        throw Error(
          "Penerima yang dihapus harus ditambahkan sebagai kewajiban baru.",
        );
      if (
        r.kind !== "Tembusan" &&
        !existing.some(
          (t) =>
            t.recipientId === r.id && !t.parentId && t.status !== "Dibatalkan",
        )
      )
        await db.tasks.add({
          id: id(),
          digital: true,
          revision: 1,
          recipientId: r.id,
          letterId: d.letterId,
          dispositionId: d.id,
          unitId: r.unitId,
          unitName: r.unitName,
          userId: r.userId,
          userName: r.userName,
          positionName: r.positionName,
          instruction: r.instruction,
          deadline: r.deadline,
          status: "Belum diterima",
          review: c.review,
          reportRequired: c.reportRequired,
          reviewerId: c.reviewerId,
          issuerId: d.issuerId,
          createdAt: now(),
        });
    }
    await db.dispositions.put(d);
    await version(d, uid, old ? "Revisi: " + draft.reason : "Diterbitkan");
    await audit(
      d,
      uid,
      old ? "Disposisi direvisi" : "Disposisi diterbitkan",
      old || null,
      d,
    );
    await db.dispositionDrafts.update(draftId, {
      content: c,
      publishedId: d.id,
      revision: draft.revision + 1,
      updatedAt: now(),
    });
    await aggregate(d.letterId);
    return d;
  });
}
async function cancelBranch(
  root: Task,
  d: Disposition,
  uid: string,
  reason: string,
) {
  const all = await db.tasks.where({ dispositionId: d.id }).toArray(),
    queue = [root.id],
    seen = new Set<string>();
  while (queue.length) {
    const tid = queue.shift()!;
    if (seen.has(tid)) throw Error("Siklus tugas ditemukan.");
    seen.add(tid);
    const t = all.find((t) => t.id === tid);
    if (!t) continue;
    if (isOpen(t)) {
      const next = {
        ...t,
        status: "Dibatalkan" as const,
        previousStatus: t.status,
        retired: true,
        revision: (t.revision || 1) + 1,
      };
      await db.tasks.put(next);
      await audit(d, uid, "Tugas dibatalkan: " + reason, t, next, t.id);
    }
    if (t.status === "Selesai" && !t.retired) {
      const next = { ...t, retired: true, revision: (t.revision || 1) + 1 };
      await db.tasks.put(next);
      await audit(
        d,
        uid,
        "Kewajiban selesai dipertahankan sebagai riwayat: " + reason,
        t,
        next,
        t.id,
      );
    }
    queue.push(...all.filter((t) => t.parentId === tid).map((t) => t.id));
  }
}
export async function markDispositionRead(did: string, uid: string) {
  await db.transaction("rw", db.tables, async () => {
    await user(uid);
    const d = await db.dispositions.get(did);
    if (!d?.digital || d.cancelled) return;
    for (const r of await db.recipientReceipts
      .where({ dispositionId: did, userId: uid })
      .toArray())
      if (!r.readAt && !r.retired)
        await db.recipientReceipts.update(r.id, { readAt: now() });
    for (const t of await db.tasks
      .where({ dispositionId: did, userId: uid })
      .toArray())
      if (!t.readAt && t.status !== "Dibatalkan")
        await db.tasks.update(t.id, { readAt: now() });
  });
}
async function taskForAction(
  tid: string,
  rev: number,
  uid: string,
  asReviewer = false,
) {
  const t = await db.tasks.get(tid),
    u = await user(uid);
  if (!t?.digital) throw Error("Tugas digital tidak ditemukan.");
  assertRevision(t.revision, rev);
  const d = await db.dispositions.get(t.dispositionId);
  if (!d || d.cancelled || t.retired || t.status === "Dibatalkan")
    throw Error("Tugas/disposisi sudah dibatalkan.");
  if (
    asReviewer
      ? u.role !== "Admin Sistem" && t.reviewerId !== uid
      : t.userId !== uid
  )
    throw Error(
      asReviewer
        ? "Hanya pemeriksa yang ditunjuk atau admin."
        : "Tindakan penerima hanya untuk pengguna yang ditugaskan.",
    );
  return { t, d, u };
}
export type DigitalTaskAction =
  | "accept"
  | "progress"
  | "discussion"
  | "submit"
  | "complete"
  | "approve"
  | "return"
  | "evidence";
export async function digitalTaskAction(
  tid: string,
  rev: number,
  action: DigitalTaskAction,
  uid: string,
  text = "",
  report?: CompletionReport,
  files: File[] = [],
) {
  return db.transaction("rw", db.tables, async () => {
    const { t, d, u } = await taskForAction(
        tid,
        rev,
        uid,
        ["approve", "return", "evidence"].includes(action),
      ),
      before = structuredClone(t),
      at = now();
    if (action === "discussion") {
      if (!text.trim()) throw Error("Catatan diskusi wajib diisi.");
      await db.comments.add({
        id: id(),
        letterId: t.letterId,
        dispositionId: d.id,
        taskId: tid,
        text,
        author: u.name,
        createdAt: at,
      });
    }
    if (action === "accept") {
      if (
        !["Belum diterima", "Perlu perbaikan"].includes(t.status) &&
        !t.reconfirmRequired
      )
        throw Error("Tugas sudah dikonfirmasi.");
      t.status = "Diterima";
      t.acceptedAt = at;
      t.reconfirmRequired = false;
    }
    if (action === "progress") {
      if (
        !["Diterima", "Diproses", "Perlu perbaikan"].includes(t.status) ||
        t.reconfirmRequired
      )
        throw Error("Konfirmasi penerimaan terlebih dahulu.");
      if (!text.trim()) throw Error("Uraian progres wajib diisi.");
      await db.progress.add({
        id: id(),
        taskId: tid,
        text,
        author: u.name,
        createdAt: at,
      });
      t.status = "Diproses";
      t.startedAt ??= at;
    }
    if (action === "submit" || action === "complete") {
      if (
        !["Diterima", "Diproses", "Perlu perbaikan"].includes(t.status) ||
        t.reconfirmRequired
      )
        throw Error("Konfirmasi penerimaan terlebih dahulu.");
      const children = await db.tasks
        .filter((x) => x.parentId === tid && isOpen(x))
        .toArray();
      if (t.consolidateChildren && children.length)
        throw Error(
          "Selesaikan dan konsolidasikan hasil bawahan sebelum melaporkan.",
        );
      if (action === "complete") {
        if (t.reportRequired !== false)
          throw Error("Tugas memerlukan laporan hasil.");
        if (!text.trim()) throw Error("Catatan penyelesaian wajib diisi.");
        t.completionNote = text;
      } else {
        if (
          !report ||
          report.taskId !== tid ||
          !report.action.trim() ||
          !report.result.trim() ||
          !z.iso.date().safeParse(report.date).success
        )
          throw Error(
            "Laporan wajib memuat tindakan, tanggal valid, dan hasil.",
          );
        const result = {
          ...report,
          id: id(),
          createdAt: at,
          attachmentIds: [] as string[],
        };
        for (const file of files) {
          if (file.size > 20 * 1024 * 1024)
            throw Error("Batas bukti 20 MB per berkas.");
          const aid = id();
          await db.attachments.add({
            id: aid,
            letterId: t.letterId,
            name: file.name,
            type: file.type || "application/octet-stream",
            blob: file,
          });
          result.attachmentIds.push(aid);
        }
        await db.reports.add(result);
      }
      t.submittedAt = at;
      t.status = t.review ? "Hasil dikirim" : "Selesai";
      if (t.status === "Selesai") t.completedAt = at;
    }
    if (["approve", "return", "evidence"].includes(action)) {
      if (t.status !== "Hasil dikirim")
        throw Error("Belum ada hasil untuk diperiksa.");
      if (action !== "approve" && !text.trim())
        throw Error("Alasan perbaikan/tambahan bukti wajib diisi.");
      t.status = action === "approve" ? "Selesai" : "Perlu perbaikan";
      t.reviewedAt = at;
      if (t.status === "Selesai") t.completedAt = at;
    }
    t.revision = (t.revision || 1) + 1;
    await db.tasks.put(t);
    await audit(
      d,
      uid,
      (
        {
          accept: "Penerimaan dikonfirmasi",
          progress: "Progres diperbarui",
          discussion: "Diskusi dicatat",
          submit: "Hasil dikirim",
          complete: "Penyelesaian dicatat",
          approve: "Hasil diterima",
          return: "Hasil dikembalikan",
          evidence: "Tambahan bukti diminta",
        } as const
      )[action] + (text ? ": " + text : ""),
      before,
      t,
      tid,
    );
    await aggregate(t.letterId);
    return t;
  });
}
export async function extendDigitalDeadline(
  tid: string,
  rev: number,
  deadline: string,
  reason: string,
  uid: string,
) {
  if (!reason.trim()) throw Error("Alasan perpanjangan wajib diisi.");
  return db.transaction("rw", db.tables, async () => {
    const t = await db.tasks.get(tid);
    if (!t?.digital || !isOpen(t)) throw Error("Tugas tidak terbuka.");
    assertRevision(t.revision, rev);
    const d = (await db.dispositions.get(t.dispositionId))!;
    await issuer(d, uid);
    if (d.cancelled) throw Error("Disposisi dibatalkan.");
    if (
      !z.iso.date().safeParse(deadline).success ||
      (t.deadline && deadline <= t.deadline)
    )
      throw Error("Tenggat baru harus tanggal valid setelah tenggat lama.");
    const before = structuredClone(d),
      previous = t.deadline;
    t.deadline = deadline;
    t.revision = (t.revision || 1) + 1;
    await db.tasks.put(t);
    if (!t.parentId)
      d.recipients = d.recipients.map((r) =>
        r.id === t.recipientId ? { ...r, deadline } : r,
      );
    d.revision = (d.revision || 1) + 1;
    d.version = (d.version || 1) + 1;
    d.updatedAt = now();
    await db.dispositions.put(d);
    await version(d, uid, "Perpanjangan: " + reason);
    await audit(
      d,
      uid,
      "Tenggat diperpanjang: " + reason,
      { deadline: previous, disposition: before },
      { deadline, disposition: d },
      tid,
    );
    return t;
  });
}
export async function delegateDigital(
  tid: string,
  rev: number,
  targetUserId: string,
  instruction: string,
  deadline: string,
  reason: string,
  consolidate: boolean,
  uid: string,
) {
  return db.transaction("rw", db.tables, async () => {
    const { t, d, u } = await taskForAction(tid, rev, uid);
    if (
      !["Kepala Unit", "Kepala RSAU", "Admin Sistem"].includes(u.role) ||
      !["Diterima", "Diproses", "Perlu perbaikan"].includes(t.status)
    )
      throw Error("Delegasi memerlukan penerimaan tugas dan peran pimpinan.");
    if (!instruction.trim() || !reason.trim())
      throw Error("Instruksi dan alasan delegasi wajib diisi.");
    const target = await user(targetUserId),
      unit = await db.units.get(target.unitId);
    if (!unit?.active) throw Error("Unit tujuan tidak aktif.");
    if (target.unitId !== t.unitId && unit.parentId !== t.unitId)
      throw Error(
        "Pilih pelaksana di unit yang sama atau unit bawahan langsung.",
      );
    if (target.unitId === t.unitId && target.role !== "Pelaksana")
      throw Error("Delegasi dalam unit hanya kepada pelaksana.");
    let cursor: Task | undefined = t;
    const seen = new Set<string>();
    while (cursor) {
      if (seen.has(cursor.id) || cursor.userId === target.id)
        throw Error("Delegasi bersiklus atau kembali ke rantai tugas.");
      seen.add(cursor.id);
      cursor = cursor.parentId
        ? await db.tasks.get(cursor.parentId)
        : undefined;
    }
    if (
      await db.tasks
        .filter(
          (x) => x.parentId === tid && x.userId === target.id && isOpen(x),
        )
        .count()
    )
      throw Error("Delegasi terbuka ke penerima ini sudah ada.");
    if (deadline && !z.iso.date().safeParse(deadline).success)
      throw Error("Tenggat tidak valid.");
    const child: Task = {
      ...t,
      id: id(),
      revision: 1,
      parentId: tid,
      recipientId: undefined,
      userId: target.id,
      userName: target.name,
      positionName:
        (await db.positions.filter((p) => p.userId === target.id).first())
          ?.name || target.role,
      unitId: unit.id,
      unitName: unit.name,
      instruction,
      deadline,
      status: "Belum diterima",
      reviewerId: uid,
      review: true,
      issuerId: uid,
      delegatedBy: uid,
      delegateReason: reason,
      consolidateChildren: false,
      readAt: undefined,
      acceptedAt: undefined,
      startedAt: undefined,
      submittedAt: undefined,
      reviewedAt: undefined,
      completedAt: undefined,
      createdAt: now(),
    };
    await db.tasks.add(child);
    await db.tasks.update(tid, {
      consolidateChildren: consolidate,
      revision: (t.revision || 1) + 1,
    });
    await audit(d, uid, "Delegasi: " + reason, t, child, child.id);
    await aggregate(t.letterId);
    return child;
  });
}
export async function cancelDigitalDisposition(
  did: string,
  rev: number,
  reason: string,
  uid: string,
) {
  if (!reason.trim()) throw Error("Alasan pembatalan wajib diisi.");
  return db.transaction("rw", db.tables, async () => {
    const d = await db.dispositions.get(did);
    if (!d?.digital || d.cancelled) throw Error("Disposisi tidak aktif.");
    assertRevision(d.revision, rev);
    await issuer(d, uid);
    const before = structuredClone(d);
    for (const t of await db.tasks.where({ dispositionId: did }).toArray())
      if (!t.parentId) await cancelBranch(t, d, uid, reason);
    d.cancelled = true;
    d.reason = reason;
    d.revision = (d.revision || 1) + 1;
    d.version = (d.version || 1) + 1;
    d.updatedAt = now();
    await db.dispositions.put(d);
    await version(d, uid, "Dibatalkan: " + reason);
    await audit(d, uid, "Disposisi dibatalkan: " + reason, before, d);
    await aggregate(d.letterId);
    return d;
  });
}
export async function dispositionOutput(
  did: string,
  uid: string,
  kind: "notes" | "events",
  confirmed: boolean,
  input: {
    taskId?: string;
    unitId?: string;
    title?: string;
    date?: string;
    start?: string;
    end?: string;
    location?: string;
    acknowledged?: boolean;
  } = {},
) {
  if (!confirmed)
    throw Error("Konfirmasi pembuatan dokumen sumber diperlukan.");
  return db.transaction("rw", db.tables, async () => {
    const d = await db.dispositions.get(did),
      u = await user(uid);
    if (!d || d.cancelled) throw Error("Disposisi tidak aktif.");
    if (input.taskId) {
      const t = await db.tasks.get(input.taskId);
      if (!t || t.dispositionId !== did)
        throw Error("Tugas sumber tidak sesuai.");
    }
    const key = did + ":" + (input.taskId || "disposisi") + ":" + kind,
      old = await db.dispositionOutputs.get(key);
    if (old) {
      if (!(await db.table(kind).get(old.targetId)))
        throw Error("Dokumen keluaran pernah dibuat tetapi sumbernya hilang.");
      return old.targetId;
    }
    let targetId = "";
    if (kind === "notes") {
      const note = await createNote(
        "nota-template-6",
        uid,
        input.unitId || u.unitId,
        d.letterId,
      );
      const saved = await saveNote(
        note.id,
        note.revision,
        { ...note.content, dispositionId: did, taskId: input.taskId || "" },
        uid,
      );
      targetId = saved.id;
    } else {
      targetId = id();
      await saveAgenda(
        {
          id: targetId,
          title: input.title || "",
          date: input.date || "",
          start: input.start,
          end: input.end,
          location: input.location || "",
          letterId: d.letterId,
          dispositionId: did,
          taskId: input.taskId,
          unitId: u.unitId,
          organizer: u.name,
        },
        input.acknowledged,
      );
    }
    await db.dispositionOutputs.add({
      id: key,
      dispositionId: did,
      taskId: input.taskId,
      kind,
      targetId,
      userId: uid,
      createdAt: now(),
    });
    await audit(
      d,
      uid,
      kind === "notes" ? "Konsep Nota Dinas dibuat" : "Agenda dibuat",
      null,
      { kind, targetId },
      input.taskId,
    );
    return targetId;
  });
}
