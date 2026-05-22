PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS master_entity_target (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  area_kerja_line TEXT NOT NULL,
  kode_asli_sistem TEXT NOT NULL,
  kode_asli_normalized TEXT NOT NULL,
  display_laporan TEXT NOT NULL DEFAULT '',
  deskripsi_produk TEXT NOT NULL DEFAULT '',
  target_botol_preform REAL,
  target_thermoforming REAL,
  target_thermoforming_gw_gt_12 REAL,
  target_printing_non_oz REAL,
  target_printing_oz_lt_20 REAL,
  target_printing_22_oz REAL,
  active_target_type TEXT NOT NULL DEFAULT '',
  active_target REAL,
  target_achievement_rate REAL,
  target_reject_rate REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_master_entity_target_code ON master_entity_target(kode_asli_normalized);
CREATE INDEX IF NOT EXISTS idx_master_entity_target_area ON master_entity_target(area_kerja_line);

CREATE TABLE IF NOT EXISTS item_ledger_output (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  posting_date TEXT,
  document_date TEXT,
  entry_type TEXT,
  document_no TEXT,
  external_document_no TEXT,
  shift_code TEXT,
  work_hours REAL,
  operator_name TEXT,
  item_no TEXT,
  prod_line_no TEXT,
  prod_line_description TEXT,
  description TEXT,
  item_category_code TEXT,
  machine_center_no TEXT,
  quantity REAL,
  uom TEXT,
  gross_weight REAL,
  entry_no INTEGER,
  is_reject INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_item_ledger_output_posting_date ON item_ledger_output(posting_date);
CREATE INDEX IF NOT EXISTS idx_item_ledger_output_document_no ON item_ledger_output(document_no);
CREATE INDEX IF NOT EXISTS idx_item_ledger_output_prod_line ON item_ledger_output(prod_line_no);
CREATE INDEX IF NOT EXISTS idx_item_ledger_output_is_reject ON item_ledger_output(is_reject);
CREATE INDEX IF NOT EXISTS idx_item_ledger_output_entry_no ON item_ledger_output(entry_no);
CREATE UNIQUE INDEX IF NOT EXISTS idx_item_ledger_output_entry_no_unique ON item_ledger_output(entry_no) WHERE entry_no IS NOT NULL;

CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  message TEXT
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS downtime_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_date TEXT NOT NULL,
  shift_code TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT '',
  machine TEXT NOT NULL DEFAULT '',
  line TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  start_time TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL DEFAULT '',
  duration_minutes REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  pic TEXT NOT NULL DEFAULT '',
  root_cause TEXT NOT NULL DEFAULT '',
  action_taken TEXT NOT NULL DEFAULT '',
  estimated_loss_output REAL NOT NULL DEFAULT 0,
  linked_signal_type TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_downtime_events_date ON downtime_events(event_date);
CREATE INDEX IF NOT EXISTS idx_downtime_events_machine ON downtime_events(machine);
CREATE INDEX IF NOT EXISTS idx_downtime_events_category ON downtime_events(category);
CREATE INDEX IF NOT EXISTS idx_downtime_events_shift_status ON downtime_events(shift_code, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_downtime_events_natural_key ON downtime_events(event_date, shift_code, area, machine, line, category, start_time, end_time);
