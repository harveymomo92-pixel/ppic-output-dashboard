# WA Parser Fixtures

Catatan contoh ini dipakai sebagai regression seed manual untuk parser WA downtime dan produksi.

Tujuan:

1. Menjaga schema output stabil.
2. Menjaga alias registry dan kode preview tetap bisa dibaca cepat.
3. Menjadi contoh nyata saat parser berubah.

## Fixture 1 — Downtime dengan family inference

```text
18 Mei 2026
Shift 1
Borche 02
Problem
(07:15 - 07:45 = 30 menit) Preform macet
Action: cek heater dan bersihkan jalur
```

Expected:

- `machine_match = family`
- `match_code = family:borche`
- `warning_code` memuat `timing:explicit`
- `root_cause` tetap terbaca sebagai downtime event utama

## Fixture 2 — Downtime dengan alias registry hit

```text
19 Mei 2026
Shift 2
HF 03
Problem
Jam 16.00 - 16.20 gangguan panel listrik
Action: reset panel
```

Expected:

- `machine_match = family`
- `match_code = family:direct`
- `warning_code` memuat `timing:explicit`
- preview menampilkan alasan match yang menjelaskan mapping ke master target

## Fixture 3 — Kondisi mesin lancar

```text
20 Mei 2026
Shift 3
V-FINE 1
Problem
Lancar
```

Expected:

- row kondisi mesin tetap dibuat
- `condition = lancar`
- `warning_code = state:lancar`
- `machine_match` tetap terisi sesuai hasil registry

## Fixture 4 — Produksi summary

Catatan: contoh ini masih diperlakukan sebagai sample manual-only. Parser produksi butuh format yang lebih kaya dari sampel di bawah untuk benar-benar keluar sebagai `productionRows` stabil.

```text
TOTAL HASIL PRINTING
OMSO 1: Hasil = 12000
Reject print = 45
Produktivitas = 92.5%
```

Expected:

- saat format produksi diperkaya, harus masuk ke parser produksi
- `machine_match = family`
- `match_code` menjelaskan header family yang dipakai
- `source_line` tetap menyimpan ringkasan teks asli

## Fixture policy

1. Fixture baru harus ditulis dengan format teks WA yang mendekati aslinya.
2. Setiap fixture downtime idealnya punya expected `match_code`, `warning_code`, dan `condition`.
3. Kalau parser diubah, fixture ini harus diperiksa ulang sebelum behavior dianggap stabil.
4. Fixture produksi boleh tetap manual-only sampai format sampelnya benar-benar cukup untuk parser runtime.
