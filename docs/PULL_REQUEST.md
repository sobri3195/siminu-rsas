## Perubahan

Aplikasi sebelumnya berfokus pada registrasi, disposisi dan tindak lanjut surat. PR ini menambahkan penyusunan lima jenis naskah terstruktur dengan autosave, pratinjau A4, DOCX berbasis teks, versi immutable dan pemeriksaan berjenjang. Keputusan terikat pada versi; perubahan isi meminta pemeriksaan ulang sambil mempertahankan riwayat dan korespondensi yang sudah bernomor. Template awal secara eksplisit generik karena format resmi belum tersedia.

Agenda yang ada diperluas dengan undangan pimpinan/unit, peringatan benturan, perwakilan/kehadiran, hasil kegiatan dan ICS. Notulen menghasilkan tugas berdasarkan ID keputusan setelah konfirmasi, sehingga klik berulang tidak menggandakan tugas. Berkas kegiatan menautkan dokumen sumber dan menampilkan kronologi serta pekerjaan terbuka tanpa menyalin/menghapus sumber.

Pencarian isi memanfaatkan data lokal dan PDF.js worker yang ikut cache offline. CSV/XLSX memiliki pemetaan, pratinjau, validasi dan hasil per baris tanpa menimpa data lama. Pilihan banyak surat mendukung label, bundel, CSV/cetak dan arsip bersyarat dengan hasil per item. Laporan waktu memakai median/n/kelengkapan timestamp dan tidak menganggap nilai yang hilang sebagai nol. Bantuan menambahkan panduan yang dapat dilewati/dibuka ulang.

Migrasi Dexie v3 mempertahankan data lama. ZIP skema 3 mencakup entitas baru, versi, notulen dan lampiran; paket skema 2 tetap kompatibel. Contoh DOCX dan panduan uji disertakan.

## Validasi

- TypeScript dan build produksi lolos.
- 22 tes repository mencakup workflow lama, DOCX teks, versi/persetujuan, ICS/zona waktu, idempotensi keputusan, tautan berkas, CSV/impor, bulk parsial, median, cadangan baru/kompatibilitas v2, dan migrasi Blob v2→v3.
- 13 skenario Chromium pada build produksi mencakup sembilan regresi sebelumnya dan empat alur baru. Naskah/DOCX, agenda/ICS/notulen/bundel, PDF.js worker, XLSX/bulk/analisis diuji dengan koneksi browser dimatikan.
- PDF tanpa lapisan teks diberi keterangan yang benar; pengujian PDF mencatat bahwa tidak ada permintaan ke domain eksternal.
- Dua contoh DOCX dirender dengan LibreOffice menjadi PDF A4 satu halaman; teks dan tampilannya diperiksa.

## Batasan

Template resmi, render DOCX pada Microsoft Word, printer fisik, Safari/Firefox dan deployment HTTPS baru belum diverifikasi. Tidak ada OCR, backend, sinkronisasi multiuser, autentikasi identitas atau tanda tangan elektronik tersertifikasi. XLSX hanya lembar pertama; ekstraksi PDF dibatasi 500 halaman per berkas. Laporan memakai jam kalender; data historis tanpa timestamp dikecualikan. Rincian dan langkah reproduksi ada di docs/STAGE3.md.
