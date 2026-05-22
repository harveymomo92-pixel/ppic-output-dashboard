import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { appendDowntimeRows, parseCsv, resolveSourceArg, seedDowntimeRows } from './ppic-import.mjs';

const projectRoot = process.cwd();
const dbPath = path.join(projectRoot, 'data', 'ppic-dashboard.db');
const schemaPath = path.join(projectRoot, 'db', 'schema.sql');

function loadRuntimeEnv() {
  const envFile = process.env.PPIC_DASHBOARD_ENV_FILE || '/root/.config/ppic-output-dashboard/runtime.env';
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadRuntimeEnv();

const args = resolveSourceArg(process.argv);
const source = args.get('source') || process.env.PPIC_DOWNTIME_IMPORT_SOURCE || '';
const mode = String(args.get('mode') || process.env.PPIC_DOWNTIME_IMPORT_MODE || 'append').toLowerCase();

if (!source) {
  throw new Error('Missing downtime import source. Pass --source <csv-file> or set PPIC_DOWNTIME_IMPORT_SOURCE.');
}

if (!['append', 'replace'].includes(mode)) {
  throw new Error(`Invalid downtime import mode: ${mode}. Use append or replace.`);
}

if (!fs.existsSync(source)) {
  throw new Error(`Downtime import source not found: ${source}`);
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(fs.readFileSync(schemaPath, 'utf8'));

const runInsert = db.prepare(`INSERT INTO sync_runs (source, status, row_count, message) VALUES (?, 'running', 0, ?)`);
const runUpdate = db.prepare(`UPDATE sync_runs SET status = ?, finished_at = datetime('now'), row_count = ?, message = ? WHERE id = ?`);
const runId = runInsert.run(`downtime:${source}`, `mode=${mode}`).lastInsertRowid;

try {
  const rows = parseCsv(source);
  const cleanRows = rows.filter((row) => row && Object.keys(row).length);

  db.exec('BEGIN');
  try {
    const result = mode === 'replace' ? seedDowntimeRows(db, cleanRows) : appendDowntimeRows(db, cleanRows);
    db.exec('COMMIT');

    const total = db.prepare('SELECT COUNT(*) AS count FROM downtime_events').get().count;
    const sample = db.prepare('SELECT event_date, machine, category, status, duration_minutes FROM downtime_events ORDER BY event_date DESC, start_time DESC, id DESC LIMIT 3').all();
    const message = `${mode === 'replace' ? 'downtime replace' : 'downtime backfill'} ok (${result.inserted} row tersimpan, ${result.duplicates} skip)`;
    runUpdate.run('success', result.inserted, message, runId);

    console.log(JSON.stringify({
      source,
      mode,
      processedRows: cleanRows.length,
      savedRows: result.inserted,
      skippedRows: result.duplicates,
      total,
      sample,
      message,
    }, null, 2));
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
} catch (error) {
  runUpdate.run('error', 0, error?.message || String(error), runId);
  throw error;
} finally {
  db.close();
}
