# Inventaris sebelum pengembangan v2

Basis pengembangan adalah `main` setelah PR #1 digabung. Tidak ada perubahan pengguna pada checkout saat cabang ini dibuat.

| Area | Sebelum | Pengembangan v2 |
|---|---|---|
| Surat masuk | Form tiga langkah, lampiran IndexedDB, pencarian/filter, draf localStorage | Pencarian ringkasan, urutan/pagination, preferensi filter, koreksi beralasan dengan revisi antar-tab, pin dan penutupan tanpa menghapus |
| Disposisi/tugas | Multiunit, tembusan, progres, hasil, review, revisi, delegasi | Validasi penerima/tenggat, induk disposisi, status Dibatalkan dan riwayat sebelumnya, pengingat lokal |
| Offline | Tidak ada service worker atau app shell cache | vite-plugin-pwa/Workbox, manifest/ikon lokal, cache produksi, deep link, pembaruan yang menjaga draf |
| Data | Satu DB Dexie v1; ekspor metadata JSON | Migrasi v2 menjaga database lama; database contoh terpisah; cadangan ZIP lengkap dan pemulihan tervalidasi |
| Multi-tab | Dexie live queries, belum ada konflik editor | BroadcastChannel untuk pemberitahuan, revisi koreksi, transaksi alokasi nomor dan pemulihan |
| Agenda | Kalender bulanan/daftar tanggal/lokasi | Waktu mulai/akhir, PIC, surat terkait, hari ini/7 hari, cetak |
| Surat keluar | Tahapan metadata tanpa isi lampiran/pengiriman terperinci | Blob lampiran, tujuan/tanggal pengiriman, arsip dan pin |
| Master | Unit/hierarki/PIC, pengaturan pejabat | Jabatan, pengguna simulasi, kamus naskah/instruksi, pola agenda dan interval cadangan |
| Pengujian | Lima tes repository, dua skenario Chromium | Tes migrasi, ZIP/integritas/konflik, quota, offline, restart profil, dua tab, pembaruan SW, dan isolasi mode |

Aplikasi tetap frontend, tanpa backend, layanan berbayar, atau autentikasi produksi. Tema navy, biru, teal dan putih dipertahankan. PDF formulir resmi tidak tersedia pada checkout; format cetak mengikuti acuan tekstual sebelumnya. Akses baca ke deployment referensi ditolak proxy lingkungan, sehingga validasi dilakukan pada source dan build produksi lokal.
