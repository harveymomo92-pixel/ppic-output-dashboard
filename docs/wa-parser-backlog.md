# WA Parser Backlog

Dokumen ini adalah backlog operasional untuk penguatan parser WA, normalizer, dan alur review hasil import. Tujuannya supaya langkah berikutnya gampang diambil tanpa perlu baca ulang seluruh roadmap.

## Cara pakai

1. Ambil item dari bagian MVP dulu.
2. Kerjakan dari atas ke bawah jika ada dependensi.
3. Update `docs/tasks.md` setelah ada implementasi yang selesai.
4. Kalau ada perubahan perilaku parser, sinkronkan juga `docs/wa-parser-roadmap.md` dan `docs/wa-parser-fixtures.md`.

## MVP

| Area | Feature | Priority | Impact | Effort | Acceptance Criteria |
| --- | --- | --- | --- | --- | --- |
| Import / Parse | Preview hasil parse sebelum simpan | P0 | High | M | User bisa lihat raw text, hasil parse, dan koreksi sebelum data disimpan. |
| Review / QA | Manual edit / override row | P0 | High | M | User bisa edit field hasil parse lalu simpan ulang tanpa re-import. |
| Review / QA | Confidence / quality score per row | P0 | High | S | Setiap row punya score/status yang jelas, misalnya valid / review / error. |
| Import / Data Safety | Duplicate / merge guard | P0 | High | M | Sistem bisa deteksi row dobel atau import ulang dan mencegah data kotor. |
| Dashboard | Dashboard KPI dasar | P1 | Medium | M | Tampil total input, row valid, row error, dan row butuh review. |
| History | History import dasar | P1 | Medium | S | User bisa lihat riwayat import per file dan per tanggal. |
| Export | Export CSV / Excel | P1 | Medium | S | Hasil parse bisa diekspor ke format yang siap dipakai lanjut kerja. |

## Next Phase

| Area | Feature | Priority | Impact | Effort | Acceptance Criteria |
| --- | --- | --- | --- | --- | --- |
| Parser Rules | Rule builder untuk keyword parsing | P2 | High | L | Admin bisa ubah keyword/rule parsing tanpa edit kode. |
| Parser Templates | Template management per format chat | P2 | High | L | Sistem bisa simpan beberapa template chat dan pilih parser yang sesuai. |
| Review / QA | Bulk review / approval queue | P2 | Medium | M | User bisa review banyak row sekaligus lalu approve/reject massal. |
| Analytics | Analytics trend dan Pareto | P2 | High | L | Dashboard menampilkan trend downtime, reject, dan top issue. |
| Import Safety | Undo / rollback import | P2 | High | L | User bisa batalkan import terakhir tanpa merusak data sebelumnya. |

## Rekomendasi urutan eksekusi

1. Preview hasil parse sebelum simpan.
2. Manual edit / override row.
3. Confidence / quality score per row.
4. Duplicate / merge guard.
5. Dashboard KPI dasar.
6. History import dasar.
7. Export CSV / Excel.

Kalau scope mau digeser ke next phase, mulai dari rule builder dan template management dulu, karena dua itu paling bantu menstabilkan parser saat format WA berubah.
