import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { digitalOverview } from "../repositories/dispositionReports";
import { Field, Empty } from "../components/common";
import { today, dateLabel } from "../utils";
export function DigitalDispositionReports() {
  const [from, setFrom] = useState(today().slice(0, 7) + "-01"),
    [to, setTo] = useState(today()),
    [selected, setSelected] = useState(""),
    [unit, setUnit] = useState("");
  const data = useLiveQuery(() => digitalOverview(from, to), [from, to]);
  const shown = data
    ? (selected === "Selesai"
        ? data.tasks.filter((t) => t.status === "Selesai")
        : selected
          ? data.rows.find(([label]) => label === selected)?.[1] || []
          : data.tasks
      ).filter((t) => !unit || t.unitId === unit)
    : [];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">KEWAJIBAN AKTIF DAN WAKTU PROSES</p>
          <h1>Laporan Disposisi Digital</h1>
        </div>
        <Link className="button" to="/disposisi">
          Pusat disposisi
        </Link>
      </div>
      <section className="panel">
        <div className="form-grid">
          <Field label="Periode tugas mulai">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="Periode tugas akhir">
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
        </div>
        <p>
          Periode tugas berdasarkan tanggal pembuatan di zona aplikasi. Surat
          belum didisposisikan memakai tanggal diterima. Tembusan, tugas
          dibatalkan, dan disposisi dibatalkan dikecualikan dari pembagi.
          Delegasi dihitung sebagai kewajiban tersendiri; penyelesaian induk
          tetap terpisah.
        </p>
        {!data ? (
          <Empty text="Menghitung data lokal…" />
        ) : (
          <>
            <div className="digital-summary">
              <Link
                className="stat"
                to={"/disposisi?tab=Perlu+disposisi&from=" + from + "&to=" + to}
              >
                <strong>{data.pending.length}</strong>Surat belum didisposisikan
              </Link>
              {data.rows.map(([label, rows]) => (
                <button
                  key={label}
                  onClick={() => {
                    setSelected(label);
                    setUnit("");
                  }}
                  aria-pressed={selected === label}
                >
                  <strong>{rows.length}</strong>
                  {label}
                </button>
              ))}
            </div>
            <h2>
              {selected || "Seluruh kewajiban periode"} · {shown.length}
              {unit
                ? " · " + data.units.find((u) => u.unitId === unit)?.name
                : ""}
            </h2>
            <button
              onClick={() => {
                setSelected("");
                setUnit("");
              }}
            >
              Tampilkan seluruh kewajiban
            </button>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Unit / Penerima</th>
                    <th>Instruksi</th>
                    <th>Status / Tenggat</th>
                    <th>Sumber</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((t) => (
                    <tr key={t.id}>
                      <td>
                        {t.unitName} · {t.userName}
                      </td>
                      <td>{t.instruction}</td>
                      <td>
                        {t.status}
                        <br />
                        {t.deadline ? dateLabel(t.deadline) : "Tanpa tenggat"}
                        {t.completedAt && (
                          <small>Selesai: {dateLabel(t.completedAt)}</small>
                        )}
                      </td>
                      <td>
                        <Link
                          to={"/disposisi/" + t.dispositionId + "?task=" + t.id}
                        >
                          Buka tugas sumber
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h2>Penyelesaian per unit</h2>
            {data.units.map((u) => (
              <p key={u.unitId}>
                {u.name}:{" "}
                <button
                  onClick={() => {
                    setUnit(u.unitId);
                    setSelected("Selesai");
                  }}
                >
                  {u.done} selesai
                </button>{" "}
                dari{" "}
                <button
                  onClick={() => {
                    setUnit(u.unitId);
                    setSelected("");
                  }}
                >
                  {u.total} kewajiban
                </button>{" "}
                ({Math.round((u.done / u.total) * 100)}%)
              </p>
            ))}
            <h2>Waktu proses (jam kalender)</h2>
            {data.metrics.map((m) => (
              <div className="mini-card" key={m.label}>
                <strong>{m.label}</strong>
                <p>
                  Median:{" "}
                  {m.median === undefined
                    ? "Belum ada observasi lengkap"
                    : m.median.toFixed(2) + " jam"}
                </p>
                <p>
                  {m.n} observasi lengkap · {m.missing} belum lengkap/invalid
                </p>
              </div>
            ))}
            <p>
              Perbaikan memakai waktu pengiriman/pemeriksaan terbaru. Timestamp
              yang hilang tidak dianggap nol. Batas tanggal adalah akhir hari
              pada zona aplikasi. Selesai tanpa tenggat tidak dikategorikan
              tepat waktu.
            </p>
          </>
        )}
      </section>
    </>
  );
}
