# Verifikasi terbaru — Nota Dinas v4 (23 Oktober 2026)

Lingkungan: Node 24, Chromium Linux 154, produksi Vite/PWA pada localhost, IndexedDB nyata untuk skenario browser dan fake-indexeddb untuk tes repository.

| Pemeriksaan                     | Hasil                                                                                                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TypeScript                      | Lolos                                                                                                                                                                                |
| Build produksi / precache lokal | Lolos; peringatan ukuran chunk dan anotasi dependency tidak menghalangi build                                                                                                        |
| Vitest                          | 33 tes lolos (22 regresi dan 11 Nota Dinas)                                                                                                                                          |
| Playwright                      | 17 skenario lolos (13 regresi dan 4 Nota Dinas); 4 skenario nota diulang setelah penyelarasan cetak                                                                                  |
| Alur utama offline              | Dua dasar, enam screenshot/keterangan, reload, pengajuan, catatan bagian, dikembalikan, perbaikan, persetujuan terbaru, nomor, Surat Keluar, pengiriman manual, arsip, ZIP/pemulihan |
| Dua tab                         | Konflik isi mempertahankan input usang; penomoran nota berbeda secara bersamaan unik; nomor dibatalkan tetap dicadangkan                                                             |
| Dokumen                         | DOCX berisi teks editable, format inline, tabel/header berulang, dan enam PNG; XML tidak merasterisasi seluruh naskah                                                                |
| Cetak Chromium                  | Tujuh halaman A4: naskah dan blok tanda tangan utuh di halaman 1, enam gambar/keterangan pada halaman 2–7; diperiksa secara visual, pdftotext, pdfinfo, pdfimages                    |
| LibreOffice                     | DOCX dibuka/dirender menjadi tujuh halaman A4; teks, tabel, tanda tangan, dan lampiran diperiksa. Peringatan cache Fontconfig tidak menghalangi render                               |
| Integrasi                       | Konsep dari Surat Masuk, referensi disposisi/tugas/berkas, pendaftaran sumber/versi idempoten, salinan asli lampiran tetap sama setelah crop/rotasi                                  |
| Input/template                  | Tempelan Word hanya teks polos; penggantian template menampilkan pratinjau/konfirmasi; placeholder menghalangi pengajuan                                                             |
| Cadangan                        | ZIP v4 nota/versi/catatan/template/profil/nomor/Blob pulih; referensi hilang dan konflik nomor ditolak; paket v2/v3 diterima                                                         |
| Migrasi                         | v3→v4 mempertahankan surat, naskah generik, dan Blob; tes migrasi lama tetap lolos                                                                                                   |

Skenario utama nota mematikan koneksi browser setelah service worker/cache siap dan mencatat **nol permintaan HTTP ke domain eksternal**. Tampilan mobile diuji pada 390 px, dengan tab Isi/Pratinjau dan tanpa overflow halaman. Nama database pengguna tidak berubah dan seed tidak mereset data lama.

Kegagalan selama pengembangan yang telah diperbaiki: deteksi placeholder salah membaca tanda kurung array JSON; selesainya tindakan pemeriksaan menghapus catatan baru yang mulai diketik; jarak paragraf umum aplikasi membuat cetak berbeda dari konfigurasi nota. Uji akhir lolos. Hitungan gambar pada tes DOCX juga diperbaiki agar tidak menghitung entri direktori ZIP sebagai gambar.

Belum dijalankan: pembandingan dengan contoh resmi RSAS (belum diberikan), Microsoft Word, printer fisik, Safari/iOS, Firefox, serta deployment HTTPS versi baru. Pratinjau kontinu dan pengolah kata dapat membagi halaman berbeda pada isi lain. Nomor hanya dijamin dalam database yang sama; riwayat lokal bukan audit tahan perubahan; persetujuan/peran hanya simulasi.

Panduan: [NOTA_DINAS.md](NOTA_DINAS.md). Contoh yang dapat ditinjau: [examples](../examples/README.md). Hasil pengujian lain berada di test-results/ dan tidak masuk Git.

---

# Verifikasi tahap 3

TypeScript dan build produksi lolos. **22 tes repository dan 13 skenario Chromium** lolos. Sembilan skenario lama tetap dijalankan; empat skenario baru mencakup naskah/DOCX/persetujuan versi, agenda/ICS/notulen/bundel, PDF.js worker lokal dan XLSX/bulk/analisis. Keempatnya dijalankan dengan koneksi browser dimatikan setelah cache siap. Pengujian PDF tidak membuat permintaan ke domain eksternal.

Migrasi v2→v3 mempertahankan metadata/Blob. ZIP skema 3 memuat entitas baru, versi naskah, notulen/bundel dan lampiran; paket skema 2 tetap dapat dibaca. Tes memeriksa pemulihan, bukan hanya keberadaan tombol ekspor.

Contoh DOCX diekspor melalui browser dan diverifikasi sebagai XML teks yang dapat diedit. Dua contoh juga dibuka LibreOffice dan dirender sebagai PDF A4 satu halaman; teks/tampilan diperiksa. Pratinjau/cetak naskah A4 dijalankan di Chromium. Microsoft Word, printer fisik, format resmi RSAS, Safari/Firefox dan deployment HTTPS versi baru belum diverifikasi. Tidak ada OCR; PDF tanpa lapisan teks diberi keterangan.

Panduan reproduksi: [STAGE3.md](STAGE3.md). Contoh DOCX: [examples](../examples/README.md). Hasil lokal lainnya berada di `test-results/` (tidak masuk Git).

---

# Verifikasi v2

Lingkungan: Node 24, Chromium Linux, build produksi Vite melalui localhost. Daftar ini mencatat pengujian nyata pada PR; checklist di dalam aplikasi tetap bergantung pada skenario pengguna.

| Pemeriksaan                                                          | Hasil                                                                             |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| TypeScript                                                           | Lolos                                                                             |
| Build produksi dan precache Workbox                                  | Lolos                                                                             |
| Vitest                                                               | 15 tes lolos, bukan zero-test run                                                 |
| Playwright                                                           | 9 skenario lolos                                                                  |
| Alur dua penerima, tembusan, progres, hasil/review/perbaikan/arsip   | Lolos                                                                             |
| Migrasi v1→v2 menjaga metadata/Blob                                  | Lolos                                                                             |
| Agenda otomatis serentak dan koreksi usang di dua tab                | Lolos                                                                             |
| ZIP asli, checksum, referensi rusak, konflik dan transaksi pemulihan | Lolos                                                                             |
| Quota disimulasikan pada penambahan Blob                             | Input tetap tersedia; tidak ada pesan sukses                                      |
| Offline produksi dengan jaringan browser dimatikan                   | Deep link, pencarian, surat/lampiran, disposisi, progres, cetak dan ZIP lolos     |
| Browser ditutup lalu profil sama dibuka kembali offline              | Metadata dan byte lampiran tersedia                                               |
| Pembaruan service worker                                             | Formulir kotor menahan update; draf tersedia setelah update                       |
| Reset database contoh                                                | Surat pengguna pada database lokal tetap tersedia                                 |
| Desktop, tablet 820 px, mobile 360 px, keyboard Enter pada tautan    | Lolos                                                                             |
| Cetak PDF A4                                                         | Normal satu halaman; catatan panjang berlanjut dan tidak kehilangan penanda akhir |
| Deployment HTTPS versi baru                                          | Belum diuji; tidak dilakukan deployment dari sesi ini                             |
| Safari/iOS, Firefox, pemasangan PWA, printer fisik                   | Belum diuji                                                                       |

File hasil lokal: `test-results/`. Paket dan profil browser uji tidak ditambahkan ke Git. Kunjungan pertama secara penuh offline belum dapat mengunduh aplikasi; koneksi awal tetap diperlukan.
