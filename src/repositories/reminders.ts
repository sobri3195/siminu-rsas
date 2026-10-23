import { db } from "../storage/db";
import { today, now } from "../utils";
export async function refreshReminders() {
  await db.transaction(
    "rw",
    [db.tasks, db.dispositions, db.notifications],
    async () => {
      const ds = new Map(
        (await db.dispositions.toArray()).map((d) => [d.id, d]),
      );
      for (const t of await db.tasks.toArray()) {
        if (
          ds.get(t.dispositionId)?.cancelled ||
          ["Selesai", "Dibatalkan"].includes(t.status)
        )
          continue;
        const days =
          (new Date(t.deadline + "T00:00Z").getTime() -
            new Date(today() + "T00:00Z").getTime()) /
          86400000;
        let text = "";
        if (days <= 1)
          text = `${days < 0 ? "Terlambat" : "Tenggat mendekat"}: ${t.unitName} — ${t.deadline}`;
        if (t.status === "Hasil dikirim")
          text = `Hasil menunggu pemeriksaan: ${t.unitName}`;
        if (t.status === "Perlu perbaikan")
          text = `Hasil perlu diperbaiki: ${t.unitName}`;
        if (text) {
          const notificationId = `reminder-${t.id}-${today()}-${t.status}`;
          if (!(await db.notifications.get(notificationId)))
            await db.notifications.add({
              id: notificationId,
              text,
              letterId: t.letterId,
              read: false,
              createdAt: now(),
            });
        }
      }
    },
  );
}
