# PPIC Output Dashboard — Runbook

## Prototype stack

- Next.js + React + TypeScript
- Recharts for lightweight charts
- PapaParse for CSV parsing/import helpers
- Lucide React for icons
- SQLite for local persistence and analytics cache

## Data files

Static prototype data lives in:

- `public/data/itemledgerppic_output_last3months.csv`
- `public/data/entity_machines_itemledgerppic.csv`
- `public/data/master_entity_target_produksi.csv`

Documentation/reference outputs:

- `docs/master-entity-target-produksi.json` — full normalized master target data
- `docs/master-entity-target-summary.json` — summary and duplicate-name overview
- `docs/wa-parser-fixtures.md` — regression seed untuk parser WA downtime/produksi

## Run locally

```bash
npm install
npm run dev
```

For host-level persisted OData env without writing secrets into the repo, use:

```bash
npm run dev:live
```

The launcher reads `/root/.config/ppic-output-dashboard/runtime.env` when present.

### Systemd service in this workspace

For long-running local dev in this host, the app is also available as:

```text
ppic-output-dashboard-dev.service
```

It is configured with:

- `MemoryHigh=512M`
- `MemoryMax=1.9G`
- `MemorySwapMax=1.9G`
- `Nice=10`
- `IOSchedulingClass=idle`

Use it when you want the dashboard to stay up in the background without competing too hard with the rest of the host.

Open:

```text
http://localhost:3000
```

If port 3000 is busy:

```bash
npm run dev -- --port 3100
```

## SQLite data layer

Initialize/reseed local SQLite database from current CSV cache:

```bash
npm run db:init
```

Sync from OData or CSV source into SQLite:

```bash
npm run db:sync -- --source "$PPIC_ODATA_URL" --from 2026-02-13 --to 2026-05-12
```

If `--source` is omitted, the sync script falls back to `PPIC_ODATA_URL` or the local CSV cache.

Behavior for live OData sync:

- check latest remote `Entry_No` first
- if remote is not newer than local data in the active sync range, result is `tidak ada data baru`
- if newer data exists, only rows above the latest local `Entry_No` are fetched and appended
- live OData sync always forces `Entry_Type = Output`

Database path:

```text
data/ppic-dashboard.db
```

The DB file is local runtime data and ignored by git.

Current backend API:

- `GET /api/dashboard` — dashboard KPIs, output/reject analytics, target monitoring, filter options, and detail preview from SQLite
- `GET /api/master-entity`
- `POST /api/master-entity`
- `PUT /api/master-entity/:id`
- `DELETE /api/master-entity/:id`

Dashboard mapping rule:

- OData `gProdOrRotLine_Description` is stored as SQLite `item_ledger_output.prod_line_description`
- Master entity `kode_asli_sistem` is matched to `prod_line_description` using normalized text
- `External_Document_No` is split into `shift_code`, `work_hours`, and `operator_name` during import
- WA downtime preview sekarang membawa `match_code` dan `warning_code` supaya alias / normalizer bisa diaudit cepat sebelum save
- Save ulang parser WA memakai exact key dulu, lalu canonical machine/line key supaya alias drift tetap update baris existing dan tidak bikin duplikat baru

## Production build check

```bash
npm run build
npm run start
```

## Security

- Do not put Business Central username/password in source code.
- OData credentials should be loaded from environment variables only.
- Prototype can seed from static CSV, but the sync script now supports live OData/paged refresh.

## Known note

`npm audit` currently reports moderate advisories from the installed Next.js/PostCSS chain. `npm audit fix --force` is not recommended because npm suggests a breaking downgrade. Recheck after dependency updates.
