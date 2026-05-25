# Improve Stage: Gangguan Produksi - Input Event

Tujuan tahap ini:
- Membuat input gangguan produksi lebih cepat untuk multi input dalam satu sesi.
- Mengurangi pengulangan input field yang sama.
- Menurunkan risiko salah input dengan alur yang lebih runtut dan visual yang lebih bersih.

Target UX:
- Default halaman hanya menampilkan 1 form event.
- Di bawah form ada tombol `+` untuk menambah form event baru.
- Saat form baru ditambahkan, field `tanggal`, `shift`, `area`, dan pola kategori yang sedang dipakai ikut terbawa dari card sebelumnya.
- Field lain tetap kosong atau mengikuti pola yang aman, supaya user tinggal isi `mesin`, waktu, dan detail event berikutnya.
- `Shift`, `Area`, dan `Mesin` pakai dropdown agar input lebih cepat dan seragam.
- `Start` dan `End` otomatis terisi jam saat card/form dibuka.
- Semua form disimpan dengan 1 tombol `Save`.

Prinsip desain:
- Clean first: tampilan tidak penuh form sekaligus.
- Fast repeat: field yang sama tidak perlu diulang manual.
- Low error: copy-forward field hanya untuk nilai yang memang stabil.
- Batch-safe: sebelum submit, lakukan validasi per kartu form.

Rekomendasi implementasi:
- Gunakan wrapper/card per event dengan border dan spacing yang konsisten.
- Tambahkan aksi `remove` per kartu jika diperlukan.
- Sinkronkan field copy-forward dari kartu sebelumnya saat tombol `+` dipakai.
- Pertahankan satu tombol simpan di bagian bawah halaman, lalu kirim submit per card secara berurutan.

Catatan:
- Fokus tahap ini adalah workflow input yang cepat dan minim kesalahan.
- Kalau nanti dibutuhkan, bisa ditambah mode `repeat previous` yang menyalin field lebih banyak secara terkontrol.
