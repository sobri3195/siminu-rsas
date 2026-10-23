# Nota Dinas — panduan uji coba

Modul khusus tersedia di **Nota Dinas** (/nota-dinas). Pembuat Naskah generik dan dokumen lama tetap dapat dibuka. Migrasi tambahan skema 4 mempertahankan nama database dan seluruh data lama; mode contoh tetap terpisah.

## Format RSAS dan profil unit

Kop awal profil IT mengikuti struktur teks permintaan pengguna: **RSAU Prof. dr. ABDULRACHMAN SALEH / INFORMASI TEKNOLOGI / NOTA DINAS**.

Profil IT/SIMRS memuat jabatan Kepala IT / Kasubinstalyangadar, dr. Muhammad Sobri Maulana, Kapten Kes, NRP 3222107950555311, Jakarta. Unit lain memakai penandatangan kosong. Admin dapat mengubah/menambah profil melalui **Template & pengaturan nota**. Satu profil terhubung ke satu unit; pengaturan baru tidak mengubah snapshot nota lama.

**Contoh format resmi belum disediakan.** DOCX lama dalam proyek adalah contoh generik. Format baru mengikuti struktur teks pengguna dengan nilai awal A4, Times New Roman 12 pt, jarak baris 1,15, jarak paragraf 6 pt, margin atas/bawah/kanan 20 mm, kiri 25 mm, ruang tanda tangan 22 mm. Semua nilai dapat diatur pada profil atau konsep. Pengguna perlu membandingkan kop, margin, font, jarak, dan posisi tanda tangan dengan sumber resmi. Checkbox pemeriksaan format memerlukan nama sumber dan merupakan pernyataan pengguna.

ID internal, nomor konsep, nomor resmi, tanggal konsep, dan tanggal penandatanganan disimpan terpisah. Tanggal penandatanganan awal kosong; isi sebelum pengajuan bila akan diberi nomor, agar termasuk isi yang diperiksa. Perubahan tanggal setelah persetujuan memerlukan revisi dan pemeriksaan ulang. Tidak ada tanda tangan atau stempel buatan.

## Alur utama

1. Pilih **Admin Sistem** untuk mencoba seluruh tindakan, atau peran terpisah. Buat nota, pilih unit **KA SIMRS** dan template. Tersedia tujuh template: pengembangan sistem, persetujuan kegiatan, laporan kegiatan, inventarisasi perangkat, pemeliharaan, kerja sama, dan kosong.
2. Isi identitas, beberapa dasar, pembukaan, uraian, rekomendasi, penutup, tembusan, dan penandatangan. Template memiliki placeholder dan petunjuk; aplikasi tidak mengarang dasar hukum, biaya, hasil, atau persetujuan.
3. Format teks memakai penanda **, garis bawah, baris daftar angka/huruf, dan tabel dengan pemisah |. Tombol format menyisipkan sintaks terbatas ini. Tempelan Word diambil sebagai teks polos; tabel Word perlu disusun kembali melalui tombol Tabel. HTML/CSS dan skrip tempelan tidak dijalankan.
4. Tunggu **Tersimpan**, atau **Simpan sekarang**. Autosave setelah jeda 900 ms menyimpan isi/lampiran baru secara atomik. Kegagalan mempertahankan input dan menghentikan percobaan otomatis berulang. Unduh DOCX atau salinan isi JSON, serta lampiran terpisah bila diperlukan. Salinan isi JSON tidak memuat byte berkas dan bukan cadangan lengkap.
5. Pilih pemeriksa aktif sesuai unit, pimpinan, atau admin. Urutan terlihat dalam daftar dan dapat diubah melalui tombol Dahulukan. Checklist wajib menolak tujuan/pengirim/perihal/isi/penandatangan kosong, placeholder, serta lampiran yang disebut tetapi belum tersedia. Dasar kosong menjadi saran editorial. Checklist bukan verifikasi hukum atau kebenaran isi.
6. Ajukan. Pemeriksa aktif dapat mulai memeriksa, mencatat bagian tertentu, mengembalikan dengan alasan, atau menyelesaikan pemeriksaan. Kepala RSAU/Admin menyetujui setelah semua pemeriksa selesai. Setiap tindakan mencatat pengguna, waktu, catatan, bagian, dan versi.
7. Isi disetujui terkunci. Pembuat/admin mengisi alasan dan memilih **Buat revisi** untuk mengubahnya. Persetujuan lama tetap tercatat tetapi tidak berlaku pada versi baru; nomor dan Surat Keluar lama dipertahankan.
8. Petugas/Admin mengonfirmasi tanggal yang telah diperiksa, lalu **Beri nomor resmi**. Pola awal B/{register}-{seq}/{month}/{year}/{unit}, misalnya B/ND-0001/X/2026/IT. Bulan Romawi mengikuti tanggal penandatanganan. Transaksi mencakup penghitung dan reservasi nomor. Pembatalan beralasan tidak menghapus reservasi.
9. **Daftarkan ke Surat Keluar** memakai ID sumber/versi sehingga pengulangan tidak membuat duplikat. Isi saluran serta catatan dan pilih **Catat pengiriman manual**. Ini catatan pengguna, tanpa pengiriman email/WhatsApp. Arsip mempertahankan versi, komentar, hubungan, dan berkas.
10. Cari/filter tahun, unit, pembuat, atau status di daftar. **Riwayat** membuka perbandingan dua snapshot atau snapshot terhadap editor. Pemulihan memerlukan alasan pada konsep yang dapat diedit dan selalu membuat versi baru. Duplikat memiliki ID dokumen/lampiran baru tanpa nomor/persetujuan.

Peran lokal merupakan simulasi, bukan autentikasi atau tanda tangan elektronik tersertifikasi. Nomor tidak dijamin unik antarkomputer tanpa penyimpanan bersama. Impor memeriksa konflik nomor nota/Surat Keluar; konflik referensi ditolak tanpa perubahan database.

## Lampiran, pratinjau, dan ekspor

Pilih PDF, JPG, PNG, atau DOCX dari perangkat, termasuk screenshot yang sudah diambil pengguna. Batas 15 MB per berkas dan 100 lampiran per nota. Setiap lampiran memiliki judul, keterangan, sumber opsional, serta urutan. Melepas lampiran dari versi baru tidak menghapus berkas yang masih dirujuk versi lama.

Gambar dapat dimasukkan pada halaman lanjutan atau menjadi berkas terpisah. Ukuran, rotasi, dan crop persentase tepi diterapkan melalui tindakan pengguna; aslinya tidak diubah. Rasio dipertahankan dan ukuran dibatasi agar muat halaman. Header memuat nomor/tanggal nota, nomor gambar, dan keterangan, dengan placeholder sebelum nomor/tanggal ditetapkan. Lampiran terpisah tercantum dalam daftar dokumen; PDF/DOCX asli tidak digabungkan atau diubah.

Desktop memakai dua panel dan pilihan zoom; mobile memakai tab Isi/Pratinjau. **Pratinjau penuh** memperluas dokumen. Pratinjau kontinu, cetak, dan DOCX berasal dari model dokumen yang sama. Pembagian halaman akhir dapat berbeda antara browser dan pengolah kata. Tanda tangan dikelompokkan, gambar berdekatan dengan keterangan, dan header tabel berulang bila didukung.

**Cetak / Simpan sebagai PDF** membuka fasilitas browser, bukan unduhan PDF langsung. DOCX berisi teks, tabel, dan gambar yang dapat diedit. Draf bertanda DRAF, mode contoh bertanda CONTOH/DEMO, dan nota dibatalkan bertanda DIBATALKAN.

## Integrasi, cadangan, dan offline

Pada detail Surat Masuk pilih **Buat nota dinas dari surat**. Editor dapat mengacu pada surat, disposisi, tugas, serta berkas kegiatan melalui ID sumber. Referensi diperiksa saat simpan/impor. Pencarian Isi mencakup teks nota dan PDF lampiran yang telah diindeks lokal.

Cadangan lengkap ZIP skema 4 memuat nota, snapshot, catatan pemeriksaan, template khusus, profil unit, reservasi nomor, dan byte asli lampiran. Paket skema 2/3 tetap diterima dengan tabel nota kosong. Skema, checksum, pemilik berkas, sumber versi, nomor, dan referensi diperiksa sebelum transaksi pemulihan. Pusat Data Lokal menyediakan pratinjau konflik, penggabungan/penggantian, serta cadangan otomatis sebelum penggantian.

Tunggu **Siap digunakan offline**, putuskan koneksi browser, lalu ulangi buat → edit → periksa → setujui → nomor → DOCX → arsip → ZIP. Seluruh proses berlangsung di browser tanpa mengunggah isi ke layanan eksternal.

Jalankan npm run typecheck, npm test, npm run build, dan npm run test:e2e. Bukti serta batas pengujian tersedia pada [verifikasi](VERIFICATION.md); berkas contoh pada [contoh](../examples/README.md).
