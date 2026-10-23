import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, dataMode, switchDataMode } from "../storage/db";
import { hasUnsavedChanges } from "../app/unsaved";
import { Badge, Field } from "../components/common";
export function Trial() {
  const letters = useLiveQuery(() => db.letters.toArray()) || [];
  const [selected, setSelected] = useState(
    localStorage.getItem(`trial-letter-${dataMode}`) || "",
  );
  const [manual, setManual] = useState<Record<string, string>>(() =>
    JSON.parse(localStorage.getItem(`trial-checks-${dataMode}`) || "{}"),
  );
  const dispositions =
    useLiveQuery(
      () => db.dispositions.where({ letterId: selected }).toArray(),
      [selected],
    ) || [];
  const tasks =
    useLiveQuery(
      () => db.tasks.where({ letterId: selected }).toArray(),
      [selected],
    ) || [];
  const logs =
    useLiveQuery(
      () => db.activities.where({ letterId: selected }).toArray(),
      [selected],
    ) || [];
  const progress = useLiveQuery(() => db.progress.toArray()) || [];
  const reports = useLiveQuery(() => db.reports.toArray()) || [];
  const settings = useLiveQuery(() => db.settings.get("main"));
  const letter = letters.find((l) => l.id === selected);
  const active = tasks.filter(
    (t) =>
      !dispositions.find((d) => d.id === t.dispositionId)?.cancelled &&
      t.status !== "Dibatalkan",
  );
  const report = reports.filter((r) => tasks.some((t) => t.id === r.taskId));
  const evidence = [
    !!letter,
    logs.some((l) => l.text.includes("Diajukan kepada")),
    false,
    dispositions.some(
      (d) =>
        !d.cancelled &&
        d.recipients.filter((r) => r.kind !== "Tembusan").length >= 2 &&
        d.recipients.some((r) => r.kind === "Tembusan"),
    ),
    false,
    logs.some((l) => l.text.includes("accept →")),
    progress.some((p) => tasks.some((t) => t.id === p.taskId)) &&
      report.some((r) => r.attachmentIds.length > 0),
    report.length > 0,
    logs.some((l) => l.text.includes("return →")),
    logs.some((l) => l.text.includes("approve →")) &&
      tasks.some((t) => report.filter((r) => r.taskId === t.id).length > 1),
    !!letter &&
      active.length > 0 &&
      active.every((t) => t.status === "Selesai") &&
      ["Selesai", "Diarsipkan"].includes(letter.status),
    false,
    !!settings?.lastBackupAt,
    !!localStorage.getItem(`restored-${db.name}`),
    false,
  ];
  const steps = [
    "Registrasi surat contoh",
    "Ajukan kepada pimpinan",
    "Ganti ke peran Kepala RSAU",
    "Disposisikan kepada dua unit dan satu tembusan",
    "Ganti peran penerima",
    "Konfirmasi menerima",
    "Tambahkan progres dan bukti",
    "Kirim hasil",
    "Kembalikan satu hasil untuk perbaikan",
    "Kirim ulang dan terima hasil",
    "Pastikan status agregat benar",
    "Cetak disposisi",
    "Cadangkan data lengkap",
    "Pulihkan cadangan",
    "Uji kembali saat offline",
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PANDUAN UJI SATU PERANGKAT</p>
          <h1>Uji Coba Sistem</h1>
          <p className="muted">
            Checklist hanya memakai bukti pada surat terpilih. Pemeriksaan
            manual tidak dianggap verifikasi otomatis.
          </p>
        </div>
        <Link className="button primary" to="/surat-masuk/baru">
          Mulai registrasi
        </Link>
      </div>
      <section className="panel">
        <h2>Pilih ruang data</h2>
        <p>
          Data lokal pengguna memakai database lama. Data contoh memakai
          database terpisah. Reset contoh tidak menyentuh data pengguna.
        </p>
        <div className="row">
          <strong>
            Mode aktif:{" "}
            {dataMode === "demo" ? "Data contoh" : "Data lokal pengguna"}
          </strong>
          {(["demo", "local"] as const)
            .filter((m) => m !== dataMode)
            .map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  if (hasUnsavedChanges()) {
                    alert("Simpan atau ekspor formulir terlebih dahulu.");
                    return;
                  }
                  switchDataMode(mode);
                }}
              >
                Buka{" "}
                {mode === "demo"
                  ? "mode data contoh"
                  : "mode data lokal pengguna"}
              </button>
            ))}
        </div>
        <Field label="Surat untuk skenario terpandu">
          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              localStorage.setItem(`trial-letter-${dataMode}`, e.target.value);
            }}
          >
            <option value="">Pilih surat hasil registrasi Anda</option>
            {letters.map((l) => (
              <option key={l.id} value={l.id}>
                {l.agenda} — {l.subject}
              </option>
            ))}
          </select>
        </Field>
        {letter && (
          <Link to={`/surat-masuk/${letter.id}`} className="button">
            Lanjutkan di detail surat
          </Link>
        )}
        <ol className="guided-list">
          {steps.map((s, i) => {
            const verified = !!selected && evidence[i];
            const status = verified
              ? "Terverifikasi oleh aplikasi"
              : manual[i] || "Belum diuji";
            return (
              <li key={s}>
                <div>
                  <strong>
                    {i + 1}. {s}
                  </strong>
                  <Badge>{status}</Badge>
                </div>
                {!verified && (
                  <select
                    aria-label={`Penilaian langkah ${i + 1}`}
                    value={manual[i] || "Belum diuji"}
                    onChange={(e) => {
                      const next = { ...manual, [i]: e.target.value };
                      setManual(next);
                      localStorage.setItem(
                        `trial-checks-${dataMode}`,
                        JSON.stringify(next),
                      );
                    }}
                  >
                    <option>Belum diuji</option>
                    <option>Dikonfirmasi manual pengguna</option>
                    <option>Gagal</option>
                  </select>
                )}
              </li>
            );
          })}
        </ol>
        <Link className="button" to="/pusat-data">
          Buka Pusat Data Lokal
        </Link>
      </section>
    </>
  );
}
export function Help() {
  return (
    <>
      <div className="page-heading">
        <h1>Bantuan singkat</h1>
        <Link className="button primary" to="/uji-coba">
          Mulai uji coba
        </Link>
      </div>
      <section className="panel">
        <h2>Mulai uji coba</h2>
        <p>
          Buka Uji Coba Sistem, pilih data contoh terpisah, lalu ikuti
          checklist. Pilih peran pada kanan atas untuk simulasi; ini bukan
          autentikasi.
        </p>
        <h2>Cara disposisi</h2>
        <p>
          Petugas meregistrasi dan mengajukan surat. Kepala RSAU memilih
          penerima utama, pendukung, tembusan, instruksi dan tenggat, memeriksa
          ringkasan, lalu menerbitkan. Revisi dan pembatalan membutuhkan alasan.
        </p>
        <h2>Cara mengirim hasil</h2>
        <p>
          Penerima mengonfirmasi terima, menambahkan progres, kemudian mengirim
          laporan hasil dan bukti. Komentar “siap” bukan penyelesaian. Jika
          hasil dikembalikan, perbaiki dan kirim ulang. Pemberi tugas menerima
          hasil sebelum tugas wajib selesai.
        </p>
        <h2>Cara mencadangkan data</h2>
        <p>
          Buka Pusat Data Lokal, pilih Buat cadangan lengkap ZIP. Simpan di luar
          browser ini. Untuk pemulihan, pilih paket, periksa ringkasan dan
          setiap konflik ID. Penggantian membuat cadangan otomatis. Transfer
          data dilakukan manual, bukan sinkronisasi.
        </p>
        <h2>Offline dan pembaruan</h2>
        <p>
          Kunjungan pertama perlu internet. Tunggu “Siap digunakan offline”.
          Saat versi baru tersedia, simpan formulir sebelum menekan pembaruan.
          Pengingat hanya dihitung ketika aplikasi dibuka atau aktif; browser
          tertutup tidak dijamin menampilkan pengingat.
        </p>
        <p>
          Data terkait dengan browser dan origin. Menghapus data situs atau
          menutup mode privat dapat menghapus data. Tidak ada backend, tanda
          tangan elektronik tersertifikasi, pengiriman email atau WhatsApp.
        </p>
      </section>
    </>
  );
}
