import { NextRequest, NextResponse } from 'next/server';
import { getDb, normalizeCode } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LedgerRow = {
  id: number;
  posting_date: string;
  document_date: string;
  document_no: string;
  external_document_no: string;
  shift_code: string;
  work_hours: number | null;
  operator_name: string;
  item_no: string;
  prod_line_no: string;
  prod_line_description: string;
  description: string;
  item_category_code: string;
  machine_center_no: string;
  quantity: number;
  uom: string;
  gross_weight: number;
  entry_no: number;
  is_reject: number;
};

type MasterRow = {
  id: number;
  area_kerja_line: string;
  kode_asli_sistem: string;
  kode_asli_normalized: string;
  display_laporan: string;
  deskripsi_produk: string;
  active_target_type: string;
  active_target: number | null;
  target_achievement_rate: number | null;
  target_reject_rate: number | null;
};

type SyncRunRow = {
  id: number;
  source: string;
  started_at: string;
  finished_at: string | null;
  row_count: number;
  status: string;
  message: string | null;
};

function num(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clean(value: unknown, fallback = '(blank)') {
  const text = String(value ?? '').replace(/\u00a0/g, ' ').trim();
  return text || fallback;
}

function getJakartaDayProgress() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  const hour = get('hour');
  const minute = get('minute');
  const second = get('second');
  const elapsedSeconds = hour * 3600 + minute * 60 + second;
  return {
    label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    progress: elapsedSeconds / 86400,
  };
}

function groupSum(rows: LedgerRow[], keyFn: (row: LedgerRow) => string, limit = 10) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = keyFn(row);
    map.set(key, (map.get(key) ?? 0) + num(row.quantity));
  }
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function outputByDate(rows: LedgerRow[]) {
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.posting_date, (map.get(row.posting_date) ?? 0) + num(row.quantity));
  return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => a.name.localeCompare(b.name));
}

function getTargetStatus(output: number, prorataTarget: number, achievementTargetRate: number) {
  if (!output && !prorataTarget) return 'no-record';
  if (!prorataTarget) return 'no-record';
  if (output >= prorataTarget) return 'above-target';
  if (output >= prorataTarget * achievementTargetRate) return 'on-track';
  return 'under-target';
}

function getRejectTargetStatus(rejectRate: number, rejectTargetRate: number) {
  if (!rejectTargetRate) return 'no-target';
  if (rejectRate <= rejectTargetRate) return 'within-target';
  return 'exceed-target';
}

function rejectRateMetric(okQty: number, rejectPcsEq: number) {
  const total = okQty + rejectPcsEq;
  return total ? rejectPcsEq / total : 0;
}

function inclusiveDays(start: string, end: string) {
  if (!start || !end) return 0;
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const s = Date.UTC(sy, sm - 1, sd);
  const e = Date.UTC(ey, em - 1, ed);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return 0;
  return Math.floor((e - s) / 86400000) + 1;
}

function listDatesInclusive(start: string, end: string) {
  if (!start || !end) return [] as string[];
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const startMs = Date.UTC(sy, sm - 1, sd);
  const endMs = Date.UTC(ey, em - 1, ed);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return [] as string[];
  const dates: string[] = [];
  for (let ts = startMs; ts <= endMs; ts += 86400000) dates.push(new Date(ts).toISOString().slice(0, 10));
  return dates;
}

function formatDayLabel(date: string) {
  if (!date) return '';
  const [year, month, day] = date.split('-');
  return `${day}/${month}`;
}

function resolveMachineLabel(row: LedgerRow, masterByDescription: Map<string, MasterRow>) {
  const master = masterByDescription.get(normalizeCode(row.prod_line_description));
  return clean(master?.display_laporan || row.prod_line_description);
}

function inferTargetType(row: LedgerRow, docTargetTypes?: Map<string, string>) {
  const docTargetType = docTargetTypes?.get(normalizeCode(row.document_no));
  if (docTargetType) return docTargetType;

  const line = normalizeCode(row.prod_line_description);
  const category = normalizeCode(row.item_category_code);
  const description = normalizeCode(row.description);

  if (line.includes('PRINTING') || category.includes('PRINTING')) {
    const ozMatch = description.match(/(\d+(?:[.,]\d+)?)\s*OZ/);
    if (!ozMatch) return 'target_printing_non_oz';
    const oz = Number(ozMatch[1].replace(',', '.'));
    if (Number.isFinite(oz) && oz === 22) return 'target_printing_22_oz';
    return 'target_printing_oz_lt_20';
  }

  if (line.includes('THERMO') || category.includes('THERMO')) {
    return num(row.gross_weight) > 0.012 ? 'target_thermoforming_gw_gt_12' : 'target_thermoforming';
  }

  return 'target_botol_preform';
}

function masterTargetKey(line: string, targetType: string) {
  return `${normalizeCode(line)}|${targetType}`;
}

function getMasterForLedgerRow(row: LedgerRow, mastersByLine: Map<string, MasterRow[]>, docTargetTypes?: Map<string, string>) {
  const candidates = mastersByLine.get(normalizeCode(row.prod_line_description)) ?? [];
  if (!candidates.length) return undefined;
  const targetType = inferTargetType(row, docTargetTypes);
  return candidates.find((master) => master.active_target_type === targetType) ?? candidates[0];
}

function resolveItemLabel(row: LedgerRow) {
  return clean(row.description || row.item_no);
}

function joinUnique(rows: LedgerRow[], keyFn: (row: LedgerRow) => string, fallback = '-') {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const row of rows) {
    const value = clean(keyFn(row), '');
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values.length ? values.join(' | ') : fallback;
}

type DetailGroup = {
  posting_date: string;
  machine_label: string;
  item_key: string;
  okRows: LedgerRow[];
  rejectRows: LedgerRow[];
};

function chooseGroup(groups: DetailGroup[], docNo: string) {
  if (!groups.length) return null;
  const key = normalizeCode(docNo);
  const exact = groups.find((group) => group.okRows.some((row) => normalizeCode(row.document_no) === key));
  if (exact) return exact;
  return groups.slice().sort((a, b) => b.okRows.length - a.okRows.length || b.okRows.reduce((s, row) => s + num(row.quantity), 0) - a.okRows.reduce((s, row) => s + num(row.quantity), 0))[0] ?? null;
}

function distinctWorkHours(rows: LedgerRow[]) {
  const seen = new Set<string>();
  let total = 0;
  for (const row of rows) {
    const key = [
      row.posting_date,
      normalizeCode(row.prod_line_description),
      normalizeCode(row.document_no),
      normalizeCode(row.external_document_no || ''),
      normalizeCode(row.shift_code || ''),
      normalizeCode(row.operator_name || ''),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    total += num(row.work_hours);
  }
  return total;
}

function summarizeDetailRows(rows: LedgerRow[], masterByDescription: Map<string, MasterRow>, mastersByLine: Map<string, MasterRow[]>, docGrossWeight: Map<string, number>, docTargetTypes: Map<string, string>, limit = 1000) {
  const sliced = rows;
  const groups = new Map<string, DetailGroup>();
  const docToGroups = new Map<string, Set<string>>();

  for (const row of sliced) {
    if (row.is_reject) continue;
    const machineLabel = resolveMachineLabel(row, masterByDescription);
    const key = `${row.posting_date}|${normalizeCode(machineLabel)}|${normalizeCode(row.item_no)}`;
    const group = groups.get(key) ?? { posting_date: row.posting_date, machine_label: machineLabel, item_key: normalizeCode(row.item_no), okRows: [], rejectRows: [] };
    group.okRows.push(row);
    groups.set(key, group);
    const docKey = `${row.posting_date}|${normalizeCode(machineLabel)}|${normalizeCode(row.document_no)}`;
    const set = docToGroups.get(docKey) ?? new Set<string>();
    set.add(key);
    docToGroups.set(docKey, set);
  }

  for (const row of sliced) {
    if (!row.is_reject) continue;
    const machineLabel = resolveMachineLabel(row, masterByDescription);
    const docKey = `${row.posting_date}|${normalizeCode(machineLabel)}|${normalizeCode(row.document_no)}`;
    const linked = docToGroups.get(docKey);
    let group = linked ? chooseGroup(Array.from(linked).map((key) => groups.get(key)).filter((x): x is DetailGroup => !!x), row.document_no) : null;
    if (!group) {
      const sameMachine = Array.from(groups.values()).filter((candidate) => candidate.posting_date === row.posting_date && normalizeCode(candidate.machine_label) === normalizeCode(machineLabel));
      group = chooseGroup(sameMachine, row.document_no);
    }
    if (!group) {
      const key = `${row.posting_date}|${normalizeCode(machineLabel)}|reject|${normalizeCode(row.item_no)}`;
      group = groups.get(key) ?? { posting_date: row.posting_date, machine_label: machineLabel, item_key: normalizeCode(row.item_no), okRows: [], rejectRows: [] };
      groups.set(key, group);
    }
    group.rejectRows.push(row);
  }

  return Array.from(groups.values())
    .map((group) => {
      const anchor = group.okRows[0] ?? group.rejectRows[0];
      const master = anchor ? getMasterForLedgerRow(anchor, mastersByLine, docTargetTypes) : undefined;
      const okRows = group.okRows;
      const rejectRows = group.rejectRows;
      const allRows = [...okRows, ...rejectRows];
      const totalQty = okRows.reduce((sum, row) => sum + num(row.quantity), 0) || rejectRows.reduce((sum, row) => sum + num(row.quantity), 0);
      const totalWorkHours = okRows.length ? distinctWorkHours(okRows) : distinctWorkHours(allRows);
      const totalGrossWeight = okRows.reduce((sum, row) => sum + num(row.gross_weight), 0) || allRows.reduce((sum, row) => sum + num(row.gross_weight), 0);
      const rejectKg = rejectRows.reduce((sum, row) => sum + num(row.gross_weight), 0);
      const rejectKgVisible = rejectRows.reduce((sum, row) => sum + num(row.quantity), 0);
      const rejectPcsEq = rejectRows.reduce((sum, row) => {
        const gw = docGrossWeight.get(row.document_no) ?? 0;
        return sum + (gw > 0 ? num(row.quantity) / gw : 0);
      }, 0);
      const dailyTarget = num(master?.active_target);
      const transactionProrataTarget = dailyTarget && totalWorkHours ? dailyTarget * (totalWorkHours / 24) : 0;
      const achievementPct = transactionProrataTarget ? totalQty / transactionProrataTarget : 0;
      const rejectPct = rejectRateMetric(okRows.reduce((sum, row) => sum + num(row.quantity), 0), rejectPcsEq);
      const docCount = new Set(allRows.map((row) => clean(row.document_no, ''))).size;
      const rejectDetails = rejectRows.map((row) => ({
        document_no: row.document_no,
        item_no: row.item_no,
        item: resolveItemLabel(row),
        quantity: num(row.quantity),
        uom: row.uom,
        gross_weight: num(row.gross_weight),
        operator_name: clean(row.operator_name, ''),
        shift_code: clean(row.shift_code, ''),
      }));
      const operatorMap = new Map<string, { operator_name: string; shift_code: string; document_no: string; quantity: number }>();
      for (const row of allRows) {
        const operator = clean(row.operator_name, '-');
        const shift = clean(row.shift_code, '-');
        const key = `${operator}|${shift}`;
        const current = operatorMap.get(key);
        if (current) current.quantity += num(row.quantity);
        else operatorMap.set(key, { operator_name: operator, shift_code: shift, document_no: row.document_no, quantity: num(row.quantity) });
      }
      const documentMap = new Map<string, { document_no: string; quantity: number; reject_kg: number; type: string }>();
      for (const row of allRows) {
        const current = documentMap.get(row.document_no) ?? { document_no: row.document_no, quantity: 0, reject_kg: 0, type: row.is_reject ? 'REJECT' : 'OK' };
        current.quantity += num(row.quantity);
        if (row.is_reject) current.reject_kg += num(row.quantity);
        if (current.type !== 'MIXED') current.type = current.type === 'OK' && row.is_reject ? 'MIXED' : current.type;
        documentMap.set(row.document_no, current);
      }
      const rejectSummary = rejectDetails.length
        ? rejectDetails.map((detail) => `${detail.item} ${detail.quantity.toLocaleString('en-US')} ${detail.uom} (${detail.document_no})`).join(' | ')
        : '';

      return {
        type: okRows.length ? 'OK' : 'REJECT',
        posting_date: group.posting_date,
        document_date: anchor?.document_date ?? group.posting_date,
        machine_center_no: group.machine_label,
        prod_line_no: joinUnique(allRows, (row) => row.prod_line_no),
        prod_line_description: joinUnique(allRows, (row) => row.prod_line_description),
        display_laporan: group.machine_label,
        active_target: master?.active_target ?? null,
        active_target_type: master?.active_target_type ?? '',
        document_no: joinUnique(allRows, (row) => row.document_no),
        external_document_no: joinUnique(allRows, (row) => row.external_document_no),
        shift_code: joinUnique(allRows, (row) => row.shift_code),
        work_hours: totalWorkHours,
        transaction_prorata_target: transactionProrataTarget,
        achievement_pct: achievementPct,
        reject_pct: rejectPct,
        operator_name: joinUnique(allRows, (row) => row.operator_name),
        item_no: anchor?.item_no ?? '',
        description: anchor ? resolveItemLabel(anchor) : joinUnique(allRows, (row) => resolveItemLabel(row)),
        item_category_code: joinUnique(allRows, (row) => row.item_category_code),
        quantity: totalQty,
        uom: joinUnique(okRows.length ? okRows : allRows, (row) => row.uom),
        gross_weight: totalGrossWeight,
        reject_kg: rejectKgVisible,
        reject_pcs_eq: rejectPcsEq,
        input_count: allRows.length,
        document_count: docCount,
        reject_summary: rejectSummary,
        reject_details: rejectDetails,
        operator_summary: joinUnique(allRows, (row) => row.operator_name),
        operator_details: Array.from(operatorMap.values()),
        document_summary: joinUnique(allRows, (row) => row.document_no),
        document_details: Array.from(documentMap.values()),
      };
    })
    .sort((a, b) => b.posting_date.localeCompare(a.posting_date) || a.display_laporan.localeCompare(b.display_laporan) || a.description.localeCompare(b.description))
    .slice(0, limit);
}

function transactionKey(row: LedgerRow) {
  return [row.posting_date, normalizeCode(row.prod_line_description), row.document_no, row.external_document_no || row.shift_code || '', row.operator_name || ''].join('|');
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const dateFrom = params.get('dateFrom') || '';
  const dateTo = params.get('dateTo') || '';
  const area = params.get('area') || '';
  const machine = params.get('machine') || '';
  const line = params.get('line') || '';
  const category = params.get('category') || '';
  const outputType = params.get('outputType') || '';
  const view = params.get('view') || 'overview';
  const trendArea = params.get('trendArea') || '';
  const trendMachine = params.get('trendMachine') || '';
  const search = (params.get('search') || '').toLowerCase();
  const includeDetails = view === 'data-detail';

  const where: string[] = [];
  const bind: string[] = [];
  if (dateFrom) { where.push('posting_date >= ?'); bind.push(dateFrom); }
  if (dateTo) { where.push('posting_date <= ?'); bind.push(dateTo); }
  if (category) { where.push('item_category_code = ?'); bind.push(category); }
  if (outputType === 'ok') where.push('is_reject = 0');
  if (outputType === 'reject') where.push('is_reject = 1');
  if (search) {
    where.push('(lower(document_no) LIKE ? OR lower(external_document_no) LIKE ? OR lower(item_no) LIKE ? OR lower(description) LIKE ? OR lower(prod_line_description) LIKE ? OR lower(operator_name) LIKE ? OR lower(shift_code) LIKE ?)');
    const s = `%${search}%`;
    bind.push(s, s, s, s, s, s, s);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const db = getDb();
  try {
    const rawRows = db.prepare(`
      SELECT id, posting_date, document_date, document_no, external_document_no, shift_code, work_hours, operator_name, item_no, prod_line_no, prod_line_description,
             description, item_category_code, machine_center_no, quantity, uom, gross_weight, entry_no, is_reject
      FROM item_ledger_output
      ${whereSql}
      ORDER BY posting_date DESC, entry_no DESC
    `).all(...bind) as LedgerRow[];

    const meta = db.prepare(`SELECT MIN(posting_date) AS min, MAX(posting_date) AS max, COUNT(*) AS total FROM item_ledger_output`).get() as { min: string; max: string; total: number };
    const rangeStart = dateFrom || meta.min || dateTo || '';
    const rangeEnd = dateTo || meta.max || dateFrom || '';
    const rangeDays = inclusiveDays(rangeStart, rangeEnd);
    const latestSync = db.prepare(`
      SELECT id, source, started_at, finished_at, row_count, status, message
      FROM sync_runs
      ORDER BY id DESC
      LIMIT 1
    `).get() as SyncRunRow | undefined;
    const optionRows = db.prepare(`
      SELECT DISTINCT machine_center_no, prod_line_description, item_category_code
      FROM item_ledger_output
      ORDER BY prod_line_description
    `).all() as Array<{ machine_center_no: string; prod_line_description: string; item_category_code: string }>;

    const masters = db.prepare(`SELECT id, area_kerja_line, kode_asli_sistem, kode_asli_normalized, display_laporan, deskripsi_produk, active_target_type, active_target, target_achievement_rate, target_reject_rate FROM master_entity_target`).all() as MasterRow[];
    const masterByDescription = new Map<string, MasterRow>();
    const mastersByLine = new Map<string, MasterRow[]>();
    for (const master of masters) {
      const key = normalizeCode(master.kode_asli_sistem);
      if (!masterByDescription.has(key)) masterByDescription.set(key, master);
      const list = mastersByLine.get(key) ?? [];
      list.push(master);
      mastersByLine.set(key, list);
    }

    const rows = rawRows.filter((row) => {
      const machineLabel = resolveMachineLabel(row, masterByDescription);
      const rowMaster = masterByDescription.get(normalizeCode(row.prod_line_description));
      if (area) {
        const normalizedArea = normalizeCode(area);
        if (
          normalizeCode(rowMaster?.area_kerja_line ?? '') !== normalizedArea &&
          normalizeCode(machineLabel) !== normalizedArea &&
          normalizeCode(row.prod_line_description) !== normalizedArea
        ) return false;
      }
      if (machine && normalizeCode(machineLabel) !== normalizeCode(machine)) return false;
      if (line) {
        const normalizedLine = normalizeCode(line);
        if (
          normalizeCode(row.prod_line_description) !== normalizedLine &&
          normalizeCode(machineLabel) !== normalizedLine &&
          normalizeCode(rowMaster?.area_kerja_line ?? '') !== normalizedLine
        ) return false;
      }
      return true;
    });

    const okRows = rows.filter((row) => !row.is_reject);
    const rejectRows = rows.filter((row) => row.is_reject);

    const docGrossWeight = new Map<string, number>();
    const docTargetTypes = new Map<string, string>();
    for (const row of okRows) {
      const gw = num(row.gross_weight);
      if (row.document_no && gw > 0 && !docGrossWeight.has(row.document_no)) docGrossWeight.set(row.document_no, gw);
      if (row.document_no && !docTargetTypes.has(normalizeCode(row.document_no))) docTargetTypes.set(normalizeCode(row.document_no), inferTargetType(row));
    }

    const options = {
      areas: Array.from(new Set(masters.map((row) => clean(row.area_kerja_line, '')).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
      machines: Array.from(new Set(optionRows.map((row) => {
        const master = masterByDescription.get(normalizeCode(row.prod_line_description));
        return clean(master?.display_laporan || row.prod_line_description, '');
      }).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
      lines: Array.from(new Set(optionRows.map((row) => {
        const master = masterByDescription.get(normalizeCode(row.prod_line_description));
        return clean(master?.display_laporan || row.prod_line_description, '');
      }).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
      categories: Array.from(new Set(optionRows.map((row) => clean(row.item_category_code, '')).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    };

    if (includeDetails) {
      return NextResponse.json({
        now: getJakartaDayProgress(),
        kpis: { totalOkQty: 0, rejectKg: 0, rejectPcsEq: 0, rejectRate: 0, documents: 0, machines: 0, items: 0, masterEntities: masters.length, activeDays: 0 },
        trend: [],
        byMachine: [],
        byCategory: [],
        byItem: [],
        rejectRateByLine: [],
        targetPerformance: [],
        detailRows: summarizeDetailRows(rows, masterByDescription, mastersByLine, docGrossWeight, docTargetTypes, rows.length),
        rowCounts: { all: rows.length, ok: okRows.length, reject: rejectRows.length, total: meta.total },
        dateRange: { min: meta.min ?? '', max: meta.max ?? '' },
        syncStatus: latestSync ? {
          source: latestSync.source,
          sourceKind: /^https?:\/\//i.test(latestSync.source) ? 'odata-live' : 'csv-cache',
          status: latestSync.status,
          startedAt: latestSync.started_at,
          finishedAt: latestSync.finished_at,
          rowCount: latestSync.row_count,
          message: latestSync.message ?? '',
        } : null,
        rangeDays,
        options,
      });
    }

    let rejectKg = 0;
    let rejectPcsEq = 0;
    for (const row of rejectRows) {
      const kg = num(row.quantity);
      rejectKg += kg;
      const gw = docGrossWeight.get(row.document_no) ?? 0;
      if (gw > 0) rejectPcsEq += kg / gw;
    }
    const totalOkQty = okRows.reduce((sum, row) => sum + num(row.quantity), 0);

    const kpis = {
      totalOkQty,
      rejectKg,
      rejectPcsEq,
      rejectRate: rejectRateMetric(totalOkQty, rejectPcsEq),
      documents: new Set(rows.map((row) => row.document_no).filter(Boolean)).size,
      machines: new Set(okRows.map((row) => resolveMachineLabel(row, masterByDescription)).filter((value) => value !== '(blank)')).size,
      items: new Set(okRows.map((row) => resolveItemLabel(row)).filter(Boolean)).size,
      masterEntities: masters.length,
      activeDays: new Set(rows.map((row) => row.posting_date)).size,
    };

    const byItemMap = new Map<string, { name: string; value: number; extra: string }>();
    for (const row of okRows) {
      const key = resolveItemLabel(row);
      const current = byItemMap.get(key) ?? { name: key, value: 0, extra: row.item_no || '' };
      current.value += num(row.quantity);
      byItemMap.set(key, current);
    }

    const rejectPcsByLine = new Map<string, number>();
    const okByLine = new Map<string, number>();
    const okByNormLine = new Map<string, number>();
    const okByTargetKey = new Map<string, number>();
    const activeDaysByNormLine = new Map<string, Set<string>>();
    const activeDaysByTargetKey = new Map<string, Set<string>>();
    const workHoursByNormLine = new Map<string, number>();
    const workHoursByTargetKey = new Map<string, number>();
    const prorataTargetByNormLine = new Map<string, number>();
    const prorataTargetByTargetKey = new Map<string, number>();
    const rejectKgByNormLine = new Map<string, number>();
    const rejectKgByTargetKey = new Map<string, number>();
    const rejectPcsByNormLine = new Map<string, number>();
    const rejectPcsByTargetKey = new Map<string, number>();
    const countedTransactions = new Set<string>();
    for (const row of okRows) {
      const key = resolveMachineLabel(row, masterByDescription);
      const normKey = normalizeCode(row.prod_line_description);
      const targetType = inferTargetType(row, docTargetTypes);
      const targetKey = masterTargetKey(row.prod_line_description, targetType);
      const qty = num(row.quantity);
      okByLine.set(key, (okByLine.get(key) ?? 0) + qty);
      okByNormLine.set(normKey, (okByNormLine.get(normKey) ?? 0) + qty);
      okByTargetKey.set(targetKey, (okByTargetKey.get(targetKey) ?? 0) + qty);
      if (!activeDaysByNormLine.has(normKey)) activeDaysByNormLine.set(normKey, new Set());
      activeDaysByNormLine.get(normKey)!.add(row.posting_date);
      if (!activeDaysByTargetKey.has(targetKey)) activeDaysByTargetKey.set(targetKey, new Set());
      activeDaysByTargetKey.get(targetKey)!.add(row.posting_date);

      const txnKey = `${targetKey}|${transactionKey(row)}`;
      if (!countedTransactions.has(txnKey)) {
        countedTransactions.add(txnKey);
        const workHours = num(row.work_hours);
        workHoursByNormLine.set(normKey, (workHoursByNormLine.get(normKey) ?? 0) + workHours);
        workHoursByTargetKey.set(targetKey, (workHoursByTargetKey.get(targetKey) ?? 0) + workHours);
        const dailyTarget = num(getMasterForLedgerRow(row, mastersByLine, docTargetTypes)?.active_target);
        const txnProrataTarget = dailyTarget && workHours ? dailyTarget * (workHours / 24) : 0;
        prorataTargetByNormLine.set(normKey, (prorataTargetByNormLine.get(normKey) ?? 0) + txnProrataTarget);
        prorataTargetByTargetKey.set(targetKey, (prorataTargetByTargetKey.get(targetKey) ?? 0) + txnProrataTarget);
      }
    }
    for (const row of rejectRows) {
      const key = resolveMachineLabel(row, masterByDescription);
      const normKey = normalizeCode(row.prod_line_description);
      const targetType = inferTargetType(row, docTargetTypes);
      const targetKey = masterTargetKey(row.prod_line_description, targetType);
      const qty = num(row.quantity);
      rejectKgByNormLine.set(normKey, (rejectKgByNormLine.get(normKey) ?? 0) + qty);
      rejectKgByTargetKey.set(targetKey, (rejectKgByTargetKey.get(targetKey) ?? 0) + qty);
      const gw = docGrossWeight.get(row.document_no) ?? 0;
      if (gw > 0) {
        const pcsEq = qty / gw;
        rejectPcsByLine.set(key, (rejectPcsByLine.get(key) ?? 0) + pcsEq);
        rejectPcsByNormLine.set(normKey, (rejectPcsByNormLine.get(normKey) ?? 0) + pcsEq);
        rejectPcsByTargetKey.set(targetKey, (rejectPcsByTargetKey.get(targetKey) ?? 0) + pcsEq);
      }
    }

    const rejectRateByLine = Array.from(okByLine.entries())
      .map(([name, okQty]) => {
        const rejectPcs = rejectPcsByLine.get(name) ?? 0;
        return { name, value: okQty ? rejectRateMetric(okQty, rejectPcs) * 100 : 0, okQty, rejectPcsEq: rejectPcs };
      })
      .filter((row) => row.okQty > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    const now = getJakartaDayProgress();
    const filteredMasters = masters.filter((master) => {
      if (area) {
        const normalizedArea = normalizeCode(area);
        if (
          normalizeCode(master.area_kerja_line) !== normalizedArea &&
          normalizeCode(master.display_laporan || master.kode_asli_sistem) !== normalizedArea &&
          normalizeCode(master.kode_asli_sistem) !== normalizedArea
        ) return false;
      }
      if (machine && normalizeCode(master.display_laporan || master.kode_asli_sistem) !== normalizeCode(machine)) return false;
      if (line) {
        const normalizedLine = normalizeCode(line);
        if (
          normalizeCode(master.kode_asli_sistem) !== normalizedLine &&
          normalizeCode(master.display_laporan || master.kode_asli_sistem) !== normalizedLine &&
          normalizeCode(master.area_kerja_line) !== normalizedLine
        ) return false;
      }
      return true;
    });
    const productionMasters = filteredMasters.filter((master) => num(master.active_target) > 0);
    const productionMasterKeys = new Set(productionMasters.map((master) => normalizeCode(master.kode_asli_sistem)));
    const productionTargetKeys = new Set(productionMasters.map((master) => masterTargetKey(master.kode_asli_sistem, master.active_target_type)));
    const trendRowMatches = (row: LedgerRow) => {
      if (!trendArea && !trendMachine) return true;
      const master = getMasterForLedgerRow(row, mastersByLine, docTargetTypes);
      if (trendArea && normalizeCode(master?.area_kerja_line ?? '') !== normalizeCode(trendArea)) return false;
      if (trendMachine && normalizeCode(master?.display_laporan || resolveMachineLabel(row, masterByDescription)) !== normalizeCode(trendMachine)) return false;
      return true;
    };

    const dailyOkQty = new Map<string, number>();
    const dailyProrataTarget = new Map<string, number>();
    const dailyRejectPcsEq = new Map<string, number>();
    const dailyRejectKg = new Map<string, number>();
    const dailyCountedTransactions = new Set<string>();
    for (const row of okRows) {
      const lineKey = normalizeCode(row.prod_line_description);
      if (!productionMasterKeys.has(lineKey)) continue;
      const targetType = inferTargetType(row, docTargetTypes);
      const targetKey = masterTargetKey(row.prod_line_description, targetType);
      if (!productionTargetKeys.has(targetKey)) continue;
      if (!trendRowMatches(row)) continue;
      const date = row.posting_date;
      dailyOkQty.set(date, (dailyOkQty.get(date) ?? 0) + num(row.quantity));

      const txnKey = `${targetKey}|${transactionKey(row)}`;
      if (!dailyCountedTransactions.has(txnKey)) {
        dailyCountedTransactions.add(txnKey);
        const dailyTarget = num(getMasterForLedgerRow(row, mastersByLine, docTargetTypes)?.active_target);
        const workHours = num(row.work_hours);
        const txnProrataTarget = dailyTarget && workHours ? dailyTarget * (workHours / 24) : 0;
        dailyProrataTarget.set(date, (dailyProrataTarget.get(date) ?? 0) + txnProrataTarget);
      }
    }
    for (const row of rejectRows) {
      const lineKey = normalizeCode(row.prod_line_description);
      if (!productionMasterKeys.has(lineKey)) continue;
      const targetType = inferTargetType(row, docTargetTypes);
      const targetKey = masterTargetKey(row.prod_line_description, targetType);
      if (!productionTargetKeys.has(targetKey)) continue;
      if (!trendRowMatches(row)) continue;
      const date = row.posting_date;
      const qty = num(row.quantity);
      dailyRejectKg.set(date, (dailyRejectKg.get(date) ?? 0) + qty);
      const gw = docGrossWeight.get(row.document_no) ?? 0;
      if (gw > 0) dailyRejectPcsEq.set(date, (dailyRejectPcsEq.get(date) ?? 0) + qty / gw);
    }

    const trendDates = listDatesInclusive(rangeStart, rangeEnd);
    const trend = trendDates.length ? trendDates : Array.from(new Set([...dailyOkQty.keys(), ...dailyRejectPcsEq.keys()])).sort((a, b) => a.localeCompare(b));
    const dailyTrend = trend.map((date) => {
      const okQty = dailyOkQty.get(date) ?? 0;
      const targetProrata = dailyProrataTarget.get(date) ?? 0;
      const rejectPcsEq = dailyRejectPcsEq.get(date) ?? 0;
      const rejectKg = dailyRejectKg.get(date) ?? 0;
      const totalQty = okQty + rejectPcsEq;
      return {
        name: formatDayLabel(date),
        date,
        dailyTarget: targetProrata,
        okQty,
        rejectKg,
        rejectPcsEq,
        totalQty,
        achievementPct: targetProrata ? (okQty / targetProrata) * 100 : 0,
        rejectPct: totalQty ? (rejectPcsEq / totalQty) * 100 : 0,
      };
    });

    const targetPerformance = productionMasters
      .map((master) => {
        const lineKey = normalizeCode(master.kode_asli_sistem);
        const targetKey = masterTargetKey(master.kode_asli_sistem, master.active_target_type);
        const matchedOk = okByTargetKey.get(targetKey) ?? 0;
        const matchedWorkHours = workHoursByTargetKey.get(targetKey) ?? 0;
        const matchedRejectKg = rejectKgByTargetKey.get(targetKey) ?? 0;
        const matchedRejectPcs = rejectPcsByTargetKey.get(targetKey) ?? 0;
        const dailyTarget = num(master.active_target);
        const achievementTargetRate = num(master.target_achievement_rate) || 0.8;
        const prorataTarget = prorataTargetByTargetKey.get(targetKey) ?? 0;
        const rejectRate = rejectRateMetric(matchedOk, matchedRejectPcs);
        const dailyTargetTotal = dailyTarget * (rangeDays || 1);
        const achievement = dailyTargetTotal ? matchedOk / dailyTargetTotal : 0;
        const prorataAchievement = prorataTarget ? matchedOk / prorataTarget : 0;
        const status = getTargetStatus(matchedOk, prorataTarget, achievementTargetRate);
        const rejectStatus = getRejectTargetStatus(rejectRate, num(master.target_reject_rate));
        return {
          id: String(master.id),
          ui_id: String(master.id),
          area_kerja_line: master.area_kerja_line,
          kode_asli_sistem: master.kode_asli_sistem,
          display_laporan: master.display_laporan,
          deskripsi_produk: master.deskripsi_produk,
          active_target_type: master.active_target_type,
          active_target: String(master.active_target ?? ''),
          target_achievement_rate: String(master.target_achievement_rate ?? ''),
          targetAchievementRate: achievementTargetRate,
          target_reject_rate: String(master.target_reject_rate ?? ''),
          output: matchedOk,
          workHours: matchedWorkHours,
          rejectKg: matchedRejectKg,
          rejectPcsEq: matchedRejectPcs,
          rejectRate,
          rejectTargetRate: num(master.target_reject_rate),
          rejectStatus,
          dailyTarget,
          activeDays: activeDaysByTargetKey.get(targetKey)?.size ?? 0,
          rangeDays,
          prorataTarget,
          achievement,
          prorataAchievement,
          status,
        };
      })
      .filter((row) => row.output > 0 || row.dailyTarget > 0)
      .sort((a, b) => Number(a.id) - Number(b.id));

    const detailRows = includeDetails ? summarizeDetailRows(rows, masterByDescription, mastersByLine, docGrossWeight, docTargetTypes, rows.length) : [];

    return NextResponse.json({
      now,
      kpis,
      byMachine: groupSum(okRows, (row) => resolveMachineLabel(row, masterByDescription), 10),
      byCategory: groupSum(okRows, (row) => clean(row.item_category_code), 8),
      byItem: Array.from(byItemMap.values()).sort((a, b) => b.value - a.value).slice(0, 10),
      trend: dailyTrend,
      rejectRateByLine,
      targetPerformance,
      detailRows,
      rowCounts: { all: rows.length, ok: okRows.length, reject: rejectRows.length, total: meta.total },
      dateRange: { min: meta.min ?? '', max: meta.max ?? '' },
      syncStatus: latestSync ? {
        source: latestSync.source,
        sourceKind: /^https?:\/\//i.test(latestSync.source) ? 'odata-live' : 'csv-cache',
        status: latestSync.status,
        startedAt: latestSync.started_at,
        finishedAt: latestSync.finished_at,
        rowCount: latestSync.row_count,
        message: latestSync.message ?? '',
      } : null,
      rangeDays,
      options,
    });
  } finally {
    db.close();
  }
}
