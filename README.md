# SIMINU RSAS

Sistem Informasi Manajemen Administrasi Umum RSAU Prof. dr. Abdulrachman Saleh. Frontend React + Vite + TypeScript untuk uji satu perangkat, tanpa backend, API key, CDN fungsi utama, atau layanan berbayar. Tema dan alur aplikasi sebelumnya dipertahankan. Lihat [inventaris perubahan](docs/INVENTORY.md).

## Modul Nota Dinas (v4)

Menu Nota Dinas menyediakan editor terstruktur, tujuh template isi, profil penandatangan per unit, autosave/versi, pemeriksaan simulasi, revisi terkunci, nomor transaksional, lampiran gambar, DOCX, cetak A4, Surat Keluar, dan arsip. Lihat [panduan Nota Dinas](docs/NOTA_DINAS.md). Format mengikuti struktur teks RSAS yang diberikan dan dapat diatur; kesesuaiannya dengan contoh resmi masih perlu diperiksa pengguna.

## Pengembangan tahap 3

Pembuat Naskah menyediakan Nota dinas, Surat undangan, Surat pengantar, Surat tugas dan Laporan kegiatan dengan draf otomatis, DOCX teks yang dapat diedit, pemeriksaan/paraf berjenjang dan riwayat versi. Perubahan isi membatalkan persetujuan untuk versi baru. Template awal **generik**, bukan format resmi.

Agenda pimpinan, notulen, tugas keputusan idempoten, berkas kegiatan, pencarian isi PDF lokal, impor CSV/XLSX, pemrosesan massal, median waktu proses dan bantuan interaktif tersedia pada menu. Baca [panduan tahap 3](docs/STAGE3.md) dan [contoh DOCX](examples/README.md) untuk alur lengkap serta batasannya.

## Menjalankan dan memeriksa

Node.js 22.12+; divalidasi dengan Node 24 dan Chromium Linux.

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run preview
npm run test:e2e
```

Playwright membangun aplikasi dan menjalankan preview produksi. Chromium sistem `/usr/bin/chromium` digunakan bila tersedia; pada mesin lain jalankan `npx playwright install chromium`. Berkas hasil browser dan cetak ditulis ke `test-results/`, tidak masuk Git. `npm run dev` bukan bukti offline berfungsi.

## PWA, pemasangan dan pembaruan

Kunjungan pertama membutuhkan internet untuk mengunduh JavaScript, CSS, ikon, manifest dan app shell lokal. Tunggu indikator **Siap digunakan offline**. Indikator ini memerlukan service worker aktif dan aset penting tersedia dalam Cache Storage. Selanjutnya deep link React Router, metadata dan Blob lampiran dapat dibuka pada browser/origin yang sama saat offline. Halaman bantuan pemuatan dan fallback HTML tersedia jika skrip belum berhasil dimuat; kunjungan pertama ketika perangkat sudah offline tetap membutuhkan koneksi.

Gunakan menu **Install app / Pasang aplikasi** browser jika tersedia. Pemasangan tidak wajib dan dukungannya berbeda antarbrowser. Service worker membutuhkan HTTPS atau localhost yang dipercaya. Aplikasi menampilkan Online/Offline dan pemberitahuan versi baru. Tombol pembaruan menolak reload saat ada formulir belum disimpan; simpan/tutup formulir dahulu. Draf metadata registrasi tetap tersimpan, tetapi berkas yang belum disimpan perlu dipilih ulang.

Cache Storage hanya memuat aset aplikasi. Surat, disposisi, tugas dan lampiran berada pada IndexedDB. Tidak ada sinkronisasi otomatis antarperangkat atau antarbrowser.

## Data lama dan mode uji

Database pengguna tetap bernama `siminu-rsas-v1`; namanya dipertahankan meskipun skemanya dimigrasikan hingga versi 3. Migrasi menambahkan revisi surat, kunci register/tahun, sequence transaksi, kamus master, cadangan pemulihan, serta menandai tugas disposisi yang dibatalkan. Metadata dan byte lampiran lama tidak direset. Koneksi ditutup saat upgrade membutuhkan penutupan tab lain.

**Uji Coba Sistem** menyediakan pilihan data lokal pengguna dan data contoh. Data contoh memakai database terpisah `siminu-rsas-demo-v2` berisi 32 surat masuk, 10 surat keluar, PDF fiktif dan berbagai status. Database lokal baru berisi master awal tanpa surat contoh. Database yang sudah berisi data tidak di-seed ulang. Reset contoh di Pengaturan hanya tersedia pada mode contoh dan tidak menghapus database pengguna.

Checklist terpandu memakai surat yang dipilih. Status dibedakan menjadi Terverifikasi oleh aplikasi, Dikonfirmasi manual pengguna, Belum diuji, dan Gagal. Pemeriksaan cetak fisik atau tindakan offline menyeluruh tidak otomatis dianggap lulus. Menu Bantuan menjelaskan registrasi, disposisi, pengiriman hasil, cadangan, dan offline.

## Alur surat

Petugas meregistrasi surat, mengunggah berkas, lalu mengajukan ke pimpinan. Kepala RSAU menetapkan penerima utama, pendukung, tembusan, instruksi dan tenggat. Penerima mengonfirmasi terima, menambah progres, dan mengirim laporan hasil/bukti. Hasil dapat dikembalikan dengan alasan. Surat tetap terbuka sampai semua tugas wajib aktif selesai; tembusan, komentar “siap”, dan tugas dibatalkan tidak menambah pembagi penyelesaian.

Revisi/pembatalan disposisi dan koreksi metadata membutuhkan alasan. Koreksi menyimpan sebelum/sesudah dan revisi saat formulir dibuka; edit usang dari tab lain ditolak sambil menjaga input. Nomor agenda otomatis dialokasikan dalam transaksi berdasarkan tahun/register. Nomor yang dikoreksi manual tetap diperiksa keunikannya. Tidak ada penghapusan permanen untuk surat yang diproses; penutupan beralasan mempertahankan tugas dan riwayat.

Agenda mencatat waktu, PIC, lokasi dan surat terkait. Pengingat dihitung saat aplikasi dibuka/aktif, bukan dijamin saat browser tertutup. Surat keluar mencatat tahapan, lampiran, tujuan dan tanggal pengiriman; aplikasi tidak mengirim korespondensi. Master yang digunakan dinonaktifkan, bukan dihapus.

## Pusat Data Lokal

**Cadangan lengkap ZIP** berisi metadata JSON, manifest skema 4 (kompatibel paket skema 2/3), versi aplikasi, waktu ekspor, jumlah entitas, nama/ukuran berkas dan SHA-256, serta byte asli semua lampiran surat, bukti hasil dan surat keluar. Tidak mengekspor blob URL. Ekspor metadata JSON lama tetap tersedia sebagai pelengkap tanpa isi berkas.

Pemulihan memeriksa format/versi, struktur ZIP, jumlah/ukuran, ID unik, referensi, hierarki dan checksum sebelum menulis. Batas saat ini: paket 150 MB, per berkas 30 MB, maksimal 2.500 lampiran. Untuk Gabungkan, selesaikan setiap konflik ID dengan pilihan data lokal atau impor. Data yang berubah setelah pratinjau meminta peninjauan ulang. Untuk Ganti seluruh data, paket pemulihan otomatis disimpan dalam transaksi yang sama sebelum mengganti data aktif dan dapat diunduh. Pemulihan atomik menampilkan jumlah berhasil, dilewati dan konflik. Mode database lain tidak disentuh.

Periksa estimasi kapasitas, referensi lampiran hilang, tanggal cadangan terakhir, dan minta persistent storage melalui tindakan pengguna. Browser boleh menolak persistent storage; aplikasi tetap berfungsi. Salin ZIP ke tempat lain secara manual. Cadangan otomatis di browser yang sama tidak melindungi dari penghapusan data situs. Jika quota penuh atau simpan gagal, input dipertahankan dan draf metadata dapat diekspor. Jangan menganggap penyimpanan browser sebagai arsip permanen; mode privat, penghapusan profil/data situs atau tekanan kapasitas dapat menghapusnya.

## Cetak dan deployment

Cetak disposisi, detail surat, agenda dan laporan menggunakan A4/teks hitam dengan penanda CONTOH/DEMO. Identitas rumah sakit/pejabat diambil dari Pengaturan. Tidak ada tanda tangan atau stempel palsu. PDF resmi Format Disposisi.pdf belum disediakan; bandingkan dengan sumber itu sebelum penggunaan resmi. Isi panjang dilanjutkan tanpa memotong teks.

Vercel: framework Vite, build `npm run build`, output `dist`. `vercel.json` menyediakan fallback SPA dan mengecualikan service worker, Workbox, manifest, ikon serta aset statis; `sw.js` menggunakan no-cache. PR ini tidak berarti deployment telah dilakukan. Akses deployment referensi pada sesi ini ditolak proxy, sehingga pengujian HTTPS deployment tidak diklaim.

## Bukti verifikasi dan batasan

Tes repository memeriksa alur multiunit/tembusan/perbaikan, pembatalan/riwayat, delegasi siklik, agenda bersamaan, konflik revisi, migrasi v1→v2→v3→v4 beserta Blob, ZIP/checksum/referensi rusak, pemulihan/konflik/cadangan otomatis dan CSV formula.

Skenario Chromium memakai build produksi: alur surat hingga arsip; offline dengan koneksi browser dimatikan; URL detail langsung, pencarian, surat/lampiran baru, disposisi, progres, cetak dan ZIP saat offline; restart browser dengan profil sama; dua tab; simulasi quota; pemulihan ZIP melalui UI; reset contoh yang menjaga data lokal; pembaruan service worker saat draf terbuka; desktop, tablet, keyboard, dan 360 px. Pengujian cetak menghasilkan PDF normal dan catatan panjang; ini bukan pengujian semua printer fisik.

Belum diverifikasi: Safari/iOS, Firefox, pemasangan PWA oleh pengguna, printer fisik, dan deployment HTTPS versi baru. Pemilihan peran bukan autentikasi, pembatasan frontend bukan kontrol keamanan, dan riwayat lokal bukan audit tahan perubahan. Tidak ada pengiriman email/WhatsApp, notifikasi push, OCR atau tanda tangan elektronik tersertifikasi. Semua data contoh fiktif; monogram RSAS bukan lambang resmi.
