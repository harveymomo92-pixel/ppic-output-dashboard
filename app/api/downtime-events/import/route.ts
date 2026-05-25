import fs from 'node:fs';
import os from 'node:os';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import Papa from 'papaparse';
import { NextRequest, NextResponse } from 'next/server';
import { clean, getDb, numberOrNull } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DowntimeRow = Record<string, string | number | null | undefined>;

const allowedStatuses = new Set(['open', 'monitoring', 'closed']);
const allowedCategories = new Set(['setup', 'machine-trouble', 'material', 'mould', 'electrical', 'qc-hold', 'waiting-order', 'cleaning', 'minor-stop', 'other']);
const execFileAsync = promisify(execFile);

const fieldAliases = {
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
} as const;

function value(value: unknown) {
  return value === null || value === undefined ? '' : String(value);
}

function normalizeHeader(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function pickAlias(row: DowntimeRow, aliases: readonly string[]) {
  for (const alias of aliases) {
    const needle = normalizeHeader(alias);
    for (const key of Object.keys(row)) {
      if (normalizeHeader(key) === needle) return row[key];
    }
  }
  return '';
}

function minutesBetween(eventDate: string, startTime: string, endTime: string) {
  if (!eventDate || !startTime || !endTime) return 0;
  const start = new Date(`${eventDate}T${startTime}:00+07:00`);
  let end = new Date(`${eventDate}T${endTime}:00+07:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  if (end < start) end = new Date(end.getTime() + 86400000);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

async function readXlsxRows(file: File) {
  const tempDir = fs.mkdtempSync(`${os.tmpdir().replace(/\/$/, '')}/ppic-downtime-`);
  const tempPath = `${tempDir}/${file.name || 'downtime.xlsx'}`;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(tempPath, buffer);
    const script = String.raw`
import json, re, sys, zipfile, xml.etree.ElementTree as ET

NS = {
    'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'rel': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'pkgrel': 'http://schemas.openxmlformats.org/package/2006/relationships',
}

def col_idx(ref):
    m = re.match(r'([A-Z]+)', ref or '')
    if not m:
        return 0
    n = 0
    for ch in m.group(1):
        n = n * 26 + (ord(ch) - 64)
    return n - 1

def read_shared_strings(z):
    if 'xl/sharedStrings.xml' not in z.namelist():
        return []
    root = ET.fromstring(z.read('xl/sharedStrings.xml'))
    out = []
    for si in root.findall('main:si', NS):
        parts = []
        for node in si.iter():
            if node.tag in ('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t', '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}rPh'):
                if node.text:
                    parts.append(node.text)
        out.append(''.join(parts))
    return out

def cell_value(cell, shared):
    t = cell.attrib.get('t')
    if t == 'inlineStr':
        return ''.join(tn.text or '' for tn in cell.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t'))
    v = cell.findtext('main:v', default='', namespaces=NS)
    if t == 's':
        try:
            return shared[int(v)]
        except Exception:
            return ''
    if t == 'b':
        return 'TRUE' if v == '1' else 'FALSE'
    return v or ''

with zipfile.ZipFile(sys.argv[1]) as z:
    shared = read_shared_strings(z)
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    rel_map = {rel.attrib['Id']: rel.attrib['Target'] for rel in rels}
    sheet = wb.find('.//main:sheets/main:sheet', NS)
    if sheet is None:
        print(json.dumps([]))
        raise SystemExit(0)
    target = rel_map.get(sheet.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'))
    if not target:
        print(json.dumps([]))
        raise SystemExit(0)
    target = target.lstrip('/')
    if not target.startswith('xl/'):
        target = 'xl/' + target
    root = ET.fromstring(z.read(target))
    rows = []
    for row in root.findall('.//main:sheetData/main:row', NS):
        cells = {}
        max_idx = -1
        for cell in row.findall('main:c', NS):
            idx = col_idx(cell.attrib.get('r', 'A1'))
            if idx > max_idx:
                max_idx = idx
            cells[idx] = cell_value(cell, shared)
        rows.append([cells.get(i, '') for i in range(max_idx + 1)])
    headers = [str(v or '').strip() for v in (rows[0] if rows else [])]
    data = []
    for row in rows[1:]:
        if not any(str(v or '').strip() for v in row):
            continue
        item = {headers[i] if i < len(headers) and headers[i] else f'col_{i+1}': (row[i] if i < len(row) else '') for i in range(max(len(headers), len(row)))}
        data.append(item)
    print(json.dumps(data, ensure_ascii=False))
`;
    const { stdout } = await execFileAsync('python3', ['-c', script, tempPath], { maxBuffer: 20 * 1024 * 1024 });
    return JSON.parse(stdout || '[]') as DowntimeRow[];
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function normalizeDowntimeRow(row: DowntimeRow) {
  const eventDate = clean(pickAlias(row, fieldAliases.event_date));
  const shiftCode = clean(pickAlias(row, fieldAliases.shift_code));
  const area = clean(pickAlias(row, fieldAliases.area));
  const machine = clean(pickAlias(row, fieldAliases.machine));
  const line = clean(pickAlias(row, fieldAliases.line) || machine);
  const rawCategory = clean(pickAlias(row, fieldAliases.category)).toLowerCase();
  const category = allowedCategories.has(rawCategory) ? rawCategory : (rawCategory ? rawCategory.replace(/\s+/g, '-') : 'other');
  const startTime = clean(pickAlias(row, fieldAliases.start_time));
  const endTime = clean(pickAlias(row, fieldAliases.end_time));
  const durationMinutes = numberOrNull(pickAlias(row, fieldAliases.duration_minutes));
  const rawStatus = clean(pickAlias(row, fieldAliases.status)).toLowerCase();
  const status = allowedStatuses.has(rawStatus) ? rawStatus : 'open';
  return {
    event_date: eventDate,
    shift_code: shiftCode,
    area,
    machine,
    line,
    category: category || 'other',
    start_time: startTime,
    end_time: endTime,
    duration_minutes: durationMinutes && durationMinutes > 0 ? durationMinutes : minutesBetween(eventDate, startTime, endTime),
    status,
    pic: clean(pickAlias(row, fieldAliases.pic)),
    root_cause: clean(pickAlias(row, fieldAliases.root_cause)),
    action_taken: clean(pickAlias(row, fieldAliases.action_taken)),
    estimated_loss_output: numberOrNull(pickAlias(row, fieldAliases.estimated_loss_output)) ?? 0,
    linked_signal_type: clean(pickAlias(row, fieldAliases.linked_signal_type)),
  };
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file');
  const mode = value(formData.get('mode') || 'append').toLowerCase();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'File CSV wajib di-upload.' }, { status: 400 });
  }
  if (!['append', 'replace'].includes(mode)) {
    return NextResponse.json({ error: 'Mode tidak valid. Pakai append atau replace.' }, { status: 400 });
  }
  const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
  const isXlsx = /\.xlsx$/i.test(file.name) || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (!isCsv && !isXlsx) {
    return NextResponse.json({ error: 'Upload downtime mendukung CSV atau XLSX.' }, { status: 400 });
  }

  let rows: DowntimeRow[] = [];
  if (isCsv) {
    const text = await file.text();
    const parsed = Papa.parse<DowntimeRow>(text, { header: true, skipEmptyLines: true, transformHeader: (header) => header.trim() });
    if (parsed.errors.length) {
      return NextResponse.json({ error: parsed.errors[0]?.message || 'Gagal membaca CSV.' }, { status: 400 });
    }
    rows = (parsed.data ?? []).filter((row) => row && Object.keys(row).length);
  } else {
    rows = (await readXlsxRows(file)).filter((row) => row && Object.keys(row).length);
  }

  const normalizedRows = rows.map(normalizeDowntimeRow).filter((row) => row.event_date && row.machine && row.category && row.start_time && row.end_time);

  const db = getDb();
  try {
    db.exec('BEGIN');
    try {
      if (mode === 'replace') db.exec('DELETE FROM downtime_events');

      const insert = db.prepare(`
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

      let savedRows = 0;
      let skippedRows = 0;
      for (const row of normalizedRows) {
        const result = insert.run(
          row.event_date,
          row.shift_code,
          row.area,
          row.machine,
          row.line,
          row.category,
          row.start_time,
          row.end_time,
          row.duration_minutes,
          row.status,
          row.pic,
          row.root_cause,
          row.action_taken,
          row.estimated_loss_output,
          row.linked_signal_type,
        );
        if (Number(result.changes ?? 0) > 0) savedRows += 1;
        else skippedRows += 1;
      }

      db.exec('COMMIT');
      const total = db.prepare('SELECT COUNT(*) AS count FROM downtime_events').get() as { count: number };
      db.prepare(`
        INSERT INTO downtime_import_runs (
          source, import_kind, mode, status, processed_rows, saved_rows, inserted_rows, updated_rows, existing_rows, skipped_rows, total_rows, message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        file.name || 'downtime-import',
        isXlsx ? 'xlsx' : 'csv',
        mode,
        'success',
        rows.length,
        savedRows,
        savedRows,
        0,
        0,
        skippedRows,
        total.count,
        `${mode === 'replace' ? 'replace' : 'append'} import ${isXlsx ? 'XLSX' : 'CSV'} ok (${savedRows} saved, ${skippedRows} skip)`,
      );
      const sample = db.prepare('SELECT event_date, machine, category, status, duration_minutes FROM downtime_events ORDER BY event_date DESC, start_time DESC, id DESC LIMIT 3').all();

      return NextResponse.json({
        data: {
          source: file.name,
          mode,
          processedRows: rows.length,
          savedRows,
          skippedRows,
          total: total.count,
          sample,
          message: `${mode === 'replace' ? 'downtime replace' : 'downtime backfill'} ok (${savedRows} row tersimpan, ${skippedRows} skip)`,
        },
      });
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } finally {
    db.close();
  }
}
