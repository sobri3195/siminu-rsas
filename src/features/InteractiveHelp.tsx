import { useState } from "react";
import { Link } from "react-router-dom";
import { Help } from "./Trial";
import { Modal } from "../components/common";
const journeys = [
  {
    id: "register",
    name: "Mencatat surat",
    steps: [
      [
        "Buka registrasi",
        "/surat-masuk/baru",
        "Isi identitas, tanggal, perihal, jenis dan derajat. Nomor agenda otomatis dialokasikan saat transaksi simpan.",
      ],
      [
        "Tambahkan dokumen",
        "/surat-masuk/baru",
        "Lanjut ke dokumen dan pilih lampiran lokal. Periksa ringkasan sebelum menyimpan.",
      ],
      [
        "Ajukan ke pimpinan",
        "/surat-masuk",
        "Buka surat tersimpan dan ajukan. Peran petugas adalah simulasi.",
      ],
    ],
  },
  {
    id: "disposition",
    name: "Memberikan disposisi",
    steps: [
      [
        "Pilih surat",
        "/disposisi",
        "Pilih peran Kepala RSAU, buka surat menunggu disposisi.",
      ],
      [
        "Pilih penerima",
        "/disposisi",
        "Pisahkan utama/pendukung dari tembusan, isi instruksi serta tenggat.",
      ],
      [
        "Periksa dan terbitkan",
        "/disposisi",
        "Periksa ringkasan sebelum terbit. Revisi memerlukan alasan dan menjaga riwayat.",
      ],
    ],
  },
  {
    id: "results",
    name: "Mengirim hasil",
    steps: [
      [
        "Konfirmasi menerima",
        "/tugas",
        "Buka tugas pribadi dan konfirmasi penerimaan.",
      ],
      [
        "Catat progres",
        "/tugas",
        "Catat tindakan yang dikerjakan. Komentar siap tidak menyelesaikan tugas.",
      ],
      [
        "Kirim hasil",
        "/tugas",
        "Isi laporan, tanggal, kendala dan bukti. Pemberi tugas memeriksa hasil sebelum selesai.",
      ],
    ],
  },
  {
    id: "draft",
    name: "Membuat nota dinas",
    steps: [
      [
        "Pilih template",
        "/nota-dinas",
        "Buat nota dinas dan pilih unit serta template isi. Periksa format RSAS yang dapat diatur; sumber contoh resmi belum disediakan.",
      ],
      [
        "Isi dan simpan",
        "/nota-dinas",
        "Isi identitas, beberapa dasar, uraian, penandatangan, dan lampiran. Tunggu indikator Tersimpan. DOCX berisi teks, tabel, dan gambar.",
      ],
      [
        "Pemeriksaan berjenjang",
        "/nota-dinas",
        "Tambahkan pemeriksa sesuai unit, ajukan, perbaiki jika dikembalikan, lalu persetujuan simulasi dan penomoran.",
      ],
    ],
  },
  {
    id: "invitation",
    name: "Mengelola undangan",
    steps: [
      [
        "Konfirmasi agenda",
        "/agenda",
        "Buka dari surat sumber atau tambahkan kegiatan. Pastikan waktu, tempat, penyelenggara, pejabat dan peserta.",
      ],
      [
        "Tinjau benturan",
        "/agenda",
        "Benturan jadwal adalah peringatan. Simpan hanya setelah meninjau dan mengonfirmasi.",
      ],
      [
        "Catat hasil",
        "/notulen",
        "Tetapkan perwakilan/kehadiran dan buat notulen. Keputusan menjadi tugas setelah konfirmasi.",
      ],
    ],
  },
  {
    id: "backup",
    name: "Cadangan dan pemulihan",
    steps: [
      [
        "Ekspor ZIP lengkap",
        "/pusat-data",
        "Buat ZIP yang menyertakan metadata dan byte lampiran. Simpan di luar browser.",
      ],
      [
        "Validasi paket",
        "/pusat-data",
        "Pilih paket. Periksa ringkasan, versi, checksum dan referensi.",
      ],
      [
        "Selesaikan konflik",
        "/pusat-data",
        "Pilih data lokal atau impor per konflik. Penggantian membuat cadangan otomatis; transfer ini bukan sinkronisasi.",
      ],
    ],
  },
];
export function InteractiveHelp() {
  const [active, setActive] = useState<string>();
  const [step, setStep] = useState(0);
  const guide = journeys.find((g) => g.id === active);
  const move = (n: number) => {
    setStep(n);
    localStorage.setItem("help-progress-" + active, String(n));
  };
  return (
    <>
      <Help />
      <section className="panel master-extra">
        <h2>Panduan langkah demi langkah</h2>
        <p>
          Dibuka atas pilihan Anda, dapat dilanjutkan, dibuka ulang, atau
          dilewati kapan saja. Panduan tidak menandai pemeriksaan sebagai lulus.
        </p>
        <div className="task-grid">
          {journeys.map((g) => (
            <button
              key={g.id}
              onClick={() => {
                setActive(g.id);
                setStep(
                  Math.min(
                    g.steps.length - 1,
                    Math.max(
                      0,
                      Number(
                        localStorage.getItem("help-progress-" + g.id) || 0,
                      ),
                    ),
                  ),
                );
              }}
            >
              Panduan: {g.name}
            </button>
          ))}
        </div>
      </section>
      {guide && (
        <Modal title={guide.name} onClose={() => setActive(undefined)}>
          <p>
            Langkah {step + 1} dari {guide.steps.length}
          </p>
          <h2>{guide.steps[step][0]}</h2>
          <p>{guide.steps[step][2]}</p>
          <div className="toolbar">
            <button disabled={!step} onClick={() => move(step - 1)}>
              Langkah sebelumnya
            </button>
            {step < guide.steps.length - 1 ? (
              <button className="primary" onClick={() => move(step + 1)}>
                Langkah berikutnya
              </button>
            ) : (
              <button className="primary" onClick={() => setActive(undefined)}>
                Tutup panduan
              </button>
            )}
            <Link
              className="button"
              to={guide.steps[step][1]}
              onClick={() => setActive(undefined)}
            >
              Buka modul langkah ini
            </Link>
            <button onClick={() => setActive(undefined)}>Lewati panduan</button>
            <button onClick={() => move(0)}>Mulai ulang panduan</button>
          </div>
        </Modal>
      )}
    </>
  );
}
