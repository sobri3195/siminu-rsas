import { db } from "../storage/db";
import type { MeetingMinutes } from "../types";
import { id, now } from "../utils";
import { z } from "zod";
export async function saveMinutes(
  m: MeetingMinutes,
  expected: number | undefined,
  files: File[] = [],
) {
  if (
    !m.title.trim() ||
    !z.iso.date().safeParse(m.date).success ||
    !m.chair.trim()
  )
    throw Error("Judul, tanggal dan pimpinan rapat wajib lengkap.");
  return db.transaction("rw", [db.minutes, db.attachments], async () => {
    const old = await db.minutes.get(m.id);
    if (old && old.revision !== expected)
      throw Error("Notulen berubah di tab lain. Muat ulang sebelum menyimpan.");
    if (new Set(m.decisions.map((d) => d.id)).size !== m.decisions.length)
      throw Error("Keputusan rapat ganda.");
    const next = {
      ...m,
      revision: (old?.revision || 0) + 1,
      updatedAt: now(),
      attachmentIds: [...(old?.attachmentIds || m.attachmentIds)],
    };
    for (const f of files) {
      const aid = id();
      next.attachmentIds.push(aid);
      await db.attachments.add({
        id: aid,
        letterId: m.id,
        name: f.name,
        type: f.type,
        blob: f,
      });
    }
    await db.minutes.put(next);
    return next;
  });
}
export async function decisionTasks(
  minutesId: string,
  decisionIds: string[],
  confirmed: boolean,
) {
  if (!confirmed)
    throw Error("Konfirmasi keputusan sebelum dibuat menjadi tugas.");
  return db.transaction(
    "rw",
    [db.minutes, db.tasks, db.users, db.units],
    async () => {
      const m = await db.minutes.get(minutesId);
      if (!m) throw Error("Notulen tidak ditemukan.");
      let created = 0,
        skipped = 0;
      for (const did of new Set(decisionIds)) {
        const d = m.decisions.find((d) => d.id === did);
        if (!d) throw Error("Keputusan tidak ditemukan.");
        const taskId = `meeting:${m.id}:${d.id}`;
        if (d.taskId || (await db.tasks.get(taskId))) {
          skipped++;
          continue;
        }
        const user = await db.users.get(d.userId),
          unit = await db.units.get(d.unitId);
        if (
          !user?.active ||
          !unit?.active ||
          !d.text.trim() ||
          !z.iso.date().safeParse(d.deadline).success
        )
          throw Error(
            "Keputusan, penanggung jawab, unit dan tenggat wajib valid.",
          );
        await db.tasks.add({
          id: taskId,
          letterId: m.letterId || "",
          dispositionId: "",
          minutesId: m.id,
          decisionId: d.id,
          agendaId: m.agendaId,
          unitId: d.unitId,
          unitName: unit.name,
          userId: d.userId,
          instruction: d.text,
          deadline: d.deadline,
          status: "Belum dibaca",
          review: true,
          createdAt: now(),
        });
        d.taskId = taskId;
        created++;
      }
      m.revision++;
      m.updatedAt = now();
      await db.minutes.put(m);
      return { created, skipped };
    },
  );
}
