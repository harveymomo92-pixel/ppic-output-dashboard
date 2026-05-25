import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '../..');
const DB_PATH = path.join(projectRoot, 'data', 'ppic-dashboard.db');
const SCHEMA_PATH = path.join(projectRoot, 'db', 'schema.sql');
const ITEM_LEDGER_EXTRA_COLUMNS = [
  ['external_document_no', 'TEXT'],
  ['shift_code', 'TEXT'],
  ['work_hours', 'REAL'],
  ['operator_name', 'TEXT'],
] as const;
const MASTER_ENTITY_EXTRA_COLUMNS = [
  ['target_achievement_rate', 'REAL'],
] as const;
const DOWNTIME_EVENT_EXTRA_COLUMNS = [
  ['line', "TEXT NOT NULL DEFAULT ''"],
  ['estimated_loss_output', 'REAL NOT NULL DEFAULT 0'],
  ['linked_signal_type', "TEXT NOT NULL DEFAULT ''"],
] as const;

export function normalizeCode(value: unknown) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\b0+(\d+)\b/g, '$1');
}

export function clean(value: unknown) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim();
}

export function numberOrNull(value: unknown) {
  const text = clean(value).replace('%', '').replace(',', '.');
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function rejectRateOrNull(value: unknown) {
  const text = clean(value);
  if (!text) return null;
  if (text.endsWith('%')) return numberOrNull(text)! / 100;
  return numberOrNull(text);
}

function ensureItemLedgerColumns(db: DatabaseSync) {
  const existing = new Set((db.prepare('PRAGMA table_info(item_ledger_output)').all() as Array<{ name: string }>).map((row) => row.name));
  for (const [column, type] of ITEM_LEDGER_EXTRA_COLUMNS) {
    if (!existing.has(column)) db.exec(`ALTER TABLE item_ledger_output ADD COLUMN ${column} ${type}`);
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_item_ledger_output_shift_code ON item_ledger_output(shift_code)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_item_ledger_output_entry_no ON item_ledger_output(entry_no)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_item_ledger_output_entry_no_unique ON item_ledger_output(entry_no) WHERE entry_no IS NOT NULL');
  db.exec('CREATE INDEX IF NOT EXISTS idx_item_ledger_output_prod_line_desc ON item_ledger_output(prod_line_description)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_item_ledger_output_category ON item_ledger_output(item_category_code)');
}

function ensureMasterEntityColumns(db: DatabaseSync) {
  const existing = new Set((db.prepare('PRAGMA table_info(master_entity_target)').all() as Array<{ name: string }>).map((row) => row.name));
  for (const [column, type] of MASTER_ENTITY_EXTRA_COLUMNS) {
    if (!existing.has(column)) db.exec(`ALTER TABLE master_entity_target ADD COLUMN ${column} ${type}`);
  }
}

function ensureDowntimeEventColumns(db: DatabaseSync) {
  const existing = new Set((db.prepare('PRAGMA table_info(downtime_events)').all() as Array<{ name: string }>).map((row) => row.name));
  for (const [column, type] of DOWNTIME_EVENT_EXTRA_COLUMNS) {
    if (!existing.has(column)) db.exec(`ALTER TABLE downtime_events ADD COLUMN ${column} ${type}`);
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_downtime_events_date ON downtime_events(event_date)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_downtime_events_machine ON downtime_events(machine)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_downtime_events_category ON downtime_events(category)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_downtime_events_shift_status ON downtime_events(shift_code, status)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_downtime_events_natural_key ON downtime_events(event_date, shift_code, area, machine, line, category, start_time, end_time)');
}

function ensureDowntimeImportRunsTable(db: DatabaseSync) {
  const existing = new Set((db.prepare('PRAGMA table_info(downtime_import_runs)').all() as Array<{ name: string }>).map((row) => row.name));
  if (!existing.size) return;
  db.exec('CREATE INDEX IF NOT EXISTS idx_downtime_import_runs_created_at ON downtime_import_runs(created_at DESC)');
}

let cachedSchemaSql: string | null = null;

export function getDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA busy_timeout = 5000');
  cachedSchemaSql ??= fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(cachedSchemaSql);
  ensureMasterEntityColumns(db);
  ensureItemLedgerColumns(db);
  ensureDowntimeEventColumns(db);
  ensureDowntimeImportRunsTable(db);
  return db;
}

export function dbPath() {
  return DB_PATH;
}

export function dbMtimeMs() {
  try {
    return fs.statSync(DB_PATH).mtimeMs;
  } catch {
    return 0;
  }
}
