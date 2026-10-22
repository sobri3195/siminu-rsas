import { useParams, Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../storage/db";
import { dateLabel, instructions, download } from "../utils";
export function Print() {
  const { id = "" } = useParams();
  const letter = useLiveQuery(() => db.letters.get(id), [id]);
  const ds =
    useLiveQuery(
      () => db.dispositions.where({ letterId: id }).toArray(),
      [id],
    ) || [];
  const units = useLiveQuery(() => db.units.toArray()) || [];
  const settings = useLiveQuery(() => db.settings.get("main"));
  const attachments =
    useLiveQuery(
      () => db.attachments.where({ letterId: id }).toArray(),
      [id],
    ) || [];
  const d = ds.filter((d) => !d.cancelled).at(-1);
  return (
    <>
      <div className="print-actions">
        <Link className="button" to={`/surat-masuk/${id}`}>
          Kembali ke surat
        </Link>
        <button className="primary" onClick={() => window.print()}>
          Cetak / Simpan sebagai PDF
        </button>
        {attachments.map((a) => (
          <button key={a.id} onClick={() => download(a.blob, a.name)}>
            Unduh {a.name}
          </button>
        ))}
      </div>
      {letter && (
        <article className="print-sheet">
          <div className="continuation-id">
            SIMINU RSAS · {letter.agenda} · {letter.number} · CONTOH/DEMO
          </div>
          <div className="print-header">
            PUSAT KESEHATAN TNI ANGKATAN UDARA
            <br />
            RSAU Prof. dr. Abdulrachman Saleh
          </div>
          <h1>LEMBAR DISPOSISI</h1>
          <p className="demo-stamp">CONTOH/DEMO</p>
          <table className="print-metadata">
            <tbody>
              {[
                ["Diterima dari", letter.sender],
                ["Tanggal", dateLabel(letter.received)],
                ["Nomor agenda", letter.agenda],
                ["Nomor surat", letter.number],
                ["Derajat", letter.urgency],
                ["Klasifikasi", letter.classification],
                ["Perihal", letter.subject],
              ].map(([k, v]) => (
                <tr key={k}>
                  <th>{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="print-columns">
            <section>
              <h3>Kepada Yth.</h3>
              {units
                .sort((a, b) => a.order - b.order)
                .map((u) => (
                  <p key={u.id}>
                    {d?.recipients.some((r) => r.unitId === u.id) ? "☑" : "☐"}{" "}
                    {d?.recipients.find((r) => r.unitId === u.id)?.unitName ||
                      u.name}
                    {d?.recipients.find((r) => r.unitId === u.id)?.kind ===
                    "Tembusan"
                      ? " (Tembusan)"
                      : ""}
                  </p>
                ))}
            </section>
            <section>
              <h3>Disposisi / Catatan</h3>
              {instructions.map((i) => (
                <p key={i}>
                  {d?.instructions.includes(i) ? "☑" : "☐"} {i}
                </p>
              ))}
              <h3>Catatan</h3>
              <p className="print-notes">{d?.notes || "—"}</p>
              {d?.recipients.map((r) => (
                <p key={r.unitId}>
                  {r.unitName}: {r.instruction} — {dateLabel(r.deadline)}
                </p>
              ))}
              <p>Tenggat: {dateLabel(d?.deadline || "")}</p>
              <div className="signature">
                <p>{dateLabel(settings?.printDate || "")}</p>
                <p>Kepala RSAU</p>
                <div className="signature-space" />
                <strong>
                  {settings?.official || "(Identitas pejabat belum diatur)"}
                </strong>
                <p>
                  {settings?.rank} {settings?.nrp ? `NRP ${settings.nrp}` : ""}
                </p>
              </div>
            </section>
          </div>
          <footer>
            Mohon lembar disposisi ini tidak dilepaskan dari naskah aslinya.
          </footer>
        </article>
      )}
    </>
  );
}
