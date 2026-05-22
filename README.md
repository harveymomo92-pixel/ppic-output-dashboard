# PPIC Output Dashboard

Dashboard internal untuk monitoring output produksi PPIC dari Business Central OData V4 service `ItemLedgerPPIC`.

## Current Stage

**Planning / PRD**

## Source Data Snapshot

- Source service: `ItemLedgerPPIC`
- Current sample/export: `/root/.openclaw/workspace/itemledgerppic_output_last3months.csv`
- Filter sample: `Entry_Type = Output`, `Posting_Date >= 2026-02-13`
- Rows: 5,804
- Machines/entities: 37
- Master target entities: 42
- Items: 207
- Documents/SPK: 390

## Docs

- `docs/PRD.md` — product requirement document
- `docs/ux-audit-first-time-user.md` — UX audit dan tahapan perbaikan untuk first-time user
- `docs/ux-roadmap-first-time-user.md` — roadmap implementasi UX berdasarkan audit
- `docs/wa-parser-roadmap.md` — roadmap penguatan parser WA dan normalizer downtime
- `docs/data-profile.json` — initial data profile from current CSV
- `docs/master-entity-target-produksi.json` — full master target entity data (42 rows)
- `docs/master-entity-target-summary.json` — summary/profil master target entity
- `docs/tasks.md` — implementation backlog

## Security Note

Do not commit or write raw Business Central credentials into source files. Use environment variables or local secrets file excluded from git.

## Backend/Data Layer

SQLite data layer has been added.

- Schema: `db/schema.sql`
- Seeder: `scripts/init-db.mjs`
- OData/CSV sync: `scripts/sync-odata.mjs`
- Local DB: `data/ppic-dashboard.db`
- API: `app/api/dashboard/*`, `app/api/master-entity/*`

Initialize/reseed:

```bash
npm run db:init
```

Sync from OData/CSV:

```bash
npm run db:sync -- --source "$PPIC_ODATA_URL"
```

Live OData sync now checks the latest remote `Entry_No` first. If there is no new data, it records `tidak ada data baru` and skips import. If there is new data, it only pulls rows with `Entry_No` above the latest local row in the active sync range.

### Downtime backfill import

Downtime event history can be backfilled from CSV/XLSX exports (including files exported from Excel) using the downtime importer or langsung dari halaman downtime. The downtime page now includes drag & drop upload. It uses an idempotent natural key so the same file can be re-run safely.

Download template:

```bash
curl -L -o downtime-backfill-template.csv http://localhost:3000/api/downtime-events/import/template
curl -L -o downtime-backfill-template.xlsx http://localhost:3000/api/downtime-events/import/template?format=xlsx
```

Template juga tersedia sebagai `.xlsx` lewat tombol **Template XLSX** di halaman downtime. Template sudah disederhanakan ke field yang benar-benar diisi user: `event_date, shift_code, area, machine, line, category, start_time, end_time, status, pic, root_cause, action_taken`, plus sheet contoh isian dan sheet panduan. Field wajib diberi highlight berbeda dari field opsional.

```bash
npm run db:import-downtime -- --source ./backfill/downtime.csv
```

Supported columns follow the downtime form fields: date, shift, area, machine, line, category, start/end time, duration, status, PIC, root cause, action, estimated loss output, and linked signal type. Common header aliases are accepted too.

### Copas WA AI parser

Mode **AI** / **Hybrid** bisa pakai **Gemini** atau **OpenAI**.

Parser WA juga punya **auto-correct typo konservatif** untuk kata/frasa yang sangat yakin, misalnya istilah downtime yang sering salah tulis di `root_cause`, `action_taken`, dan note pendukung. Koreksi ini hanya aktif kalau confidence-nya tinggi, dan hasilnya tetap ditandai di warning agar transparan.

Roadmap penguatan parser WA dan normalizer ada di `docs/wa-parser-roadmap.md`. Itu jadi acuan urutan pengerjaan kalau kita lanjut hardening parser:

1. bekukan schema output
2. perkuat normalizer inti
3. perluas rules parser
4. tambah observability preview
5. harden import safety
6. rapikan AI fallback terakhir

Fitur lain yang sudah ada di halaman parser:
- **Preview Parse** dan **Save Parsed Result** dipisah
- **Preview diff sebelum save**
- **Alias manager per area**
- **Auto-suggest / auto-apply alias** dari histori untuk row confidence tinggi
- **Download CSV lengkap** dari hasil parsing

Set key di `.env.local`:

```bash
# Gemini primary
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.5-flash

# OpenAI fallback
OPENAI_API_KEY=sk-...
WA_PARSER_AI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

Perilaku fallback:
- jika provider dipilih **Gemini**, lalu error/quota/limit → fallback ke **OpenAI**
- kalau dua-duanya gagal → fallback ke **rules parser**

Lalu restart dev server:

```bash
npm run dev
```

Kalau `GEMINI_API_KEY` atau `OPENAI_API_KEY` kosong, provider itu dilewati otomatis.

## Prototype Frontend

Prototype Next.js dashboard has been added.

### Run

```bash
npm install
npm run dev
```

If you want the app to restart with persisted host-level OData env (without putting secrets in project source), use:

```bash
npm run dev:live
```

### Included lightweight plugins/libraries

- `recharts` — charts
- `papaparse` — CSV parsing
- `lucide-react` — icons
- `clsx` — class utility
- `@radix-ui/react-collapsible` — collapsible Shadcn-style sidebar sections

Current layout follows Shadcn/UI Sidebar composition: `SidebarProvider`, `Sidebar`, `SidebarContent`, `SidebarGroup`, `SidebarFooter`, `SidebarInset`, and `SidebarTrigger`.

Visual language follows `docs/design.md`: Notion Beige / workspace-calm with warm off-white foundation, near-black text, restrained coral as the single interaction accent, Inter typography, flat surfaces, and no gradients.

See `RUNBOOK.md` for operation notes.
