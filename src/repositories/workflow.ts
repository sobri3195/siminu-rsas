import { db } from "../storage/db";
import type {
  IncomingLetter,
  Disposition,
  CompletionReport,
  Task,
  Role,
} from "../types";
import { id, now, today } from "../utils";
export const canRegister = (role: Role) =>
  ["Admin Sistem", "Petugas Urtu/Administrasi"].includes(role);
export const canIssue = (role: Role) =>
  ["Admin Sistem", "Kepala RSAU"].includes(role);
export async function log(letterId: string, text: string, author: string) {
  await db.activities.add({
    id: id(),
    letterId,
    text,
    author,
    createdAt: now(),
  });
}
export async function register(
  letter: IncomingLetter,
  files: File[],
  author: string,
) {
  await db.transaction(
    "rw",
    [db.letters, db.attachments, db.activities],
    async () => {
      if (
        await db.letters
          .filter(
            (l) =>
              l.agenda === letter.agenda &&
              l.received.slice(0, 4) === letter.received.slice(0, 4),
          )
          .count()
      )
        throw Error("Nomor agenda sudah digunakan pada tahun ini.");
      for (const file of files) {
        const aid = id();
        letter.attachmentIds.push(aid);
        await db.attachments.add({
          id: aid,
          letterId: letter.id,
          name: file.name,
          type: file.type,
          blob: file,
        });
      }
      await db.letters.add(letter);
      await log(letter.id, "Surat diregistrasi", author);
    },
  );
}
export async function aggregate(letterId: string) {
  const allTasks = await db.tasks.where({ letterId }).toArray();
  const active = new Set(
    (await db.dispositions.where({ letterId }).toArray())
      .filter((d) => !d.cancelled)
      .map((d) => d.id),
  );
  const tasks = allTasks.filter((t) => active.has(t.dispositionId));
  const letter = await db.letters.get(letterId);
  if (letter && letter.status !== "Diarsipkan" && tasks.length)
    await db.letters.update(letterId, {
      status: tasks.every((t) => t.status === "Selesai")
        ? "Selesai"
        : "Dalam tindak lanjut",
    });
}
export async function issue(d: Disposition, author: string) {
  await db.transaction(
    "rw",
    [db.dispositions, db.tasks, db.letters, db.activities, db.notifications],
    async () => {
      if (await db.dispositions.get(d.id))
        throw Error("Disposisi ini sudah diterbitkan.");
      const letter = await db.letters.get(d.letterId);
      if (!letter || letter.status === "Diarsipkan")
        throw Error("Surat tidak tersedia untuk disposisi.");
      if (!d.recipients.some((r) => r.kind !== "Tembusan"))
        throw Error("Pilih minimal satu penerima wajib.");
      if (d.revisionOf) {
        if (!d.reason?.trim()) throw Error("Alasan revisi wajib diisi.");
        const old = await db.dispositions.get(d.revisionOf);
        if (!old || old.cancelled) throw Error("Disposisi lama tidak aktif.");
        await db.dispositions.update(old.id, {
          cancelled: true,
        }); /* Previous tasks retained as historical obligations of the superseded disposition. */
      }
      await db.dispositions.add(d);
      for (const r of d.recipients) {
        if (r.kind !== "Tembusan")
          await db.tasks.add({
            id: id(),
            letterId: d.letterId,
            dispositionId: d.id,
            unitId: r.unitId,
            unitName: r.unitName,
            userId: r.userId,
            instruction: r.instruction,
            deadline: r.deadline,
            status: "Belum dibaca",
            review: d.review,
            createdAt: now(),
          });
        await db.notifications.add({
          id: id(),
          letterId: d.letterId,
          text: `Disposisi baru untuk ${r.unitName}`,
          read: false,
          createdAt: now(),
        });
      }
      await db.letters.update(d.letterId, { status: "Dalam tindak lanjut" });
      await log(
        d.letterId,
        `Disposisi ${d.revisionOf ? "direvisi: " + d.reason : "diterbitkan"} kepada ${d.recipients.map((r) => r.unitName + " (" + r.kind + ")").join(", ")}`,
        author,
      );
    },
  );
}
export async function taskAction(
  taskId: string,
  action: "read" | "accept" | "progress" | "submit" | "approve" | "return",
  author: string,
  text = "",
  report?: CompletionReport,
) {
  await db.transaction(
    "rw",
    [
      db.tasks,
      db.dispositions,
      db.letters,
      db.progress,
      db.reports,
      db.activities,
      db.notifications,
    ],
    async () => {
      const task = await db.tasks.get(taskId);
      if (!task) throw Error("Tugas tidak ditemukan.");
      const disposition = await db.dispositions.get(task.dispositionId);
      if (disposition?.cancelled)
        throw Error(
          "Disposisi telah direvisi. Tugas hanya tersedia sebagai riwayat.",
        );
      let status = task.status;
      if (action === "read") {
        if (status !== "Belum dibaca") return;
        status = "Dibaca";
      }
      if (action === "accept") {
        if (!["Belum dibaca", "Dibaca"].includes(status))
          throw Error("Tugas sudah diterima.");
        status = "Diterima";
      }
      if (action === "progress") {
        if (!["Diterima", "Diproses", "Perlu perbaikan"].includes(status))
          throw Error("Konfirmasi terima tugas terlebih dahulu.");
        if (!text.trim()) throw Error("Uraian progres wajib diisi.");
        await db.progress.add({
          id: id(),
          taskId,
          text,
          author,
          createdAt: now(),
        });
        status = "Diproses";
      }
      if (action === "submit") {
        if (
          !["Diterima", "Diproses", "Perlu perbaikan"].includes(status) ||
          !report?.result.trim() ||
          !report.action.trim()
        )
          throw Error("Tugas harus diterima dan laporan hasil wajib lengkap.");
        await db.reports.add(report);
        status = task.review ? "Hasil dikirim" : "Selesai";
      }
      if (action === "approve" || action === "return") {
        if (status !== "Hasil dikirim")
          throw Error("Belum ada hasil untuk diperiksa.");
        if (action === "return" && !text.trim())
          throw Error("Alasan perbaikan wajib diisi.");
        status = action === "approve" ? "Selesai" : "Perlu perbaikan";
      }
      await db.tasks.update(taskId, { status });
      await aggregate(task.letterId);
      await log(
        task.letterId,
        `${task.unitName}: ${action} → ${status}${text ? ": " + text : ""}`,
        author,
      );
      if (["submit", "return"].includes(action))
        await db.notifications.add({
          id: id(),
          letterId: task.letterId,
          text: `${task.unitName}: ${status}`,
          read: false,
          createdAt: now(),
        });
    },
  );
}
export async function archive(letterId: string, author: string) {
  await db.transaction(
    "rw",
    [db.letters, db.tasks, db.dispositions, db.activities],
    async () => {
      const l = await db.letters.get(letterId);
      const active = new Set(
        (await db.dispositions.where({ letterId }).toArray())
          .filter((d) => !d.cancelled)
          .map((d) => d.id),
      );
      const open = (await db.tasks.where({ letterId }).toArray()).some(
        (t) => active.has(t.dispositionId) && t.status !== "Selesai",
      );
      if (l?.status !== "Selesai" || open)
        throw Error(
          "Surat hanya dapat diarsipkan setelah semua kewajiban selesai.",
        );
      await db.letters.update(letterId, { status: "Diarsipkan" });
      await log(letterId, "Surat diarsipkan", author);
    },
  );
}
export async function delegate(task: Task, unitId: string, author: string) {
  await db.transaction("rw", [db.tasks, db.units, db.activities], async () => {
    const unit = await db.units.get(unitId);
    if (!unit?.active || unit.parentId !== task.unitId)
      throw Error("Delegasi hanya ke unit bawahan aktif.");
    let cursor: Task | undefined = task;
    while (cursor) {
      if (cursor.unitId === unitId) throw Error("Delegasi membentuk siklus.");
      cursor = cursor.parentId
        ? await db.tasks.get(cursor.parentId)
        : undefined;
    }
    await db.tasks.add({
      ...task,
      id: id(),
      unitId,
      unitName: unit.name,
      userId: unit.userId || "",
      status: "Belum dibaca",
      parentId: task.id,
      createdAt: now(),
    });
    await log(
      task.letterId,
      `Delegasi ${task.unitName} kepada ${unit.name}`,
      author,
    );
  });
}
export const overdue = (t: Task) =>
  t.deadline < today() && t.status !== "Selesai";
export async function cancelDisposition(
  dispositionId: string,
  reason: string,
  author: string,
) {
  if (!reason.trim()) throw Error("Alasan pembatalan wajib diisi.");
  await db.transaction(
    "rw",
    [db.dispositions, db.tasks, db.letters, db.activities],
    async () => {
      const d = await db.dispositions.get(dispositionId);
      if (!d || d.cancelled) throw Error("Disposisi tidak aktif.");
      await db.dispositions.update(dispositionId, { cancelled: true, reason });
      const others = (
        await db.dispositions.where({ letterId: d.letterId }).toArray()
      ).filter((v) => !v.cancelled);
      if (others.length) await aggregate(d.letterId);
      else
        await db.letters.update(d.letterId, { status: "Menunggu disposisi" });
      await log(d.letterId, "Disposisi dibatalkan: " + reason, author);
    },
  );
}
