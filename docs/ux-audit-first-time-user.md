# UX Audit — First-Time User Operasi Produksi

Dokumen ini sengaja dibuat **berdasarkan struktur UI yang benar-benar ada** di codebase sekarang, supaya tahap perbaikan tidak halu.

## Tujuan

Membuat user baru bisa langsung paham dan pakai dashboard tanpa diajari, termasuk user yang sangat awam.

Target pengalaman:
- sekali buka, user tahu harus klik apa dulu
- istilah mudah dibaca
- langkah kerja jelas
- kontrol tidak terlalu banyak dalam satu layar
- tetap nyaman di layar kecil / touch

## Sumber observasi

- `components/dashboard/dashboard-sidebar.tsx`
- `components/dashboard/overview-section.tsx`
- `app/page.tsx`
- `components/dashboard/settings-section.tsx`
- `app/globals.css`
- `docs/PRD.md`

## Temuan utama

### 1) Navigasi terlalu padat untuk first-time user

Sidebar saat ini memuat beberapa area utama sekaligus:
- Overview
- Compare Period
- Master Entity
- Data Detail
- Downtime dengan 6 subpanel
- Settings dengan 4 subpanel

Risiko:
- user baru bingung mulai dari mana
- menu teknis terlalu cepat tampil
- beban kognitif tinggi sebelum user melihat manfaat dashboard

### 2) Banyak istilah masih teknis

Contoh yang berpotensi membingungkan user awam:
- Achievement
- Prorata
- Reject Rate
- Follow Up
- OData
- Entity

Risiko:
- user harus menebak arti istilah
- training jadi perlu padahal targetnya tidak ingin diajari

### 3) Satu layar menampilkan terlalu banyak lapisan informasi

Di overview dan downtime ada pola:
- KPI
- chart
- filter lokal
- tabel detail
- pagination
- action buttons

Risiko:
- user sulit tahu mana yang penting dulu
- layar terasa berat, terutama di mobile

### 4) Downtime adalah area paling kompleks

Di code sekarang downtime punya:
- navigation card
- workflow panel
- import panel
- input panel
- follow up panel
- table panel
- analysis panel
- WA parser + alias manager + preview + structured output

Risiko:
- fitur penting tercampur dengan fitur advanced
- user baru tidak tahu alur yang benar

### 5) Settings juga masih terlalu teknis

Panel settings berisi AI, OData, logs, system.

Risiko:
- user awam takut salah ubah
- informasi penting bercampur dengan kontrol expert

## Prinsip perbaikan

1. **Satu layar = satu tujuan utama**
2. **Tampilkan yang penting dulu, detail belakangan**
3. **Bahasa sehari-hari lebih diutamakan daripada istilah teknis**
4. **Default harus aman dan langsung berguna**
5. **Mobile/touch-first untuk kontrol utama**

## Tahap perbaikan yang disarankan

### Phase 1 — Simplifikasi orientasi awal

Fokus:
- tambah onboarding singkat / quick start
- beri 3 langkah utama saat pertama buka
- jelaskan arti menu dengan bahasa sederhana

Perubahan:
- card sambutan / panduan singkat di halaman awal
- label menu dipersingkat
- highlight satu jalur kerja utama

Done jika:
- user baru bisa jawab “klik apa dulu?” tanpa tanya orang lain

### Phase 2 — Sederhanakan navigasi

Fokus:
- kurangi menu utama yang tampil penuh
- sembunyikan aksi advanced di bawah “Lainnya” / “Advanced”

Perubahan:
- sidebar hanya tampilkan menu inti
- downtime dan settings dipisah jelas antara basic vs advanced
- subpanel jangan semua tampil setara

Done jika:
- user hanya melihat 3–4 pilihan utama saat awal

### Phase 3 — Ubah istilah ke bahasa operasional

Fokus:
- ganti istilah yang terlalu teknis

Contoh arah copy:
- Achievement → Pencapaian
- Prorata → Target harian / target sesuai jam kerja
- Reject Rate → Persentase reject
- Follow Up → Tindak lanjut
- Entity → Mesin / line / master mesin (sesuai konteks)

Done jika:
- orang non-teknis bisa baca label tanpa penjelasan tambahan

### Phase 4 — Progressive disclosure untuk detail

Fokus:
- ringkasan tampil dulu
- tabel detail dan form rumit dibuka kalau perlu

Perubahan:
- tabel panjang jadi collapsible / tab lanjutan
- preview parser dan alias manager hanya muncul di mode expert
- form setting dibagi basic vs advanced

Done jika:
- layar awal terasa ringan, bukan seperti panel admin penuh

### Phase 5 — Mobile & touch usability

Fokus:
- tombol lebih besar
- jarak antar elemen lebih longgar
- konten satu kolom di layar kecil

Perubahan:
- semua action utama nyaman di tap
- select/input tidak terlalu rapat
- tabel punya fallback yang masih terbaca di HP

Done jika:
- user bisa navigasi dengan satu tangan tanpa zoom terus-menerus

### Phase 6 — Safety & guidance

Fokus:
- cegah salah klik
- bantu user saat data kosong / filter kosong

Perubahan:
- empty state yang menjelaskan langkah berikutnya
- konfirmasi untuk aksi sensitif
- label tombol lebih jelas: simpan, lihat, reset, buka detail

Done jika:
- user tidak merasa “tersesat” saat data belum ada

## Prioritas implementasi

### P0
- onboarding singkat
- ringkas label menu
- istilah teknis dipermudah

### P1
- pisahkan basic vs advanced
- sederhanakan downtime
- rapikan empty state dan hint

### P2
- optimasi mobile / touch
- revisi tabel panjang dan form teknis

## Batasan

Dokumen ini **bukan** daftar fitur baru.
Ini adalah urutan perbaikan UX supaya fitur yang sudah ada jadi lebih mudah dipakai.

## Kriteria sukses akhir

User baru seharusnya bisa:
1. membuka dashboard
2. paham menu mana yang harus dipilih
3. melihat ringkasan utama
4. mencari data tanpa kebingungan
5. memakai downtime basic flow tanpa diajari

Lihat tindak lanjut implementasi di `docs/ux-roadmap-first-time-user.md`.
