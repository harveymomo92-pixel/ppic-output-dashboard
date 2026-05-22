# UX Roadmap — First-Time User PPIC Dashboard

Roadmap ini diturunkan langsung dari `docs/ux-audit-first-time-user.md` dan dibatasi ke file yang memang ada sekarang.

## Tujuan

Bikin user baru bisa langsung pakai dashboard tanpa diajari.

## Prinsip kerja

1. Mulai dari alur paling sering dipakai.
2. Sederhanakan pilihan yang tampil dulu.
3. Pakai bahasa operasional, bukan bahasa admin.
4. Detail maju bertahap, jangan semua dibuka di awal.
5. Prioritaskan mobile/touch.

## P0 — Harus duluan

### 1) Quick start / onboarding singkat

Target file:
- `app/page.tsx`
- `components/dashboard/overview-section.tsx`

Isi:
- card panduan singkat di halaman awal
- 3 langkah utama: pilih menu → pilih filter → lihat hasil
- penjelasan singkat istilah inti

Selesai kalau:
- user baru tahu harus mulai dari mana tanpa tanya orang

### 2) Ringkas navigasi utama

Target file:
- `components/dashboard/dashboard-sidebar.tsx`
- `app/globals.css`

Isi:
- tampilkan menu inti lebih jelas
- pisahkan aksi basic vs advanced
- subpanel downtime/settings jangan terasa setara semua

Selesai kalau:
- sidebar tidak terasa seperti daftar fitur teknis

### 3) Ubah label teknis ke bahasa operasional

Target file:
- `components/dashboard/overview-section.tsx`
- `components/dashboard/dashboard-sidebar.tsx`
- `components/dashboard/settings-section.tsx`
- `app/page.tsx`

Isi:
- Achievement → Pencapaian
- Prorata → Target harian / target sesuai jam kerja
- Reject Rate → Persentase reject
- Follow Up → Tindak lanjut
- Entity → Mesin / line / master mesin sesuai konteks

Selesai kalau:
- user awam bisa baca tanpa penjelasan tambahan

## P1 — Setelah P0 stabil

### 4) Progressive disclosure untuk layar padat

Target file:
- `components/dashboard/overview-section.tsx`
- `components/dashboard/settings-section.tsx`
- `app/page.tsx`

Isi:
- ringkasan tampil dulu
- tabel panjang dibuat lebih ringan / collapsible
- preview parser dan alias manager hanya tampil saat perlu
- settings dibagi basic vs advanced

Selesai kalau:
- halaman awal terasa ringan dan tidak penuh kontrol

### 5) Sederhanakan downtime flow

Target file:
- `app/page.tsx`
- `components/dashboard/dashboard-sidebar.tsx`
- `components/dashboard/overview-section.tsx`
- `app/globals.css`

Isi:
- alur downtime dibuat bertahap
- workflow dasar dipisah dari import/parser/analysis
- menu downtime tidak menampilkan terlalu banyak opsi sekaligus

Selesai kalau:
- user baru bisa pakai downtime basic flow tanpa nyasar

### 6) Empty state dan helper text

Target file:
- `components/dashboard/overview-section.tsx`
- `components/dashboard/settings-section.tsx`
- `app/page.tsx`

Isi:
- empty state beri arahan berikutnya
- tombol/label memakai kata kerja yang jelas
- hint singkat untuk filter dan tabel

Selesai kalau:
- kondisi kosong tetap terasa dipandu

## P2 — Penguatan usability

### 7) Mobile/touch ergonomics

Target file:
- `app/globals.css`
- `components/dashboard/dashboard-sidebar.tsx`

Isi:
- tombol lebih besar
- jarak antar elemen lebih lega
- layout satu kolom pada layar kecil
- filter dan tab mudah ditap

Selesai kalau:
- dashboard enak dipakai di HP tanpa zoom berulang

### 8) Review tabel panjang dan form teknis

Target file:
- `app/page.tsx`
- `components/dashboard/overview-section.tsx`
- `components/dashboard/settings-section.tsx`

Isi:
- tentukan mana yang harus tampil default
- tentukan mana yang pindah ke mode advanced
- kurangi kepadatan kolom yang tidak penting untuk pemakaian awal

Selesai kalau:
- tampilan awal fokus ke keputusan, bukan ke data mentah

## Urutan eksekusi yang disarankan

1. Onboarding + quick start
2. Label sederhana
3. Sidebar simplification
4. Downtime simplification
5. Progressive disclosure
6. Empty state / helper text
7. Mobile polish
8. Tabel dan form advanced

## Kriteria sukses final

User baru harus bisa:
- buka dashboard
- paham menu mana yang dipilih dulu
- baca ringkasan tanpa diterjemahkan
- pakai downtime basic flow
- pakai di HP dengan nyaman

