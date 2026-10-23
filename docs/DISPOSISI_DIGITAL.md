# Disposisi Digital — panduan uji coba

Modul tersedia di menu **Disposisi Digital** (/disposisi). Semua proses berjalan pada browser/origin yang sama, tanpa backend. Pemilihan peran merupakan simulasi; data tidak otomatis tersinkronisasi antarkomputer.

## Mulai dari surat

1. Pada Surat Masuk, buka surat lalu pilih **Buka Disposisi Digital surat ini**. Atau buka pusat disposisi, pilih tab **Perlu disposisi**, lalu **Susun arahan**. Admin/Kepala RSAU juga dapat memilih **Buat arahan digital** dan surat sumber.
2. Draf menyimpan pemberi dan jabatan dari pengguna/peran yang dipilih. Identitas ini tidak dapat diganti diam-diam pada revisi. Waktu penerbitan dicatat saat konfirmasi terbit.
3. Pilih **Penugasan** (minimal satu penerima wajib) atau **Untuk diketahui** (seluruh penerima informasi/tembusan). Pilihan informasi mengosongkan kewajiban laporan/pemeriksaan; tidak membuat tugas.
4. Cari penerima berdasarkan unit, jabatan, atau nama pengguna aktif. Unit/jabatan/pengguna disimpan terpisah. Pilih jabatan yang sesuai dan masa penugasan yang masih berlaku pada Master Data. Masa yang belum diberikan dibiarkan kosong, bukan ditebak.
5. Pilih beberapa instruksi, isi catatan atau salin template catatan. Tombol **Salin instruksi umum ke penerima** memberi nilai awal yang dapat disesuaikan. Tembusan mendapat **Untuk diketahui**. Pengguna yang sama tidak boleh digandakan dalam peran berbeda.
6. Tenggat umum menjadi nilai awal saat penerima ditambahkan. Gunakan **Terapkan tenggat umum ke penerima** untuk menyalinnya kembali, atau tentukan tenggat khusus tiap penerima. Tenggat penerima kosong berarti **Tanpa tenggat**.
7. Tunggu **Tersimpan** atau simpan manual. Draf otomatis tersimpan setelah jeda 900 ms. Reload memulihkan draf. Kegagalan simpan mempertahankan input, menghentikan percobaan otomatis, dan menyediakan salinan JSON. Konflik revisi dari tab lain tidak menimpa isi terbaru.
8. Pilih **Tinjau penerbitan**, periksa penerima/instruksi/catatan/kewajiban, lalu konfirmasi. Peringatan instruksi bertentangan memerlukan pengakuan pengguna. Memilih template tidak menerbitkan disposisi.
9. Penerbitan, snapshot, status baca, dan tugas disimpan dalam satu transaksi. Pengulangan penerbitan draf yang sama mengembalikan disposisi yang telah dibuat.

## Menerima, bekerja, dan memeriksa hasil

Detail desktop memisahkan dokumen sumber dan arahan. Mobile memakai tab Dokumen/Disposisi. PDF ditampilkan dengan PDF.js/worker lokal, navigasi halaman, zoom, teks halaman, buka, dan unduh; gambar memiliki zoom dan unduhan. Format lain menyediakan unduhan dan penjelasan.

Tab **Penerima dan progres** menyediakan daftar sederhana atau struktur delegasi bertingkat. Tab **Laporan hasil** menampilkan seluruh laporan dan antrean perbaikan.

- Membuka detail menandai baca hanya untuk penerima/pelaksana yang sedang dipilih. Admin yang bukan penerima tidak menandai semua orang membaca.
- Status baca terpisah dari status tugas. Membaca, menerima, diskusi “siap”, dan unduhan tidak menyelesaikan pekerjaan.
- Penerima memilih **Konfirmasi terima**, lalu menyimpan progres dan/atau diskusi secara terpisah.
- Laporan memerlukan tindakan, tanggal pelaksanaan valid, dan hasil. Kendala, langkah berikutnya, serta berkas pendukung bersifat tambahan. Bukti maksimal 20 MB per berkas, disimpan lokal secara atomik bersama laporan.
- Tanpa kewajiban laporan, penerima dapat **Konfirmasi penyelesaian tanpa laporan**, dengan catatan wajib. Bila pemeriksaan diwajibkan, penyelesaian ini juga menunggu pemeriksa.
- Pemeriksa yang ditunjuk atau Admin dapat menerima, mengembalikan dengan alasan, atau meminta tambahan bukti. Setiap pengiriman perbaikan membuat laporan baru; laporan/bukti lama tidak dihapus.
- Tindakan menyimpan pelaku, waktu, versi disposisi, dan data sebelum/sesudah. Timestamp proses berasal dari tindakan sebenarnya; data lama yang tidak memiliki timestamp tidak diberi waktu buatan.

Jika tugas berubah dari tab lain, input tetap tersedia dan penyimpanan ditolak. Tinjau data terbaru, lalu pilih **Saya sudah meninjau versi tugas terbaru** sebelum mencoba kembali.

## Delegasi, revisi, dan pembatalan

Penerima dengan peran pimpinan yang telah menerima tugas dapat mendelegasikan kepada pelaksana dalam unitnya atau pengguna pada unit bawahan langsung. Instruksi/alasan wajib diisi. Siklus dan penerusan ke rantai pengguna yang sama ditolak. Tugas induk tetap terbuka.

Jika **Konsolidasikan hasil bawahan** dipilih, laporan induk ditolak sampai tugas turunan terbuka selesai. Hasil bawahan diperiksa penerima induk, lalu hasil konsolidasi dikirim kepada pemeriksa awal. Delegasi dihitung sebagai kewajiban tersendiri; tampilan progres tetap membedakan tugas induk dan turunan.

Disposisi terbit diubah melalui **Buat revisi arahan**, dengan alasan dan pemeriksaan ringkasan. Catatan/tenggat mencatat sebelum/sesudah; penerima baru memperoleh tugas baru; penerima yang dilepas tidak dihapus dari riwayat. Perubahan instruksi/kebutuhan laporan/pemeriksa yang material meminta konfirmasi penerimaan ulang.

Kewajiban selesai tidak diedit menjadi pekerjaan baru secara diam-diam. Jika dilepas, status selesai dan laporan dipertahankan sebagai riwayat, lalu dikeluarkan dari pembagi aktif. Tambahkan kewajiban baru bila ada pekerjaan baru.

**Perpanjangan tenggat** hanya untuk tugas terbuka dan pemberi/Admin, dengan tanggal baru setelah tenggat lama serta alasan. Nilai lama/baru masuk riwayat dan versi cetak. **Pembatalan** memerlukan alasan dan nomor revisi yang masih sesuai; hanya tugas terbuka yang dibatalkan, sedangkan hasil selesai/bukti tetap tersimpan.

## Agregat, tenggat, dan laporan

Persentase berasal dari seluruh kewajiban aktif, termasuk delegasi. Tembusan, tugas dibatalkan, kewajiban yang dilepas, dan disposisi dibatalkan dikecualikan dari pembagi. Untuk informasi saja, tampilkan jumlah penerima yang membaca, bukan persentase penyelesaian tugas.

Satu surat dapat memiliki beberapa disposisi aktif. Surat belum selesai selama masih ada kewajiban aktif yang terbuka. Arsip tidak menutup tugas; tindakan arsip ditolak sampai seluruh kewajiban selesai. Tembusan belum membaca tidak menghalangi penyelesaian tugas.

Tenggat berupa tanggal berlaku sampai akhir hari di zona aplikasi, yang ditampilkan pada detail. Tanpa tenggat tidak dianggap tepat waktu. Keterlambatan dihitung dari tanggal aplikasi; waktu selesai disimpan untuk membedakan **terlambat dan masih terbuka** dari **selesai melewati tenggat**. Pengingat lokal dihitung ketika aplikasi aktif/dibuka, tanpa janji notifikasi saat browser tertutup.

Pusat disposisi memiliki tujuh tab, pencarian, periode/unit/penerima/derajat/klasifikasi/tenggat, pengurutan, dan pagination. Angka ringkasan membuka daftar yang sesuai. **Laporan disposisi** memakai tanggal pembuatan tugas di zona aplikasi, sedangkan surat belum didisposisikan memakai tanggal penerimaan. Laporan waktu memakai jam kalender, median, jumlah observasi lengkap, dan jumlah timestamp yang belum lengkap. Perbaikan memakai pengiriman/pemeriksaan terakhir.

## Cetak, integrasi, cadangan, dan data lama

Cetak versi yang dipilih melalui **Cetak versi**. Editor juga menyediakan **Cetak draf tersimpan**, dengan penanda DRAF, waktu penerbitan belum ditetapkan, dan nomor revisi draf. Lembar A4 hitam memuat identitas surat, penerima, instruksi, catatan, pemberi/jabatan, ruang tanda tangan kosong, dan catatan untuk tetap bersama naskah asli. Instruksi khusus ditempatkan di halaman lanjutan dengan agenda/nomor/versi. Versi lama atau dibatalkan diberi penanda jelas; mode contoh bertanda CONTOH/DEMO. Tidak dibuat tanda tangan/stempel.

**Format Disposisi RSAS resmi belum tersedia dalam proyek/lampiran sesi ini.** Susunan mengikuti struktur isian yang diberikan pengguna dan perlu dibandingkan dengan dokumen acuan sebelum penggunaan resmi. Cetak browser tidak berarti ada unduhan PDF otomatis atau pengujian printer fisik.

**Buat Nota Dinas hasil** dan **Buat agenda dari arahan** memerlukan konfirmasi serta menyimpan sumber surat/disposisi/tugas. Pengulangan untuk kombinasi sumber/jenis yang sama membuka hasil sebelumnya. Agenda memerlukan waktu/lokasi dan mengikuti pemeriksaan benturan. Hubungan berkas kegiatan memakai ID sumber. Tugas digital tersedia melalui Tugas Saya dan Surat Masuk.

Migrasi IndexedDB 4→5 hanya menambah tabel dan metadata. Surat, disposisi, tugas, Nota Dinas, dan Blob lama tetap ada. Dokumen/alur lama tetap dapat dibuka melalui detail Surat Masuk; gunakan menu Digital untuk draf/versi dan tindakan baru.

Cadangan ZIP skema 5 memuat draf, snapshot, status baca, hubungan keluaran, delegasi, riwayat tindakan/progres/diskusi/laporan, dan byte lampiran. Paket skema 2/3/4 tetap diterima. Skema, checksum, referensi, pemilik sumber, versi, dan rantai induk diperiksa sebelum transaksi pemulihan. Mode database lain tidak diubah.

## Contoh penerimaan yang disediakan

Masuk ke database **mode demo**, pilih Admin atau Kepala RSAU, lalu **Siapkan contoh digital**. Tombol ini idempoten, tidak menerbitkan arahan dan tidak mereset contoh yang sudah diproses. Tidak tersedia pada database lokal pengguna.

Contoh memakai pemberi **dr. Aditya Demo — Kepala RSAU**, **Pejabat URTU (contoh)** sebagai utama, **Bima Demo — KA SIMRS** sebagai pendukung, dan **Pejabat Mutu (contoh)** sebagai tembusan. Pengguna/jabatan berlabel contoh ditambahkan hanya pada database demo, tanpa mengklaim nama pejabat sebenarnya.

Terbitkan; pilih URTU, terima, delegasikan kepada **Pelaksana URTU (contoh)** dengan konsolidasi. Pelaksana menerima/mengirim hasil; URTU memeriksa dan mengirim konsolidasi. SIMRS menerima/mengirim hasil; Kepala RSAU mengembalikan dengan alasan; SIMRS memperbaiki dan mengirim lagi. Kepala menerima kedua hasil wajib. Pastikan tembusan tetap belum membaca dan surat dapat diarsipkan setelah seluruh tugas wajib selesai.

Tunggu **Siap digunakan offline**, matikan koneksi browser, lalu ulangi skenario. Panduan bukti: [VERIFICATION.md](VERIFICATION.md). Contoh cetak: [examples](../examples/README.md). Jalankan npm run typecheck, npm test, npm run build, dan npm run test:e2e.
