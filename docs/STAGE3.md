# Tahap 3 — naskah, agenda dan pekerjaan terkait

Basis perubahan: `main` setelah PR #2. Modul persuratan, Dexie, PWA, CSV, cetak dan cadangan digunakan kembali. Agenda lama dipindahkan/diperluas menjadi satu alur Agenda Pimpinan; tidak ada dua menu agenda. Tidak ada backend atau data dikirim ke layanan pencarian eksternal.

## Panduan uji

1. Pilih mode data contoh melalui Uji Coba Sistem. Database pengguna lama tetap terpisah dan tidak direset.
2. Pembuat Naskah → pilih Nota dinas → Buat naskah. Isi Kepada, Perihal dan Isi; tunggu autosave, lalu reload. Isi harus tetap ada. Pratinjau menggunakan teks A4, dan DOCX berisi paragraf yang dapat diedit, bukan screenshot.
3. Tambahkan pemeriksa berurutan yang sesuai unit naskah. Ajukan pemeriksaan. Ganti peran/PIC yang sesuai (Admin simulasi dapat menjalankan alur uji), paraf tiap tahap, kembalikan jika perlu koreksi, lalu setujui sebagai Kepala RSAU. Penomoran baru tersedia setelah persetujuan versi itu. Catat pengiriman di Surat Keluar.
4. Ubah isi setelah persetujuan: versi baru kembali ke Draf, persetujuan sebelumnya tidak berlaku untuk versi baru. Riwayat dan surat keluar yang sudah bernomor dipertahankan. Bandingkan versi, ekspor versi historis, atau pulihkan dengan alasan sebagai versi baru. Konteks template generik/resmi diambil saat naskah dibuat, sehingga perubahan template tidak mengubah klaim format naskah lama.
5. Dari surat atau Agenda, tambahkan undangan. Konfirmasi nama, tanggal/waktu, lokasi, penyelenggara, pejabat, peserta dan surat sumber. Buat kegiatan lain yang beririsan untuk pejabat/tempat sama: aplikasi memperingatkan benturan dan meminta peninjauan. Kegiatan tidak otomatis dibatalkan. Pejabat dapat diwakilkan dan hasil kegiatan dicatat. ICS memakai UTC yang dikonversi dari zona waktu pengaturan.
6. Buat Notulen, isi keputusan, PIC, unit dan tenggat. Simpan dan konfirmasi pembuatan tugas. Ulangi tombol: tugas lama dilewati berdasarkan ID keputusan. Tugas terhubung ke notulen/agenda dan memakai alur tugas yang ada. Notulen dapat dicetak dan diekspor DOCX.
7. Buat Berkas Kegiatan, tautkan sumber dari surat/disposisi/tugas/keluar/agenda/notulen/laporan hasil/naskah. Lihat kronologi dan tugas terbuka. Hapus hubungan: sumber tetap ada.
8. Pencarian Isi → buka Indeks PDF lokal → Indeks ulang isi PDF. Cari frasa yang ada dalam PDF teks; hasil memuat nama, cuplikan yang ditandai dan halaman. PDF tanpa lapisan teks menampilkan “Belum dapat dicari berdasarkan isi”. Naskah, catatan disposisi, hasil tugas dan notulen dicari langsung dari data lokal.
9. Impor Register → unduh template → unggah CSV/XLSX → petakan kolom → validasi/pratinjau. Field/tanggal/master/unit/agenda diperiksa. Konfirmasi hanya baris valid; konflik tidak menimpa data lama. Lampiran tidak diimpor lewat spreadsheet.
10. Surat Masuk → pilih beberapa surat → Tinjau pemrosesan massal. Label, tautkan ke berkas, ekspor/cetak daftar atau arsipkan yang memenuhi syarat. Setiap hasil dilaporkan; tidak ada persetujuan atau penyelesaian tugas massal.
11. Analisis Waktu menampilkan median, jumlah observasi dan yang dikecualikan. Timestamp baru dicatat pada penerimaan hari yang sama dengan registrasi, konfirmasi, progres, pengiriman hasil dan pemeriksaan. Data lama tanpa timestamp tidak dipalsukan menjadi durasi nol. Jam kalender ditampilkan; kalender kerja belum dikonfigurasi.
12. Bantuan → buka salah satu panduan, lanjutkan langkah, buka modul, mulai ulang atau lewati. Kemajuan panduan adalah preferensi, bukan tanda bahwa pengujian otomatis lulus.
13. Pusat Data Lokal mengekspor ZIP skema 3 termasuk template, naskah, versi/keputusan, notulen, bundel, indeks PDF dan byte lampiran. Paket skema 2 tetap dapat dibaca dengan tabel baru kosong. Migrasi Dexie v2→v3 hanya menambahkan tabel/index baru; metadata dan Blob lama tetap tersedia.

## Offline

Bangun produksi, buka preview, tunggu “Siap digunakan offline”, lalu matikan koneksi browser. Uji URL naskah/detail langsung, DOCX, agenda/ICS, notulen/tugas, berkas, pencarian PDF, XLSX, bulk dan analisis. JavaScript, PDF.js dan worker `.mjs` dibundel/cache lokal; font/skrip/stylesheet fungsi utama tidak menggunakan CDN. Pemuatan awal tetap membutuhkan internet. Berkas draft yang belum tersimpan tidak diasumsikan tahan reload; simpan/ekspor dahulu.

## Batasan yang disengaja

- Template bawaan generik, bukan format resmi RSAS. Admin dapat mengatur dan memverifikasi template berdasarkan acuan yang sah. Tidak ada tanda tangan/stempel palsu atau klaim paraf lokal sebagai autentikasi/tanda tangan tersertifikasi.
- DOCX diverifikasi melalui struktur ZIP/XML dan teksnya. Dua contoh juga dirender dengan LibreOffice menjadi PDF A4 satu halaman dan diperiksa teks/tampilannya. Microsoft Word dan printer fisik belum diuji. Pratinjau/cetak A4 diuji di Chromium.
- PDF dienkripsi/rusak dapat gagal diekstrak. Batas ekstraksi 500 halaman per berkas; indeks dibuat atas tindakan pengguna, dan perlu dibuat ulang setelah perubahan isi sumber. Tidak ada OCR, pencarian semantik atau layanan eksternal.
- XLSX membaca lembar pertama; XLS/ODS tidak didukung. Batas impor 8 MB/5.000 baris. Tanggal ISO atau DD/MM/YYYY diterima. Impor hanya metadata. Unit tidak aktif ditolak.
- Pengingat bekerja saat aplikasi aktif/dibuka. ICS berisi waktu UTC dan zona asal dalam deskripsi, bukan sinkronisasi kalender.
- Analisis memakai jam kalender, bukan kalender hari kerja. Timestamp historis yang tidak diketahui tidak diisi secara perkiraan. Periode penerimaan surat dan pembuatan tugas diberi label berbeda.
- Safari/iOS, Firefox, deployment HTTPS versi ini dan pemasangan PWA oleh pengguna belum diuji dalam sesi ini. Penyimpanan browser tetap bukan arsip permanen.
