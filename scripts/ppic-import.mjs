import fs from 'node:fs';
import Papa from 'papaparse';

export function clean(value, fallback = '') {
  const normalized = String(value ?? '').replace(/\u00a0/g, ' ').trim();
  return normalized || fallback;
}

export function normalizeCode(value) {
  return clean(value).toUpperCase().replace(/\s+/g, ' ');
}

export function numberOrNull(value) {
  const text = clean(value).replace('%', '').replace(',', '.');
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function rejectRate(value) {
  const text = clean(value);
  if (!text) return null;
  if (text.endsWith('%')) return numberOrNull(text) / 100;
  return numberOrNull(text);
}

function defaultAchievementRate(area) {
  const normalized = clean(area).toUpperCase();
  if (normalized === 'INJECTION' || normalized === 'PREFORM') return 0.9;
  if (normalized === 'PRINTING') return 0.85;
  if (normalized === 'BLOWING' || normalized === 'THERMOFORMING') return 0.8;
  return null;
}

function achievementRate(value, area) {
  const parsed = rejectRate(value);
  if (parsed) return parsed > 1 ? parsed / 100 : parsed;
  return defaultAchievementRate(area);
}

export function isRejectRow(row) {
  const item = clean(row.Item_No).toUpperCase();
  const desc = clean(row.Description || row.gItem_Description).toUpperCase();
  return item.startsWith('RJ') || desc.startsWith('REJECT');
}

export function parseExternalDocumentNo(value) {
  const raw = clean(value);
  if (!raw) {
    return { external_document_no: '', shift_code: '', work_hours: null, operator_name: '' };
  }

  const [shiftCode = '', workHoursRaw = '', ...operatorParts] = raw.split('/');
  return {
    external_document_no: raw,
    shift_code: clean(shiftCode),
    work_hours: numberOrNull(workHoursRaw),
    operator_name: clean(operatorParts.join('/')),
  };
}

export function parseCsv(filePath) {
  return Papa.parse(fs.readFileSync(filePath, 'utf8'), { header: true, skipEmptyLines: true }).data;
}

const DOWNTIME_FIELD_ALIASES = {
  event_date: ['event_date', 'event date', 'tanggal'],
  shift_code: ['shift_code', 'shift code', 'shift'],
  area: ['area', 'area kerja'],
  machine: ['machine', 'machine center', 'mesin'],
  line: ['line', 'production line', 'prod line'],
  category: ['category', 'kategori'],
  start_time: ['start_time', 'start time', 'start'],
  end_time: ['end_time', 'end time', 'end'],
  duration_minutes: ['duration_minutes', 'duration minutes', 'durasi'],
  status: ['status'],
  pic: ['pic', 'owner'],
  root_cause: ['root_cause', 'root cause', 'akar masalah'],
  action_taken: ['action_taken', 'action taken', 'follow up'],
  estimated_loss_output: ['estimated_loss_output', 'estimated loss output', 'loss output'],
  linked_signal_type: ['linked_signal_type', 'linked signal type'],
};

const DOWNTIME_CATEGORY_ALIASES = {
  setup: 'setup',
  'machine-trouble': 'machine-trouble',
  'machine trouble': 'machine-trouble',
  machine: 'machine-trouble',
  material: 'material',
  mould: 'mould',
  mold: 'mould',
  electrical: 'electrical',
  'qc-hold': 'qc-hold',
  'qc hold': 'qc-hold',
  'waiting-order': 'waiting-order',
  'waiting order': 'waiting-order',
  cleaning: 'cleaning',
  'minor-stop': 'minor-stop',
  'minor stop': 'minor-stop',
  other: 'other',
};

const DOWNTIME_STATUS_ALIASES = {
  open: 'open',
  monitoring: 'monitoring',
  closed: 'closed',
  done: 'closed',
  complete: 'closed',
  completed: 'closed',
  resolved: 'closed',
};

function pickAlias(row, aliases) {
  for (const key of aliases) {
    for (const sourceKey of Object.keys(row)) {
      if (sourceKey.toLowerCase().replace(/[^a-z0-9]+/g, ' ') === key) return row[sourceKey];
    }
  }
  return '';
}

function parseMinutesBetween(eventDate, startTime, endTime) {
  if (!eventDate || !startTime || !endTime) return 0;
  const start = new Date(`${eventDate}T${startTime}:00+07:00`);
  let end = new Date(`${eventDate}T${endTime}:00+07:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  if (end < start) end = new Date(end.getTime() + 86400000);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

export function normalizeDowntimeRow(row) {
  const eventDate = clean(pickAlias(row, DOWNTIME_FIELD_ALIASES.event_date) || row.event_date || row.Event_Date || row['Event Date'] || row.Tanggal);
  const shiftCode = clean(pickAlias(row, DOWNTIME_FIELD_ALIASES.shift_code) || row.shift_code || row.Shift_Code || row['Shift Code'] || row.Shift);
  const area = clean(pickAlias(row, DOWNTIME_FIELD_ALIASES.area) || row.area || row.Area || row['Area Kerja']);
  const machine = clean(pickAlias(row, DOWNTIME_FIELD_ALIASES.machine) || row.machine || row.Machine || row['Machine Center'] || row['Machine Center No']);
  const line = clean(pickAlias(row, DOWNTIME_FIELD_ALIASES.line) || row.line || row.Line || row['Production Line'] || machine);
  const rawCategory = clean(pickAlias(row, DOWNTIME_FIELD_ALIASES.category) || row.category || row.Category || row.Kategori).toLowerCase();
  const category = DOWNTIME_CATEGORY_ALIASES[rawCategory] || rawCategory.replace(/\s+/g, '-') || 'other';
  const startTime = clean(pickAlias(row, DOWNTIME_FIELD_ALIASES.start_time) || row.start_time || row.Start_Time || row['Start Time'] || row.Start);
  const endTime = clean(pickAlias(row, DOWNTIME_FIELD_ALIASES.end_time) || row.end_time || row.End_Time || row['End Time'] || row.End);
  const duration = numberOrNull(pickAlias(row, DOWNTIME_FIELD_ALIASES.duration_minutes) || row.duration_minutes || row.Duration_Minutes || row['Duration Minutes'] || row.Durasi);
  const rawStatus = clean(pickAlias(row, DOWNTIME_FIELD_ALIASES.status) || row.status || row.Status || 'open').toLowerCase();
  const status = DOWNTIME_STATUS_ALIASES[rawStatus] || 'open';
  return {
    event_date: eventDate,
    shift_code: shiftCode,
    area,
    machine,
    line,
    category: category || 'other',
    start_time: startTime,
    end_time: endTime,
    duration_minutes: duration && duration > 0 ? duration : parseMinutesBetween(eventDate, startTime, endTime),
    status,
    pic: clean(pickAlias(row, DOWNTIME_FIELD_ALIASES.pic) || row.pic || row.PIC || row.Owner),
    root_cause: clean(pickAlias(row, DOWNTIME_FIELD_ALIASES.root_cause) || row.root_cause || row.Root_Cause || row['Root Cause'] || row['Akar Masalah']),
    action_taken: clean(pickAlias(row, DOWNTIME_FIELD_ALIASES.action_taken) || row.action_taken || row.Action_Taken || row['Action Taken'] || row['Follow Up']),
    estimated_loss_output: numberOrNull(pickAlias(row, DOWNTIME_FIELD_ALIASES.estimated_loss_output) || row.estimated_loss_output || row.Estimated_Loss_Output || row['Loss Output']) ?? 0,
    linked_signal_type: clean(pickAlias(row, DOWNTIME_FIELD_ALIASES.linked_signal_type) || row.linked_signal_type || row.Linked_Signal_Type || row['Linked Signal Type']),
  };
}

function prepareDowntimeInsert(db) {
  return db.prepare(`
    INSERT INTO downtime_events (
      event_date, shift_code, area, machine, line, category, start_time, end_time,
      duration_minutes, status, pic, root_cause, action_taken, estimated_loss_output, linked_signal_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(event_date, shift_code, area, machine, line, category, start_time, end_time)
    DO UPDATE SET
      duration_minutes = excluded.duration_minutes,
      status = excluded.status,
      pic = excluded.pic,
      root_cause = excluded.root_cause,
      action_taken = excluded.action_taken,
      estimated_loss_output = excluded.estimated_loss_output,
      linked_signal_type = excluded.linked_signal_type,
      updated_at = datetime('now')
  `);
}

function insertDowntimeRows(db, rows) {
  const insertDowntime = prepareDowntimeInsert(db);
  let inserted = 0;
  let duplicates = 0;
  for (const row of rows) {
    const downtime = normalizeDowntimeRow(row);
    if (!downtime.event_date || !downtime.machine || !downtime.category || !downtime.start_time || !downtime.end_time) {
      duplicates += 1;
      continue;
    }
    const result = insertDowntime.run(
      downtime.event_date,
      downtime.shift_code,
      downtime.area,
      downtime.machine,
      downtime.line,
      downtime.category,
      downtime.start_time,
      downtime.end_time,
      downtime.duration_minutes,
      downtime.status,
      downtime.pic,
      downtime.root_cause,
      downtime.action_taken,
      downtime.estimated_loss_output,
      downtime.linked_signal_type,
    );
    if (Number(result.changes ?? 0) > 0) inserted += 1;
    else duplicates += 1;
  }
  return { inserted, duplicates };
}

export function seedDowntimeRows(db, rows) {
  db.exec('DELETE FROM downtime_events');
  db.exec("DELETE FROM sqlite_sequence WHERE name = 'downtime_events'");
  return insertDowntimeRows(db, rows);
}

export function appendDowntimeRows(db, rows) {
  return insertDowntimeRows(db, rows);
}

const MASTER_FIELD_ALIASES = {
  area_kerja_line: ['area_kerja_line', 'Area Kerja/Line'],
  kode_asli_sistem: ['kode_asli_sistem', 'Kode Asli (Sistem)'],
  display_laporan: ['display_laporan', 'Display Laporan ', 'Display Laporan'],
  deskripsi_produk: ['deskripsi_produk', 'Deskripsi Produk / Keterangan'],
  target_botol_preform: ['target_botol_preform', 'Target Produksi Botol & Preform'],
  target_thermoforming: ['target_thermoforming', 'Target Thermoforming'],
  target_thermoforming_gw_gt_12: ['target_thermoforming_gw_gt_12', 'Target Thermoforming gross weight > 12 gr'],
  target_printing_non_oz: ['target_printing_non_oz', 'Target Printing cup non oz'],
  target_printing_oz_lt_20: ['target_printing_oz_lt_20', 'Target Printing cup oz <20 oz'],
  target_printing_22_oz: ['target_printing_22_oz', 'Target Printing cup 22 oz'],
  active_target_type: ['active_target_type'],
  active_target: ['active_target'],
  target_achievement_rate: ['target_achievement_rate', 'Target Achievement', 'Target Ach'],
  target_reject_rate: ['target_reject_rate', 'Target Reject'],
};

const MASTER_TARGET_FIELDS = [
  'target_botol_preform',
  'target_thermoforming',
  'target_thermoforming_gw_gt_12',
  'target_printing_non_oz',
  'target_printing_oz_lt_20',
  'target_printing_22_oz',
];

function pickField(row, field) {
  for (const key of MASTER_FIELD_ALIASES[field] ?? [field]) {
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  }
  return '';
}

export function normalizeMasterRow(row) {
  return Object.fromEntries(Object.keys(MASTER_FIELD_ALIASES).map((field) => [field, pickField(row, field)]));
}

export function expandMasterRows(rows) {
  const expanded = [];
  for (const rawRow of rows) {
    const row = normalizeMasterRow(rawRow);
    const explicitType = clean(row.active_target_type);
    const explicitValue = numberOrNull(row.active_target);
    if (explicitType && explicitValue !== null) {
      expanded.push({ ...row, active_target_type: explicitType, active_target: explicitValue });
      continue;
    }

    for (const targetField of MASTER_TARGET_FIELDS) {
      const targetValue = numberOrNull(row[targetField]);
      if (targetValue === null) continue;
      expanded.push({
        ...row,
        active_target_type: targetField,
        active_target: targetValue,
      });
    }
  }
  return expanded;
}

export function normalizeLedgerRow(row) {
  const external = parseExternalDocumentNo(row.External_Document_No ?? row['External Document No'] ?? row.ExternalDocumentNo);
  return {
    posting_date: clean(row.Posting_Date),
    document_date: clean(row.Document_Date),
    entry_type: clean(row.Entry_Type),
    document_no: clean(row.Document_No),
    external_document_no: external.external_document_no,
    shift_code: external.shift_code,
    work_hours: external.work_hours,
    operator_name: external.operator_name,
    item_no: clean(row.Item_No),
    prod_line_no: clean(row.gProdOrRotLine_No),
    prod_line_description: clean(row.gProdOrRotLine_Description),
    description: clean(row.Description || row.gItem_Description),
    item_category_code: clean(row.Item_Category_Code),
    machine_center_no: clean(row.Machine_Center_No),
    quantity: numberOrNull(row.Quantity),
    uom: clean(row.Unit_of_Measure_Code),
    gross_weight: numberOrNull(row.Gross_Weight),
    entry_no: numberOrNull(row.Entry_No),
    is_reject: isRejectRow(row) ? 1 : 0,
    raw_json: JSON.stringify(row),
  };
}

export function ensureItemLedgerColumns(db) {
  const existing = new Set((db.prepare('PRAGMA table_info(item_ledger_output)').all()).map((row) => row.name));
  const columns = [
    ['external_document_no', 'TEXT'],
    ['shift_code', 'TEXT'],
    ['work_hours', 'REAL'],
    ['operator_name', 'TEXT'],
  ];
  for (const [column, type] of columns) {
    if (!existing.has(column)) db.exec(`ALTER TABLE item_ledger_output ADD COLUMN ${column} ${type}`);
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_item_ledger_output_shift_code ON item_ledger_output(shift_code)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_item_ledger_output_entry_no ON item_ledger_output(entry_no)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_item_ledger_output_entry_no_unique ON item_ledger_output(entry_no) WHERE entry_no IS NOT NULL');
}

export function seedMasterRows(db, rows) {
  const insertMaster = db.prepare(`
    INSERT INTO master_entity_target (
      area_kerja_line, kode_asli_sistem, kode_asli_normalized, display_laporan, deskripsi_produk,
      target_botol_preform, target_thermoforming, target_thermoforming_gw_gt_12,
      target_printing_non_oz, target_printing_oz_lt_20, target_printing_22_oz,
      active_target_type, active_target, target_achievement_rate, target_reject_rate
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.exec('DELETE FROM master_entity_target');
  db.exec("DELETE FROM sqlite_sequence WHERE name = 'master_entity_target'");
  for (const row of expandMasterRows(rows)) {
    insertMaster.run(
      clean(row.area_kerja_line),
      clean(row.kode_asli_sistem),
      normalizeCode(row.kode_asli_sistem),
      clean(row.display_laporan),
      clean(row.deskripsi_produk),
      numberOrNull(row.target_botol_preform),
      numberOrNull(row.target_thermoforming),
      numberOrNull(row.target_thermoforming_gw_gt_12),
      numberOrNull(row.target_printing_non_oz),
      numberOrNull(row.target_printing_oz_lt_20),
      numberOrNull(row.target_printing_22_oz),
      clean(row.active_target_type),
      numberOrNull(row.active_target),
      achievementRate(row.target_achievement_rate, row.area_kerja_line),
      rejectRate(row.target_reject_rate),
    );
  }
}

function prepareLedgerInsert(db, mode = 'replace') {
  const verb = mode === 'ignore' ? 'INSERT OR IGNORE' : 'INSERT';
  return db.prepare(`
    ${verb} INTO item_ledger_output (
      posting_date, document_date, entry_type, document_no, external_document_no, shift_code, work_hours, operator_name,
      item_no, prod_line_no, prod_line_description, description, item_category_code, machine_center_no,
      quantity, uom, gross_weight, entry_no, is_reject, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
}

function insertLedgerRows(db, rows, mode = 'replace') {
  const insertItem = prepareLedgerInsert(db, mode);
  let inserted = 0;
  let duplicates = 0;
  for (const row of rows) {
    const ledger = normalizeLedgerRow(row);
    const result = insertItem.run(
      ledger.posting_date,
      ledger.document_date,
      ledger.entry_type,
      ledger.document_no,
      ledger.external_document_no,
      ledger.shift_code,
      ledger.work_hours,
      ledger.operator_name,
      ledger.item_no,
      ledger.prod_line_no,
      ledger.prod_line_description,
      ledger.description,
      ledger.item_category_code,
      ledger.machine_center_no,
      ledger.quantity,
      ledger.uom,
      ledger.gross_weight,
      ledger.entry_no,
      ledger.is_reject,
      ledger.raw_json,
    );
    if (Number(result.changes ?? 0) > 0) inserted += 1;
    else duplicates += 1;
  }
  return { inserted, duplicates };
}

export function seedLedgerRows(db, rows) {
  db.exec('DELETE FROM item_ledger_output');
  db.exec("DELETE FROM sqlite_sequence WHERE name = 'item_ledger_output'");
  return insertLedgerRows(db, rows, 'replace');
}

export function appendLedgerRows(db, rows) {
  return insertLedgerRows(db, rows, 'ignore');
}

function buildODataHeaders({ user, password, token }) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (user || password) headers.Authorization = `Basic ${Buffer.from(`${user ?? ''}:${password ?? ''}`).toString('base64')}`;
  return headers;
}

function buildODataUrl({ url, dateFrom, dateTo, pageSize = 5000, entryNoGt, orderBy, top }) {
  const base = new URL(url);
  const currentSelect = base.searchParams.get('$select');
  if (currentSelect?.includes('*')) base.searchParams.delete('$select');
  const currentFilter = base.searchParams.get('$filter');
  const parts = [];
  if (currentFilter) parts.push(`(${currentFilter})`);
  parts.push(`Entry_Type eq 'Output'`);
  if (dateFrom) parts.push(`Posting_Date ge ${dateFrom}`);
  if (dateTo) parts.push(`Posting_Date le ${dateTo}`);
  if (Number.isFinite(entryNoGt) && Number(entryNoGt) > 0) parts.push(`Entry_No gt ${Number(entryNoGt)}`);
  base.searchParams.set('$filter', parts.join(' and '));
  if (orderBy) base.searchParams.set('$orderby', orderBy);
  if (top) base.searchParams.set('$top', String(top));
  else if (!base.searchParams.has('$top')) base.searchParams.set('$top', String(pageSize));
  if (!base.searchParams.has('$format')) base.searchParams.set('$format', 'json');
  return base;
}

async function fetchODataJson(url, auth) {
  const response = await fetch(url, { headers: buildODataHeaders(auth) });
  if (!response.ok) throw new Error(`OData fetch failed ${response.status} ${response.statusText}`);
  return response.json();
}

export async function fetchLatestODataRow({ url, user, password, token, dateFrom, dateTo }) {
  const requestUrl = buildODataUrl({ url, dateFrom, dateTo, orderBy: 'Entry_No desc', top: 1 }).toString();
  const payload = await fetchODataJson(requestUrl, { user, password, token });
  return payload.value?.[0] ?? payload.d?.results?.[0] ?? null;
}

export async function fetchODataRows({ url, user, password, token, dateFrom, dateTo, pageSize = 5000, entryNoGt, orderBy, top }) {
  const base = buildODataUrl({ url, dateFrom, dateTo, pageSize, entryNoGt, orderBy, top });

  const rows = [];
  let nextUrl = base.toString();
  while (nextUrl) {
    const payload = await fetchODataJson(nextUrl, { user, password, token });
    rows.push(...(payload.value ?? payload.d?.results ?? []));
    nextUrl = payload['@odata.nextLink'] || payload.d?.__next || '';
  }
  return rows;
}

export function resolveSourceArg(argv) {
  const args = new Map();
  for (let index = 2; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    if (current.startsWith('--')) {
      const key = current.replace(/^--/, '');
      if (next && !next.startsWith('--')) {
        args.set(key, next);
        index += 1;
      } else {
        args.set(key, 'true');
      }
    }
  }
  return args;
}
