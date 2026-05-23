# WA Parser & Normalizer Roadmap

Dokumen ini merangkum arah peningkatan untuk parser WA downtime dan layer normalizer/alias matching yang sudah dipakai di fitur import downtime. Fokusnya adalah memperkuat fitur yang akan terus dipakai, bukan menambah cabang fitur baru.

## Tujuan

1. Hasil parse lebih konsisten walau format WA berubah-ubah.
2. Normalisasi machine/alias makin stabil dan transparan.
3. Hasil preview lebih mudah divalidasi sebelum save.
4. Import tetap idempotent dan aman di-run ulang.
5. Ada jejak alasan kenapa baris dipetakan ke machine tertentu.
6. Fixture regresi mudah dibaca dan bisa dipakai ulang saat parser berubah.

## Prinsip kerja

1. Schema output harus stabil dulu, baru logika diperluas.
2. Normalizer dan parser dipisah secara konsep, walau tetap bisa dipakai dalam satu alur.
3. Rules yang pasti menang dulu, AI hanya untuk kasus ambigu.
4. Setiap perubahan normalisasi harus bisa dilacak ke fixture atau contoh WA.
5. Jangan naikkan kompleksitas parser sebelum ada regresi test.

## Kondisi saat ini

Parser WA yang sudah ada sekarang sudah punya:

1. Rules parser untuk report downtime dan report produksi.
2. Hybrid mode `rules` / `ai` / `hybrid`.
3. Typo correction konservatif untuk kata downtime yang sering salah tulis.
4. Alias manager per area.
5. Auto-suggest dan auto-apply alias dari histori confidence tinggi.
6. Preview diff sebelum save.
7. Dedupe / upsert untuk import ulang.

Yang masih perlu diperkuat:

1. Normalisasi machine/alias masih perlu registry eksplisit yang bisa dilacak per sumber alias.
2. Penjelasan confidence, `match_code`, dan `warning_code` masih perlu diperkaya untuk audit cepat.
3. Coverage fixture WA masih perlu diperluas untuk variasi format nyata dan edge case produksi/downtime.
4. Fallback AI perlu guardrail dokumentasi yang tegas per mode, terutama rules-first vs hybrid.
5. Output preview masih perlu diposisikan sebagai alat validasi, bukan sekadar hasil parse.

## Urutan pengerjaan

### P0 — Stabilkan kontrak output

Fokus:

1. Bekukan schema hasil parse downtime dan produksi.
2. Tambah fixture WA nyata untuk variasi format yang sering muncul.
3. Tambah kasus edge: tanggal nempel, shift ambigu, jam hilang, machine pakai singkatan.
4. Pastikan preview membawa kode alasan match dan warning yang stabil.

Selesai kalau:

1. hasil parse yang sama selalu memberi output yang sama pada fixture yang sama.
2. preview bisa dibaca ulang tanpa membuka log parser.

### P1 — Perkuat normalizer inti

Fokus:

1. Pisahkan rule normalisasi machine, typo correction, dan inferensi family.
2. Buat registry alias/canonical yang lebih eksplisit dan punya sumber alias yang jelas.
3. Tambahkan alasan match yang bisa dibaca user saat preview, plus kode singkat untuk scan cepat.

Selesai kalau:

1. machine hasil parse bisa dijelaskan dari alias mana dia jatuh ke master target.
2. user bisa melihat kode match yang sama antara preview, log, dan hasil save.

### P2 — Perluas parsing rules

Fokus:

1. Tambah pola WA baru untuk kondisi `lancar`, `off`, `standby`, `setup`, `cleaning`, `trial`.
2. Perkuat deteksi block, header, dan baris action yang menempel.
3. Bedakan parsing downtime vs summary produksi lebih tegas.

Selesai kalau:

1. variasi format WA yang umum tidak lagi jatuh ke `raw` terlalu sering.

### P3 — Observability dan review

Fokus:

1. Tambah warning code yang konsisten untuk parse ambigu, duplicate, dan fallback AI.
2. Tampilkan alasan kenapa baris di-skip.
3. Tambah ringkasan coverage per mode parser di preview.
4. Simpan fixture regresi WA sebagai contoh hidup yang bisa di-review manual.

Selesai kalau:

1. user bisa review hasil parse tanpa membuka log teknis.

### P4 — Hardening import

Fokus:

1. Perkuat idempotency / dedupe untuk re-run file yang sama.
2. Pastikan mode append dan replace punya perilaku yang jelas.
3. Tambah batas aman untuk save massal dari hasil parse WA.

Selesai kalau:

1. import bisa dijalankan ulang tanpa bikin data dobel atau hasil liar.

### P5 — AI fallback yang lebih aman

Fokus:

1. AI hanya dipakai untuk blok ambigu yang memang perlu bantuan.
2. Fallback provider tetap rules-first.
3. Prompt AI disesuaikan agar schema output tetap ketat dan konsisten.

Selesai kalau:

1. AI jadi bantuan, bukan sumber utama yang bikin perilaku parser berubah liar.

## Implementasi yang disarankan

Urutan praktis yang paling aman:

1. Bekukan fixture + schema.
2. Rapikan normalizer core.
3. Perluas rules parser.
4. Tambah observability preview.
5. Perkuat import safety.
6. Terakhir, poles AI fallback dan prompt.
7. Simpan fixture regresi dan catatan contoh di docs supaya perubahan parser tetap auditable.

## File target utama

1. `app/api/downtime-events/import/wa/route.ts`
2. `lib/dashboard.ts`
3. `app/page.tsx`
4. `docs/PRD.md`
5. `docs/tasks.md`
6. `README.md`
7. `docs/wa-parser-fixtures.md`

## Kriteria sukses

1. Parsing WA tidak tergantung satu format teks saja.
2. Normalisasi machine lebih bisa dijelaskan dan direview.
3. Preview parse cukup jelas untuk diputuskan sebelum save.
4. Re-run import aman.
5. Dokumentasi selalu mengikuti perilaku aktual.
