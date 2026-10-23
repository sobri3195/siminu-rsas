import type { Task } from "../types";
import { db } from "../storage/db";
import { today } from "../utils";
import { durationHours, summarize } from "./analytics";
export async function digitalOverview(from: string, to: string) {
  const [letters, dispositions, all, settings] = await Promise.all([
    db.letters.toArray(),
    db.dispositions.toArray(),
    db.tasks.toArray(),
    db.settings.get("main"),
  ]);
  const zone = settings?.timezone || "Asia/Jakarta";
  const date = (value: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value));
  const tasks = all.filter(
    (t) =>
      t.digital &&
      !t.retired &&
      t.status !== "Dibatalkan" &&
      !dispositions.find((d) => d.id === t.dispositionId)?.cancelled &&
      date(t.createdAt) >= from &&
      date(t.createdAt) <= to,
  );
  const open = tasks.filter((t) => t.status !== "Selesai"),
    done = tasks.filter((t) => t.status === "Selesai"),
    lateDone = done.filter(
      (t) => t.deadline && t.completedAt && date(t.completedAt) > t.deadline,
    );
  const metrics = [
    {
      label: "Penerbitan → konfirmasi terima",
      ...summarize(
        tasks.map((t) =>
          durationHours(
            t.parentId
              ? t.createdAt
              : dispositions.find((d) => d.id === t.dispositionId)?.issuedAt,
            t.acceptedAt,
          ),
        ),
      ),
    },
    {
      label: "Penerimaan → hasil terakhir",
      ...summarize(
        tasks.map((t) => durationHours(t.acceptedAt, t.submittedAt)),
      ),
    },
    {
      label: "Hasil terakhir → pemeriksaan",
      ...summarize(
        tasks.map((t) => durationHours(t.submittedAt, t.reviewedAt)),
      ),
    },
  ];
  const rows: [string, Task[]][] = [
    ["Belum mengonfirmasi", open.filter((t) => t.status === "Belum diterima")],
    [
      "Tenggat mendekat",
      open.filter(
        (t) =>
          !!t.deadline &&
          t.deadline >= today() &&
          t.deadline <=
            new Date(Date.now() + 86400000).toLocaleDateString("en-CA", {
              timeZone: zone,
            }),
      ),
    ],
    [
      "Terlambat dan masih terbuka",
      open.filter((t) => !!t.deadline && t.deadline < today()),
    ],
    [
      "Hasil menunggu pemeriksaan",
      tasks.filter((t) => t.status === "Hasil dikirim"),
    ],
    ["Selesai melewati tenggat", lateDone],
    ["Tanpa tenggat", open.filter((t) => !t.deadline)],
  ];
  return {
    tasks,
    metrics,
    rows,
    units: [...new Set(tasks.map((t) => t.unitId))].map((unitId) => ({
      unitId,
      name: tasks.find((t) => t.unitId === unitId)!.unitName,
      total: tasks.filter((t) => t.unitId === unitId).length,
      done: done.filter((t) => t.unitId === unitId).length,
    })),
    pending: letters.filter(
      (l) =>
        l.status !== "Draf" &&
        l.status !== "Diarsipkan" &&
        l.received >= from &&
        l.received <= to &&
        !dispositions.some((d) => d.letterId === l.id && !d.cancelled),
    ),
  };
}
