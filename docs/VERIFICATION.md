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
