# SIMINU RSAS

Frontend demo Sistem Informasi Manajemen Administrasi Umum RSAU Prof. dr. Abdulrachman Saleh. Seluruh nama dan dokumen contoh fiktif; tidak memuat data pasien. Monogram RSAS bukan lambang resmi.

## Menjalankan

Node.js 22.12+ (divalidasi pada Node 24), npm:

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run preview
```

React + Vite + TypeScript, React Router, Tailwind CSS, Radix Dialog, React Hook Form + Zod, Dexie, Recharts, dan Lucide. Lockfile disertakan. Tidak membutuhkan backend, API key, atau layanan berbayar.

## Demo alur utama

1. Pilih **Petugas Urtu/Administrasi** di kanan atas. Registrasi surat melalui tiga langkah, unggah PDF/gambar, kemudian ajukan ke pimpinan dari detail surat.
2. Pilih **Kepala RSAU**, buka surat dan buat disposisi. Pilih KA SIMRS dan KA URTU sebagai penerima wajib, unit lain sebagai tembusan. Tandai pemeriksaan hasil, periksa ringkasan, lalu terbitkan.
3. Pilih **Kepala Unit** untuk tugas KA SIMRS, atau **Pelaksana** untuk tugas KA URTU. Konfirmasi terima, tambah progres, dan kirim laporan hasil. Admin dapat menguji seluruh tugas.
4. Kepala RSAU menerima hasil atau mengembalikannya dengan alasan. Surat baru selesai jika seluruh tugas wajib aktif termasuk turunan selesai. Tembusan tidak membuat tugas. Diskusi tidak menyelesaikan tugas.
5. Petugas mengarsipkan surat yang selesai. Cetak lembar disposisi melalui detail; gunakan A4 dan Simpan sebagai PDF di browser.
6. Reload: metadata dan Blob tetap tersedia pada browser yang sama. Seed tidak dijalankan ulang jika pengaturan sudah ada.

Data awal: 32 surat masuk, 10 surat keluar, disposisi multiunit, beragam status tugas, dan PDF contoh nyata. Master data menyimpan unit, posisi, serta pengguna terpisah. Label unit mengikuti transkripsi pada spesifikasi, dapat dikoreksi; ini bukan penetapan struktur RSAS terkini. Delegasi dibatasi ke bawahan aktif dan menjaga hubungan induk. Revisi menyimpan disposisi dan tugas lama sebagai riwayat.

## Deployment Vercel

Import repository, pilih framework Vite, build `npm run build`, output `dist`. `vercel.json` menyediakan SPA fallback untuk URL detail dan mempertahankan `/assets/`. Konfigurasi ini belum berarti deployment telah dilakukan.

## Penyimpanan dan batasan

IndexedDB pada origin/browser ini menyimpan metadata dan Blob, melalui lapisan `repositories/`. Backup JSON hanya metadata, tanpa isi lampiran. Impor divalidasi dengan Zod, mendukung gabung atau ganti dengan konfirmasi. Ekspor berkas asli terpisah sebelum memindahkan perangkat. Menghapus data situs menghapus data aplikasi. Kegagalan penyimpanan ditampilkan sebagai error, bukan sukses.

Pemilihan peran adalah simulasi, bukan autentikasi. Pembatasan frontend bukan kontrol keamanan. Riwayat lokal bukan audit tahan perubahan. Notifikasi hanya dalam aplikasi. Tidak ada integrasi TNI AU, email, WhatsApp, OCR, tanda tangan elektronik tersertifikasi, stempel, atau tanda tangan palsu. Surat keluar adalah pencatatan metadata, bukan editor naskah atau layanan pengiriman.

Aset screenshot SIM MINU dan Format Disposisi.pdf tidak tersedia dalam unggahan ini. Cetak disusun dari field/transkripsi spesifikasi, belum diverifikasi terhadap PDF asli. Isi panjang dapat berlanjut ke halaman berikutnya; verifikasi printer/browser target sebelum pemakaian resmi. Identitas pejabat cetak kosong sampai diisi melalui Pengaturan.

## Verifikasi

`npm test` menguji alur dua penerima, pemeriksaan/perbaikan hasil, tembusan, progres “siap”, agenda unik, larangan arsip dini, hierarki delegasi, riwayat revisi/unit nonaktif, seed idempoten, serta persistensi metadata dan PDF setelah database dibuka ulang. Build dan typecheck wajib dijalankan. Pengujian visual/mobile, dialog cetak A4, dan deployment Vercel memerlukan pemeriksaan browser tersendiri; jangan menyamakan tes repository dengan pengujian visual tersebut.
