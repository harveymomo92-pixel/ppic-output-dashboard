# PPIC Output Dashboard — Task Backlog

## Workflow

Planning/PRD -> Frontend -> Backend -> Integration -> Deploy

## Phase 1 — Planning / PRD

- [x] Create project folder structure
- [x] Profile initial `ItemLedgerPPIC` output dataset
- [x] Create initial machine entity list
- [x] Write PRD with required sections
- [x] Define MVP feature scope
- [ ] Validate assumptions with Bima when needed

## Phase 2 — Frontend

- [x] Create Next.js app layout
- [x] Refactor layout to Shadcn/UI Sidebar pattern with collapsible/mobile sidebar
- [x] Add sidebar filters: date, machine, line, category, item/document search
- [x] Add KPI cards
- [x] Add output trend chart
- [x] Add machine ranking chart
- [x] Add item/category charts
- [x] Add detail transaction table
- [x] Add export button

## Phase 3 — Backend / Data Layer

- [x] Create browser CSV loader for prototype
- [x] Add data type normalization helpers
- [x] Add clean machine/entity text normalization
- [x] Add aggregation functions
- [x] Add local static CSV cache under `public/data`
- [x] Add SQLite schema and local database
- [x] Seed SQLite from current CSV cache
- [x] Add persisted master entity CRUD API
- [x] Connect Master Entity UI to SQLite API
- [x] Move dashboard output/reject calculations from client into API/query layer
- [x] Use `gProdOrRotLine_Description` / `prod_line_description` for master entity mapping to OData rows
- [ ] Add optional Parquet/DuckDB cache for larger analytical batch data

## Phase 4 — Integration

- [x] Add OData V4 fetcher with paging
- [x] Move credential handling to environment variables/local secret only
- [x] Add configurable date filter for OData refresh
- [x] Add refresh status metadata
- [x] Add error handling for OData/network/auth failures
- [x] Extract `External_Document_No` into shift / work hours / operator during import
- [x] Add downtime backfill import from CSV/Excel with idempotent upsert
- [x] Add drag & drop upload to downtime backfill UI
- [x] Support direct XLSX import for downtime backfill
- [x] Add downtime backfill template download
- [ ] Define staged integration plan for downtime with existing SQLite data
- [ ] Add dry-run conflict preview before downtime save
- [ ] Add conflict rules for duplicate, overlap, and machine mismatch during downtime merge
- [ ] Add rollback/replace path for failed downtime import batches
- [ ] Automate weekday hourly OData sync with a scheduled timer

## Phase 5 — Deploy

- [ ] Create requirements file
- [x] Create run script
- [x] Test app locally
- [x] Optional: create systemd service
- [ ] Optional: Dockerize
- [x] Document operational runbook

## Phase 6 — UX Simplification / First-Time User

- [x] Write UX audit based on current code structure
- [x] Write UX roadmap with file targets and execution order
- [x] Add a simple onboarding / quick start card for first-time users
- [x] Reduce sidebar cognitive load: keep core menus visible, hide advanced actions
- [x] Rewrite technical labels into operational language
- [x] Split basic vs advanced controls in downtime and settings
- [x] Make empty states explain the next action
- [x] Improve mobile/touch ergonomics for filters, tabs, and buttons
- [x] Review long tables and decide which ones should be collapsible by default
- [ ] Validate that first-time use needs no verbal explanation

## Phase 7 — WA Parser & Normalizer Hardening

- [x] Bekukan schema output parser WA untuk downtime dan produksi
- [x] Tambah fixture WA nyata untuk variasi format yang paling sering muncul
- [x] Pecah normalizer jadi rule layer yang lebih eksplisit untuk machine, typo, dan family inference
- [x] Tambah alasan match / warning code yang lebih jelas di preview
- [x] Perluas coverage kondisi `lancar`, `off`, `standby`, `setup`, `cleaning`, `trial`
- [x] Perkuat dedupe / idempotency saat import ulang hasil parse
- [x] Perjelas rules-first vs AI fallback dalam dokumentasi dan prompt
- [x] Update runbook / docs setelah perilaku parser stabil

## Phase 8 — Downtime Existing Data Integration

- [ ] Implement staged merge from parsed downtime into existing data
- [ ] Add row-level conflict resolution preview
- [ ] Add batch-level validation before write
- [ ] Add rollback-safe replace flow for downtime batches
- [ ] Verify integration on limited date/shift/area slices before full rollout

## Phase 9 — WA Parser Backlog

Rincian prioritas, impact, effort, dan acceptance criteria ada di `docs/wa-parser-backlog.md`. Ambil item MVP dulu, urut dari atas.

- [ ] Preview hasil parse sebelum simpan
- [ ] Manual edit / override row
- [ ] Confidence / quality score per row
- [ ] Duplicate / merge guard
- [ ] Dashboard KPI dasar
- [ ] History import dasar
- [ ] Export CSV / Excel
- [ ] Rule builder untuk keyword parsing
- [ ] Template management per format chat
- [ ] Bulk review / approval queue
- [ ] Analytics trend dan Pareto
- [ ] Undo / rollback import

## MVP Acceptance Criteria

1. Dashboard loads current CSV without error.
2. Dashboard shows correct total rows and total quantity for current dataset.
3. Filters update KPI, charts, and detail table consistently.
4. Machine entity list is usable as master/reference data.
5. No raw credentials exist in committed/source files.
