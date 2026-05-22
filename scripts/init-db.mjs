import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ensureItemLedgerColumns, parseCsv, seedLedgerRows, seedMasterRows } from './ppic-import.mjs';

const projectRoot = process.cwd();
const dbPath = path.join(projectRoot, 'data', 'ppic-dashboard.db');
const schemaPath = path.join(projectRoot, 'db', 'schema.sql');
const masterCsvPath = path.join(projectRoot, 'public', 'data', 'master_entity_target_produksi.csv');
const itemCsvPath = path.join(projectRoot, 'public', 'data', 'itemledgerppic_output_last3months.csv');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(fs.readFileSync(schemaPath, 'utf8'));
ensureItemLedgerColumns(db);

const masterRows = parseCsv(masterCsvPath);
const itemRows = parseCsv(itemCsvPath);

db.exec('BEGIN');
try {
  seedMasterRows(db, masterRows);
  seedLedgerRows(db, itemRows);
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

const masterCount = db.prepare('SELECT COUNT(*) AS count FROM master_entity_target').get().count;
const itemCount = db.prepare('SELECT COUNT(*) AS count FROM item_ledger_output').get().count;
const rejectCount = db.prepare('SELECT COUNT(*) AS count FROM item_ledger_output WHERE is_reject = 1').get().count;
const sample = db.prepare("SELECT external_document_no, shift_code, work_hours, operator_name FROM item_ledger_output WHERE external_document_no IS NOT NULL AND external_document_no <> '' LIMIT 3").all();
console.log(JSON.stringify({ dbPath, masterCount, itemCount, rejectCount, sample }, null, 2));
db.close();
