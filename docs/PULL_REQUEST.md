## Perubahan

Aplikasi sebelumnya membutuhkan koneksi untuk memuat aset dan hanya menyediakan cadangan metadata. PR ini menambahkan PWA dengan cache app shell, deep link offline, indikator kesiapan cache, dan pembaruan service worker yang ditahan saat formulir belum disimpan.

Pusat Data Lokal mengekspor ZIP berisi metadata, manifest dan lampiran asli dengan SHA-256. Pemulihan memvalidasi skema/ukuran/jumlah/referensi/checksum, menyediakan pilihan konflik per ID, dan membuat cadangan otomatis sebelum penggantian dalam transaksi. Perubahan setelah pratinjau meminta peninjauan ulang.

Database pengguna lama dipertahankan melalui migrasi Dexie v2; data contoh memakai database terpisah. Ditambahkan koreksi metadata beralasan dengan revisi antar-tab, nomor agenda transaksional, status tugas Dibatalkan beserta riwayat sebelumnya, pengingat ketika aplikasi aktif, agenda dengan waktu/PIC/surat terkait, lampiran dan pengiriman surat keluar, arsip terpadu/favorit, master tambahan, bantuan dan checklist uji terpandu. Tema dan alur utama dipertahankan.

## Validasi

- TypeScript dan build produksi lolos.
- 15 tes repository: alur tugas, migrasi/Blob, agenda bersamaan, koreksi usang, ZIP/checksum/referensi/konflik, pemulihan/cadangan otomatis, CSV formula.
- 9 skenario Chromium pada build produksi: alur surat sampai arsip, koneksi browser dimatikan, deep link/data/lampiran/disposisi/progres/cetak/ZIP offline, restart profil browser, dua tab, quota, pemulihan ZIP melalui UI, pembaruan service worker yang menjaga draf, isolasi reset contoh, desktop/tablet/360 px dan keyboard.
- Cetak A4 menghasilkan dokumen normal satu halaman serta catatan panjang dengan penanda akhir tetap tersedia.

## Batasan

Belum diuji pada Safari/iOS, Firefox, pemasangan PWA oleh pengguna, printer fisik, atau deployment HTTPS versi baru. Akses deployment referensi ditolak proxy lingkungan. Tidak ada backend, autentikasi produksi, sinkronisasi, pengiriman korespondensi, notifikasi saat browser tertutup, atau tanda tangan elektronik tersertifikasi. Batas ZIP: 150 MB per paket, 30 MB per berkas, maksimal 2.500 lampiran. Format cetak tetap perlu dibandingkan dengan PDF resmi yang belum tersedia.
