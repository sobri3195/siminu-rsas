import { db } from "../storage/db";
export function durationHours(
  start: string | undefined,
  end: string | undefined,
) {
  if (!start || !end) return undefined;
  const hours = (Date.parse(end) - Date.parse(start)) / 3600000;
  return Number.isFinite(hours) && hours >= 0 ? hours : undefined;
}
export function summarize(values: (number | undefined)[]) {
  const valid = values
    .filter((v): v is number => v !== undefined)
    .sort((a, b) => a - b);
  return {
    n: valid.length,
    missing: values.length - valid.length,
    median: valid.length
      ? valid.length % 2
        ? valid[Math.floor(valid.length / 2)]
        : (valid[valid.length / 2 - 1] + valid[valid.length / 2]) / 2
      : undefined,
  };
}
export async function processAnalytics(from: string, to: string, zone: string) {
  const [letters, dispositions, tasks] = await Promise.all([
    db.letters.toArray(),
    db.dispositions.toArray(),
    db.tasks.toArray(),
  ]);
  const date = (instant: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(instant));
  const period = tasks.filter(
    (t) =>
      !["Dibatalkan"].includes(t.status) &&
      !dispositions.find((d) => d.id === t.dispositionId)?.cancelled &&
      date(t.createdAt) >= from &&
      date(t.createdAt) <= to,
  );
  const received = letters.filter(
    (l) => l.received >= from && l.received <= to,
  );
  const metrics = [
    {
      label: "Penerimaan tercatat → disposisi pertama",
      basis: "Periode tanggal penerimaan surat",
      ...summarize(
        received.map((l) =>
          durationHours(
            l.receivedAt,
            dispositions
              .filter((d) => d.letterId === l.id)
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
              ?.createdAt,
          ),
        ),
      ),
    },
    {
      label: "Disposisi → konfirmasi terima",
      basis: "Periode pembuatan tugas disposisi",
      ...summarize(
        period
          .filter((t) => !t.minutesId)
          .map((t) =>
            durationHours(
              dispositions.find((d) => d.id === t.dispositionId)?.createdAt,
              t.acceptedAt,
            ),
          ),
      ),
    },
    {
      label: "Mulai progres → pengiriman hasil terakhir",
      basis: "Periode pembuatan tugas",
      ...summarize(
        period.map((t) => durationHours(t.startedAt, t.submittedAt)),
      ),
    },
    {
      label: "Pengiriman hasil terakhir → pemeriksaan",
      basis: "Periode pembuatan tugas",
      ...summarize(
        period.map((t) => durationHours(t.submittedAt, t.reviewedAt)),
      ),
    },
  ];
  const open = period.filter((t) => t.status !== "Selesai");
  const age = open.map((t) =>
    durationHours(t.createdAt, new Date().toISOString()),
  );
  const ageBuckets = [
    {
      label: "0–24 jam",
      count: age.filter((h) => h !== undefined && h <= 24).length,
    },
    {
      label: "Lebih 24–168 jam",
      count: age.filter((h) => h !== undefined && h > 24 && h <= 168).length,
    },
    {
      label: "Lebih 168 jam",
      count: age.filter((h) => h !== undefined && h > 168).length,
    },
    {
      label: "Timestamp belum lengkap/valid",
      count: age.filter((h) => h === undefined).length,
    },
  ];
  const completed = period.filter(
    (t) => t.status === "Selesai" && !!t.completedAt,
  );
  const onTime = completed.filter(
    (t) => date(t.completedAt!) <= t.deadline,
  ).length;
  return {
    metrics,
    ageBuckets,
    onTime,
    completed: completed.length,
    unknownCompletion: period.filter(
      (t) => t.status === "Selesai" && !t.completedAt,
    ).length,
  };
}
