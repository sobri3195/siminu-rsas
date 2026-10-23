import { useParams, Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../storage/db";
import { dateLabel } from "../utils";
export function LetterPrint() {
  const { id = "" } = useParams();
  const letter = useLiveQuery(() => db.letters.get(id), [id]);
  const tasks =
    useLiveQuery(() => db.tasks.where({ letterId: id }).toArray(), [id]) || [];
  const ds =
    useLiveQuery(
      () => db.dispositions.where({ letterId: id }).toArray(),
      [id],
    ) || [];
  const reports = useLiveQuery(() => db.reports.toArray()) || [];
  return (
    <>
      <div className="print-actions">
        <Link className="button" to={`/surat-masuk/${id}`}>
          Kembali ke surat
        </Link>
        <button className="primary" onClick={() => window.print()}>
          Cetak detail surat
        </button>
      </div>
      {letter && (
        <article className="print-sheet">
          <div className="continuation-id">
            {letter.agenda} · {letter.number} · CONTOH/DEMO
          </div>
          <h1>DETAIL SURAT — CONTOH/DEMO</h1>
          <h2>RSAU Prof. dr. Abdulrachman Saleh</h2>
          <dl>
            {[
              ["Nomor agenda", letter.agenda],
              ["Nomor surat", letter.number],
              ["Pengirim", letter.sender],
              ["Perihal", letter.subject],
              ["Tanggal", dateLabel(letter.date)],
              ["Derajat", letter.urgency],
              ["Klasifikasi", letter.classification],
              ["Status", letter.status],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p>{letter.summary}</p>
          {ds.map((d) => (
            <section key={d.id}>
              <h3>Disposisi {d.cancelled ? "(dibatalkan/revisi)" : ""}</h3>
              <p>
                {d.instructions.join(", ")} · {d.notes}
              </p>
              {d.recipients.map((r) => (
                <p key={r.unitId}>
                  {r.unitName} ({r.kind}) — {r.instruction} —{" "}
                  {dateLabel(r.deadline)}
                </p>
              ))}
            </section>
          ))}
          <h2>Laporan hasil</h2>
          {tasks.map((t) => (
            <section key={t.id}>
              <h3>
                {t.unitName} — {t.status}
              </h3>
              {reports
                .filter((r) => r.taskId === t.id)
                .map((r) => (
                  <p key={r.id}>
                    {dateLabel(r.date)} · {r.action} · {r.result} · Kendala:{" "}
                    {r.obstacles || "Tidak ada"}
                  </p>
                ))}
            </section>
          ))}
        </article>
      )}
    </>
  );
}
