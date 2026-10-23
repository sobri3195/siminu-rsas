import { Link, useParams, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, dataMode } from "../storage/db";
import { dateLabel, timestampLabel } from "../utils";
import type { Disposition } from "../types";
import { Empty, Field } from "../components/common";
export function DigitalDispositionPrint({
  isDraft = false,
}: {
  isDraft?: boolean;
}) {
  const { id = "" } = useParams(),
    [p, setP] = useSearchParams();
  const draft = useLiveQuery(
    () => (isDraft ? db.dispositionDrafts.get(id) : undefined),
    [id, isDraft],
  );
  const published = useLiveQuery(
    () => (!isDraft ? db.dispositions.get(id) : undefined),
    [id, isDraft],
  );
  const current: Disposition | undefined =
    isDraft && draft
      ? {
          id: draft.id,
          letterId: draft.content.letterId,
          giver: draft.content.giver,
          issuerId: draft.content.giverId,
          issuerPosition: draft.content.giverPosition,
          mode: draft.content.mode,
          recipients: draft.content.recipients,
          instructions: draft.content.instructions,
          notes: draft.content.notes,
          deadline: draft.content.deadline,
          review: draft.content.review,
          reviewerId: draft.content.reviewerId,
          reportRequired: draft.content.reportRequired,
          createdAt: draft.createdAt,
          revision: draft.revision,
          version: 0,
        }
      : published;
  const versions = (
    useLiveQuery(
      () =>
        isDraft
          ? []
          : db.dispositionVersions.where({ dispositionId: id }).toArray(),
      [id, isDraft],
    ) || []
  ).sort((a, b) => b.version - a.version);
  const chosen =
      isDraft && current
        ? { snapshot: current, createdAt: draft!.updatedAt }
        : versions.find(
            (v) => v.version === Number(p.get("version") || current?.version),
          ),
    d = chosen?.snapshot;
  const letter = useLiveQuery(
      () => (current ? db.letters.get(current.letterId) : undefined),
      [current?.letterId],
    ),
    settings = useLiveQuery(() => db.settings.get("main"));
  if (!current || !letter) return <Empty text="Memuat lembar disposisi." />;
  return (
    <div className="digital-print-root">
      <style media="print">
        {"@page { size:A4; margin:18mm 18mm 20mm 22mm; }"}
      </style>
      <div className="print-actions">
        <Link
          className="button"
          to={isDraft ? "/disposisi/draf/" + id : "/disposisi/" + id}
        >
          Kembali ke disposisi
        </Link>
        {!isDraft && (
          <Field label="Versi cetak disposisi">
            <select
              value={p.get("version") || current.version}
              onChange={(e) => setP({ version: e.target.value })}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.version}>
                  Versi {v.version} · {v.reason}
                </option>
              ))}
            </select>
          </Field>
        )}
        <button disabled={!d} onClick={() => window.print()}>
          Cetak / Simpan sebagai PDF
        </button>
        <p>
          Template mengikuti struktur isian RSAS. Contoh format resmi belum
          tersedia untuk pembandingan.
        </p>
      </div>
      {!d ? (
        <Empty text="Versi yang dipilih tidak ditemukan. Pilih versi yang tersedia." />
      ) : (
        <article className="digital-print-sheet">
          <header>
            <strong>
              {settings?.hospital || "RSAU Prof. dr. ABDULRACHMAN SALEH"}
            </strong>
            <h1>LEMBAR DISPOSISI</h1>
            <p>
              {dataMode === "demo" ? "CONTOH/DEMO · " : ""}
              {isDraft
                ? "DRAF — BELUM DITERBITKAN"
                : d.cancelled
                  ? "DIBATALKAN"
                  : current.cancelled || d.version !== current.version
                    ? "VERSI HISTORIS — BUKAN VERSI AKTIF"
                    : "VERSI AKTIF"}{" "}
              · {isDraft ? "Revisi draf " + d.revision : "Versi " + d.version}
            </p>
          </header>
          <table>
            <tbody>
              {[
                ["Diterima dari", letter.sender],
                ["Tanggal diterima", dateLabel(letter.received)],
                ["Nomor agenda", letter.agenda],
                ["Nomor surat", letter.number],
                [
                  "Derajat / Klasifikasi",
                  letter.urgency + " / " + letter.classification,
                ],
                ["Perihal", letter.subject],
                [
                  "Pemberi / Jabatan",
                  d.giver + " / " + (d.issuerPosition || "—"),
                ],
                [
                  "Tanggal terbit",
                  isDraft
                    ? "Belum diterbitkan"
                    : timestampLabel(d.issuedAt || d.createdAt),
                ],
                [
                  "Jenis / Tenggat",
                  d.mode +
                    " / " +
                    (d.deadline ? dateLabel(d.deadline) : "Tanpa tenggat"),
                ],
              ].map(([k, v]) => (
                <tr key={k}>
                  <th>{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2>Penerima</h2>
          <ol>
            {d.recipients.map((r) => (
              <li key={r.id || r.userId}>
                <strong>{r.unitName}</strong> · {r.positionName || "—"} ·{" "}
                {r.userName || "—"} ({r.kind})
              </li>
            ))}
          </ol>
          <h2>Instruksi umum</h2>
          <p>{d.instructions.join(" · ")}</p>
          <h2>Catatan</h2>
          <p className="digital-prewrap">{d.notes || "—"}</p>
          {d.cancelled && <p>Dibatalkan dengan alasan: {d.reason}</p>}
          <div className="digital-print-signature">
            <p>
              {isDraft
                ? "Tanggal penerbitan belum ditetapkan"
                : dateLabel((chosen?.createdAt || d.createdAt).slice(0, 10))}
            </p>
            <p>{d.issuerPosition}</p>
            <div className="digital-signature-space" />
            <strong>{d.giver}</strong>
          </div>
          <footer>
            Mohon lembar disposisi ini tetap bersama naskah asli. Area tanda
            tangan dibiarkan kosong. Persetujuan lokal merupakan simulasi.
          </footer>
          <section className="digital-print-continuation">
            <h2>RINCIAN ARAHAN PER PENERIMA</h2>
            <p>
              {letter.agenda} · {letter.number} ·{" "}
              {isDraft ? "Draf revisi " + d.revision : "Versi " + d.version} ·{" "}
              {isDraft
                ? "DRAF"
                : d.cancelled
                  ? "DIBATALKAN"
                  : d.version !== current.version || current.cancelled
                    ? "HISTORIS"
                    : "AKTIF"}
              {dataMode === "demo" ? " · CONTOH/DEMO" : ""}
            </p>
            <table>
              <thead>
                <tr>
                  {[
                    "Penerima / Peran",
                    "Instruksi khusus",
                    "Tenggat / Kewajiban",
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.recipients.map((r) => (
                  <tr key={r.id || r.userId}>
                    <td>
                      {r.unitName}
                      <br />
                      {r.positionName}
                      <br />
                      {r.userName} · {r.kind}
                    </td>
                    <td className="digital-prewrap">{r.instruction}</td>
                    <td>
                      {r.deadline ? dateLabel(r.deadline) : "Tanpa tenggat"}
                      <br />
                      {r.kind === "Tembusan"
                        ? "Untuk diketahui; tanpa tugas wajib"
                        : d.reportRequired
                          ? "Laporan hasil wajib"
                          : "Konfirmasi penyelesaian dengan catatan"}
                      {r.kind !== "Tembusan" && d.review ? "; diperiksa" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </article>
      )}
    </div>
  );
}
