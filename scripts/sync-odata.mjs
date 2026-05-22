import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  appendLedgerRows,
  ensureItemLedgerColumns,
  fetchLatestODataRow,
  fetchODataRows,
  parseCsv,
  resolveSourceArg,
  seedLedgerRows,
} from './ppic-import.mjs';

const projectRoot = process.cwd();
const dbPath = path.join(projectRoot, 'data', 'ppic-dashboard.db');
const schemaPath = path.join(projectRoot, 'db', 'schema.sql');
const args = resolveSourceArg(process.argv);

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(fs.readFileSync(schemaPath, 'utf8'));
ensureItemLedgerColumns(db);

function loadAppSettings() {
  const settings = {};
  const rows = db.prepare('SELECT key, value FROM app_settings').all();
  for (const row of rows) settings[row.key] = row.value;
  return settings;
}

const settings = { ...process.env, ...loadAppSettings() };
const source = args.get('source') || settings.PPIC_ODATA_URL || settings.PPIC_ODATA_CSV || path.join(projectRoot, 'public', 'data', 'itemledgerppic_output_last3months.csv');
const dateFrom = args.get('from') || settings.PPIC_ODATA_DATE_FROM || '';
const dateTo = args.get('to') || settings.PPIC_ODATA_DATE_TO || '';
const pageSize = Number(args.get('page-size') || settings.PPIC_ODATA_PAGE_SIZE || '5000');
const backfillDays = Number(args.get('backfill-days') || settings.PPIC_ODATA_BACKFILL_DAYS || '14');
const allowCsvReplace = args.get('replace') === '1' || settings.PPIC_CSV_FULL_REPLACE === '1';
const user = settings.PPIC_ODATA_USER || '';
const password = settings.PPIC_ODATA_PASSWORD || '';
const token = settings.PPIC_ODATA_TOKEN || '';

const runInsert = db.prepare(`INSERT INTO sync_runs (source, status, row_count, message) VALUES (?, 'running', 0, ?)`);
const runUpdate = db.prepare(`UPDATE sync_runs SET status = ?, finished_at = datetime('now'), row_count = ?, message = ? WHERE id = ?`);
const runId = runInsert.run(source, `from=${dateFrom || '-'} to=${dateTo || '-'} pageSize=${pageSize}`).lastInsertRowid;

function getLocalWindowStats() {
  const where = [];
  const bind = [];
  if (dateFrom) {
    where.push('posting_date >= ?');
    bind.push(dateFrom);
  }
  if (dateTo) {
    where.push('posting_date <= ?');
    bind.push(dateTo);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return db.prepare(`
    SELECT COUNT(*) AS count, MIN(posting_date) AS min_posting_date, COALESCE(MAX(entry_no), 0) AS max_entry_no, MAX(posting_date) AS max_posting_date
    FROM item_ledger_output
    ${whereSql}
  `).get(...bind);
}

function getSummary() {
  const total = db.prepare('SELECT COUNT(*) AS count FROM item_ledger_output').get().count;
  const rejectCount = db.prepare('SELECT COUNT(*) AS count FROM item_ledger_output WHERE is_reject = 1').get().count;
  const sample = db.prepare("SELECT external_document_no, shift_code, work_hours, operator_name FROM item_ledger_output WHERE external_document_no IS NOT NULL AND external_document_no <> '' LIMIT 5").all();
  return { total, rejectCount, sample };
}

function shiftIsoDate(dateText, dayDelta) {
  if (!dateText) return '';
  const [year, month, day] = String(dateText).split('-').map(Number);
  const utc = Date.UTC(year, (month || 1) - 1, day || 1);
  if (!Number.isFinite(utc)) return '';
  return new Date(utc + (dayDelta * 86400000)).toISOString().slice(0, 10);
}

let fetchedRows = [];
let insertedRows = 0;
let duplicateRows = 0;
let mode = 'csv';
let strategy = 'full-replace';
let message = 'csv import ok';
let latestRemoteEntryNo = 0;
let latestLocalEntryNo = 0;
let hasNewData = false;
let backfillScanRows = 0;

try {
  if (/^https?:\/\//i.test(source)) {
    mode = 'odata';
    strategy = 'incremental';

    const localStats = getLocalWindowStats();
    latestLocalEntryNo = Number(localStats.max_entry_no ?? 0);
    const recentBackfillFrom = shiftIsoDate(String(localStats.max_posting_date ?? ''), -(Math.max(1, backfillDays) - 1));
    const backfillDateFrom = dateFrom || recentBackfillFrom || String(localStats.min_posting_date ?? '');
    const backfillDateTo = dateTo || String(localStats.max_posting_date ?? '');

    const latestRemoteRow = await fetchLatestODataRow({ url: source, user, password, token, dateFrom, dateTo });
    latestRemoteEntryNo = Number(latestRemoteRow?.Entry_No ?? 0);

    if (!latestRemoteRow) {
      message = 'tidak ada data pada source/range ini';
    } else {
      if (latestLocalEntryNo > 0 && latestRemoteEntryNo <= latestLocalEntryNo) {
        strategy = 'backfill-scan';
        fetchedRows = await fetchODataRows({
          url: source,
          user,
          password,
          token,
          dateFrom: backfillDateFrom,
          dateTo: backfillDateTo,
          pageSize,
          orderBy: 'Entry_No asc',
        });
        backfillScanRows = fetchedRows.length;
      } else if (latestLocalEntryNo > 0) {
        hasNewData = true;
        fetchedRows = await fetchODataRows({
          url: source,
          user,
          password,
          token,
          dateFrom,
          dateTo,
          pageSize,
          entryNoGt: latestLocalEntryNo > 0 ? latestLocalEntryNo : undefined,
          orderBy: 'Entry_No asc',
        });
      } else {
        hasNewData = true;
        fetchedRows = await fetchODataRows({
          url: source,
          user,
          password,
          token,
          dateFrom,
          dateTo,
          pageSize,
          entryNoGt: latestLocalEntryNo > 0 ? latestLocalEntryNo : undefined,
          orderBy: 'Entry_No asc',
        });
      }

      db.exec('BEGIN');
      try {
        const result = appendLedgerRows(db, fetchedRows);
        insertedRows = result.inserted;
        duplicateRows = result.duplicates;
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }

      if (!insertedRows) {
        message = 'tidak ada data baru';
      } else if (strategy === 'backfill-scan') {
        message = `odata backfill ok (+${insertedRows} row baru)`;
      } else if (latestLocalEntryNo > 0) {
        message = `odata incremental ok (+${insertedRows} row baru)`;
      } else {
        strategy = 'initial-load';
        message = `odata initial import ok (${insertedRows} row)`;
      }
    }
  } else {
    fetchedRows = parseCsv(source);
    const existingCount = db.prepare('SELECT COUNT(*) AS count FROM item_ledger_output').get().count;

    db.exec('BEGIN');
    try {
      const result = existingCount > 0 && !allowCsvReplace
        ? appendLedgerRows(db, fetchedRows)
        : seedLedgerRows(db, fetchedRows);
      insertedRows = result.inserted;
      duplicateRows = result.duplicates;
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    if (existingCount > 0 && !allowCsvReplace) {
      strategy = 'csv-append-safe';
      message = insertedRows ? `csv append ok (+${insertedRows} row baru)` : 'csv append ok (tidak ada data baru)';
    }
  }

  const summary = getSummary();
  runUpdate.run('success', insertedRows, message, runId);
  console.log(JSON.stringify({
    mode,
    strategy,
    source,
    hasNewData,
    latestRemoteEntryNo,
    latestLocalEntryNo,
    backfillScanRows,
    fetchedRows: fetchedRows.length,
    importedRows: insertedRows,
    duplicateRows,
    total: summary.total,
    rejectCount: summary.rejectCount,
    message,
    sample: summary.sample,
  }, null, 2));
} catch (error) {
  runUpdate.run('error', insertedRows, error?.message || String(error), runId);
  throw error;
} finally {
  db.close();
}
