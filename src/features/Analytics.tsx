import { useEffect, useState } from "react";
import { db, dataMode } from "../storage/db";
import { processAnalytics } from "../repositories/analytics";
import { useApp } from "../app/context";
import { today } from "../utils";
import { Field } from "../components/common";
export function Analytics() {
  const { run } = useApp();
  const [from, setFrom] = useState(today().slice(0, 7) + "-01");
  const [to, setTo] = useState(today());
  const [data, setData] =
    useState<Awaited<ReturnType<typeof processAnalytics>>>();
  useEffect(() => {
    void run(async () => {
      const zone = (await db.settings.get("main"))?.timezone || "Asia/Jakarta";
      setData(await processAnalytics(from, to, zone));
    }, "");
  }, [from, to]);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {dataMode === "demo" ? "DATA UJI COBA — " : ""}TIMESTAMP KEJADIAN
            LOKAL
          </p>
          <h1>Analisis Waktu Proses</h1>
          <p className="muted">
            Median jam kalender dan jumlah observasi. Data tanpa timestamp
            lengkap dikecualikan, bukan dianggap nol. Kalender kerja belum
            dikonfigurasi.
          </p>
        </div>
        <button onClick={() => window.print()}>Cetak analisis</button>
      </div>
      <div className="toolbar">
        <Field label="Periode mulai">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="Periode selesai">
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
      </div>
      <div className="grid2">
        {data?.metrics.map((m) => (
          <section className="panel" key={m.label}>
            <h2>{m.label}</h2>
            <p className="metric-number">
              {m.median === undefined
                ? "Belum ada data lengkap"
                : `${m.median.toFixed(2)} jam kalender`}
            </p>
            <p>
              {m.n} observasi lengkap · {m.missing} dikecualikan
            </p>
            <small>{m.basis}</small>
          </section>
        ))}
      </div>
      <section className="panel master-extra">
        <h2>Tugas terbuka berdasarkan umur</h2>
        <p>
          Periode pembuatan tugas; umur dihitung sampai saat laporan dibuka.
        </p>
        {data?.ageBuckets.map((b) => (
          <p key={b.label}>
            {b.label}: {b.count}
          </p>
        ))}
        <h2>Selesai sesuai tenggat</h2>
        <p>
          {data?.completed
            ? `${((data.onTime / data.completed) * 100).toFixed(1)}% (${data.onTime}/${data.completed} observasi lengkap)`
            : "Belum ada data lengkap"}
        </p>
        <small>
          {data?.unknownCompletion || 0} tugas selesai tanpa timestamp
          penyelesaian dikecualikan. Tembusan dan tugas dibatalkan tidak masuk
          pembagi.
        </small>
      </section>
    </>
  );
}
