# Verifikasi terbaru — tahap 3

TypeScript dan build produksi lolos. **22 tes repository dan 13 skenario Chromium** lolos. Sembilan skenario lama tetap dijalankan; empat skenario baru mencakup naskah/DOCX/persetujuan versi, agenda/ICS/notulen/bundel, PDF.js worker lokal dan XLSX/bulk/analisis. Keempatnya dijalankan dengan koneksi browser dimatikan setelah cache siap. Pengujian PDF tidak membuat permintaan ke domain eksternal.

Migrasi v2→v3 mempertahankan metadata/Blob. ZIP skema 3 memuat entitas baru, versi naskah, notulen/bundel dan lampiran; paket skema 2 tetap dapat dibaca. Tes memeriksa pemulihan, bukan hanya keberadaan tombol ekspor.

Contoh DOCX diekspor melalui browser dan diverifikasi sebagai XML teks yang dapat diedit. Dua contoh juga dibuka LibreOffice dan dirender sebagai PDF A4 satu halaman; teks/tampilan diperiksa. Pratinjau/cetak naskah A4 dijalankan di Chromium. Microsoft Word, printer fisik, format resmi RSAS, Safari/Firefox dan deployment HTTPS versi baru belum diverifikasi. Tidak ada OCR; PDF tanpa lapisan teks diberi keterangan.

Panduan reproduksi: [STAGE3.md](STAGE3.md). Contoh DOCX: [examples](../examples/README.md). Hasil lokal lainnya berada di `test-results/` (tidak masuk Git).

---

# Verifikasi v2

Lingkungan: Node 24, Chromium Linux, build produksi Vite melalui localhost. Daftar ini mencatat pengujian nyata pada PR; checklist di dalam aplikasi tetap bergantung pada skenario pengguna.

| Pemeriksaan | Hasil |
|---|---|
| TypeScript | Lolos |
| Build produksi dan precache Workbox | Lolos |
| Vitest | 15 tes lolos, bukan zero-test run |
| Playwright | 9 skenario lolos |
| Alur dua penerima, tembusan, progres, hasil/review/perbaikan/arsip | Lolos |
| Migrasi v1→v2 menjaga metadata/Blob | Lolos |
| Agenda otomatis serentak dan koreksi usang di dua tab | Lolos |
| ZIP asli, checksum, referensi rusak, konflik dan transaksi pemulihan | Lolos |
| Quota disimulasikan pada penambahan Blob | Input tetap tersedia; tidak ada pesan sukses |
| Offline produksi dengan jaringan browser dimatikan | Deep link, pencarian, surat/lampiran, disposisi, progres, cetak dan ZIP lolos |
| Browser ditutup lalu profil sama dibuka kembali offline | Metadata dan byte lampiran tersedia |
| Pembaruan service worker | Formulir kotor menahan update; draf tersedia setelah update |
| Reset database contoh | Surat pengguna pada database lokal tetap tersedia |
| Desktop, tablet 820 px, mobile 360 px, keyboard Enter pada tautan | Lolos |
| Cetak PDF A4 | Normal satu halaman; catatan panjang berlanjut dan tidak kehilangan penanda akhir |
| Deployment HTTPS versi baru | Belum diuji; tidak dilakukan deployment dari sesi ini |
| Safari/iOS, Firefox, pemasangan PWA, printer fisik | Belum diuji |

File hasil lokal: `test-results/`. Paket dan profil browser uji tidak ditambahkan ke Git. Kunjungan pertama secara penuh offline belum dapat mengunduh aplikasi; koneksi awal tetap diperlukan.
