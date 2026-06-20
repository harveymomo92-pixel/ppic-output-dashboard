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

type ImportConflictKind = 'internal' | 'existing' | 'overlap';
type ImportConflict = {
  kind: ImportConflictKind;
  row_index: number;
  event_date: string;
  shift_code: string;
  area: string;
  machine: string;
  line: string;
  category: string;
  start_time: string;
  end_time: string;
  reason: string;
  duplicate_key?: string;
  existing_id?: number;
  existing_start_time?: string;
  existing_end_time?: string;
};

type ImportPreview = {
  mode: 'append' | 'replace';
  file_name: string;
  total_rows: number;
  valid_rows: number;
  skipped_rows: number;
  unique_rows: number;
  inserted_rows: number;
  updated_rows: number;
  existing_rows: number;
  replace_rows: number;
  internal_duplicate_count: number;
  existing_match_count: number;
  overlap_count: number;
  review_required: boolean;
  can_proceed: boolean;
  notes: string[];
  conflicts: ImportConflict[];
};

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

function parseMinutes(value: string) {
  const [hours = '0', minutes = '0'] = value.split(':');
  const parsedHours = Number(hours);
  const parsedMinutes = Number(minutes);
  if (!Number.isFinite(parsedHours) || !Number.isFinite(parsedMinutes)) return 0;
  return parsedHours * 60 + parsedMinutes;
}

function downtimeNaturalKey(row: Pick<ReturnType<typeof normalizeDowntimeRow>, 'event_date' | 'shift_code' | 'area' | 'machine' | 'line' | 'category' | 'start_time' | 'end_time'>) {
  return [
    row.event_date,
    row.shift_code,
    row.area,
    row.machine,
    row.line,
    row.category,
    row.start_time,
    row.end_time,
  ].map((value) => clean(value)).join('|');
}

function hasTimeOverlap(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string) {
  if (!leftStart || !leftEnd || !rightStart || !rightEnd) return false;
  const leftStartMin = parseMinutes(leftStart);
  const leftEndMin = parseMinutes(leftEnd);
  const rightStartMin = parseMinutes(rightStart);
  const rightEndMin = parseMinutes(rightEnd);
  if ([leftStartMin, leftEndMin, rightStartMin, rightEndMin].some((value) => Number.isNaN(value))) return false;
  return leftStartMin < rightEndMin && rightStartMin < leftEndMin;
}

function chunk<T>(values: T[], size: number) {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += size) out.push(values.slice(index, index + size));
  return out;
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

function collectDowntimePreview(db: ReturnType<typeof getDb>, normalizedRows: ReturnType<typeof normalizeDowntimeRow>[], mode: 'append' | 'replace', fileName: string) {
  const validRows = normalizedRows.filter((row) => row.event_date && row.machine && row.category && row.start_time && row.end_time);
  const skippedRows = normalizedRows.length - validRows.length;
  const seenKeys = new Map<string, number>();
  const conflicts: ImportConflict[] = [];
  let internalDuplicateCount = 0;

  const rowsWithMeta = validRows.map((row, index) => ({
    row,
    index,
    key: downtimeNaturalKey(row),
  }));

  for (const entry of rowsWithMeta) {
    const firstSeen = seenKeys.get(entry.key);
    if (firstSeen !== undefined) {
      internalDuplicateCount += 1;
      conflicts.push({
        kind: 'internal',
        row_index: entry.index,
        event_date: entry.row.event_date,
        shift_code: entry.row.shift_code,
        area: entry.row.area,
        machine: entry.row.machine,
        line: entry.row.line,
        category: entry.row.category,
        start_time: entry.row.start_time,
        end_time: entry.row.end_time,
        reason: `Duplikat dengan baris ${firstSeen + 1} pada file yang sama`,
        duplicate_key: entry.key,
      });
      continue;
    }
    seenKeys.set(entry.key, entry.index);
  }

  const eventDates = Array.from(new Set(rowsWithMeta.map((entry) => entry.row.event_date).filter(Boolean))).sort();
  const existingRows = eventDates.length
    ? chunk(eventDates, 250).flatMap((dateChunk) => db.prepare(`
        SELECT id, event_date, shift_code, area, machine, line, category, start_time, end_time
        FROM downtime_events
        WHERE event_date IN (${dateChunk.map(() => '?').join(',')})
      `).all(...dateChunk) as Array<{
        id: number;
        event_date: string;
        shift_code: string;
        area: string;
        machine: string;
        line: string;
        category: string;
        start_time: string;
        end_time: string;
      }>)
    : [];

  const existingByKey = new Map<string, typeof existingRows[number]>();
  const existingByWindow = new Map<string, typeof existingRows>();
  for (const existing of existingRows) {
    const key = downtimeNaturalKey(existing);
    existingByKey.set(key, existing);
    const windowKey = [existing.event_date, existing.shift_code, existing.machine].map((value) => clean(value)).join('|');
    const list = existingByWindow.get(windowKey) ?? [];
    list.push(existing);
    existingByWindow.set(windowKey, list);
  }

  let existingMatchCount = 0;
  let overlapCount = 0;
  for (const entry of rowsWithMeta) {
    const existing = existingByKey.get(entry.key);
    if (existing && mode !== 'replace') {
      existingMatchCount += 1;
      conflicts.push({
        kind: 'existing',
        row_index: entry.index,
        event_date: entry.row.event_date,
        shift_code: entry.row.shift_code,
        area: entry.row.area,
        machine: entry.row.machine,
        line: entry.row.line,
        category: entry.row.category,
        start_time: entry.row.start_time,
        end_time: entry.row.end_time,
        reason: `Akan update row existing #${existing.id} pada natural key yang sama`,
        duplicate_key: entry.key,
        existing_id: existing.id,
        existing_start_time: existing.start_time,
        existing_end_time: existing.end_time,
      });
    }

    const windowKey = [entry.row.event_date, entry.row.shift_code, entry.row.machine].map((value) => clean(value)).join('|');
    const candidates = existingByWindow.get(windowKey) ?? [];
    for (const candidate of candidates) {
      if (candidate.id === existing?.id) continue;
      if (!hasTimeOverlap(entry.row.start_time, entry.row.end_time, candidate.start_time, candidate.end_time)) continue;
      overlapCount += 1;
      conflicts.push({
        kind: 'overlap',
        row_index: entry.index,
        event_date: entry.row.event_date,
        shift_code: entry.row.shift_code,
        area: entry.row.area,
        machine: entry.row.machine,
        line: entry.row.line,
        category: entry.row.category,
        start_time: entry.row.start_time,
        end_time: entry.row.end_time,
        reason: `Overlap dengan row existing #${candidate.id} pada jam ${candidate.start_time}-${candidate.end_time}`,
        existing_id: candidate.id,
        existing_start_time: candidate.start_time,
        existing_end_time: candidate.end_time,
      });
      break;
    }
  }

  const uniqueRows = seenKeys.size;
  const insertedRows = mode === 'replace' ? uniqueRows : Math.max(0, uniqueRows - existingMatchCount);
  const updatedRows = mode === 'replace' ? 0 : existingMatchCount;
  const existingCount = mode === 'replace' ? existingRows.length : existingMatchCount;
  const replaceRows = mode === 'replace' ? existingRows.length : 0;
  const reviewRequired = internalDuplicateCount > 0 || overlapCount > 0 || (mode === 'replace' && existingRows.length > 0);
  const canProceed = internalDuplicateCount === 0 && overlapCount === 0 && validRows.length > 0;
  const notes = [
    `${validRows.length} row valid, ${skippedRows} row di-skip karena field wajib belum lengkap.`,
    mode === 'replace'
      ? `Replace mode akan menghapus ${existingRows.length} row existing sebelum insert batch baru.`
      : existingMatchCount
        ? `${existingMatchCount} row akan update existing lewat natural key.`
        : 'Tidak ada row existing yang cocok dengan natural key file ini.',
  ];
  if (internalDuplicateCount) notes.push(`${internalDuplicateCount} duplikat internal harus dibersihkan sebelum save.`);
  if (overlapCount) notes.push(`${overlapCount} overlap waktu terdeteksi pada mesin/shift yang sama.`);

  return {
    preview: {
      mode,
      file_name: fileName,
      total_rows: normalizedRows.length,
      valid_rows: validRows.length,
      skipped_rows: skippedRows,
      unique_rows: uniqueRows,
      inserted_rows: insertedRows,
      updated_rows: updatedRows,
      existing_rows: existingCount,
      replace_rows: replaceRows,
      internal_duplicate_count: internalDuplicateCount,
      existing_match_count: existingMatchCount,
      overlap_count: overlapCount,
      review_required: reviewRequired,
      can_proceed: canProceed,
      notes,
      conflicts: conflicts.slice(0, 50),
    } satisfies ImportPreview,
    validRows,
  };
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file');
  const mode = value(formData.get('mode') || 'append').toLowerCase();
  const dryRun = ['1', 'true', 'yes'].includes(value(formData.get('dryRun') || formData.get('dry_run')).toLowerCase());

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

  const normalizedRows = rows.map(normalizeDowntimeRow);

  const db = getDb();
  try {
    const analysis = collectDowntimePreview(db, normalizedRows, mode as 'append' | 'replace', file.name || 'downtime-import');
    const preview = analysis.preview;
    if (dryRun) {
      return NextResponse.json({
        data: {
          source: file.name,
          mode,
          dryRun: true,
          processedRows: preview.total_rows,
          savedRows: 0,
          insertedRows: preview.inserted_rows,
          updatedRows: preview.updated_rows,
          existingRows: preview.existing_rows,
          skippedRows: preview.skipped_rows,
          total: preview.valid_rows,
          sample: [],
          preview,
          message: preview.review_required
            ? `preview ${isXlsx ? 'XLSX' : 'CSV'} butuh review (${preview.conflicts.length} conflict/duplicate)`
            : `preview ${isXlsx ? 'XLSX' : 'CSV'} siap lanjut (${preview.valid_rows} row valid)`,
        },
      });
    }

    db.exec('BEGIN');
    try {
      const insertRows = analysis.validRows;
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
      for (const row of insertRows) {
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
        preview.total_rows,
        savedRows,
        preview.inserted_rows,
        preview.updated_rows,
        preview.existing_rows,
        skippedRows,
        total.count,
        `${mode === 'replace' ? 'replace' : 'append'} import ${isXlsx ? 'XLSX' : 'CSV'} ok (${savedRows} saved, ${skippedRows} skip)`,
      );
      const sample = db.prepare('SELECT event_date, machine, category, status, duration_minutes FROM downtime_events ORDER BY event_date DESC, start_time DESC, id DESC LIMIT 3').all();

      return NextResponse.json({
        data: {
          source: file.name,
          mode,
          dryRun: false,
          processedRows: preview.total_rows,
          savedRows,
          insertedRows: preview.inserted_rows,
          updatedRows: preview.updated_rows,
          existingRows: preview.existing_rows,
          skippedRows,
          total: total.count,
          sample,
          message: `${mode === 'replace' ? 'downtime replace' : 'downtime backfill'} ok (${savedRows} row tersimpan, ${skippedRows} skip)`,
          preview,
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
