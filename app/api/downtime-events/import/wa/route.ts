import { NextRequest, NextResponse } from 'next/server';
import { clean, getDb, normalizeCode } from '@/lib/server/db';
import { loadAppSettings } from '@/lib/server/app-settings';
import { buildMachineSynonymPack, normalizeMachineAliasText } from '@/lib/dashboard';
import {
  addDowntimeWaMinutes as sharedAddDowntimeWaMinutes,
  deriveDowntimeWaDurationMinutes as sharedDeriveDowntimeWaDurationMinutes,
  isPlaceholderDowntimeWaTime as sharedIsPlaceholderDowntimeWaTime,
  normalizeDowntimeWaCondition as sharedNormalizeDowntimeWaCondition,
  resolveDowntimeWaShiftWindow as sharedResolveDowntimeWaShiftWindow,
  resolveDowntimeWaTiming as sharedResolveDowntimeWaTiming,
} from '@/lib/downtime-wa-timing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const WA_PARSER_CONTRACT_VERSION = 'wa-downtime-v4';

type ParsedWaDowntimeRow = {
  event_date: string;
  shift_code: string;
  area: string;
  machine: string;
  machine_raw?: string;
  machine_normalized?: string;
  machine_match?: 'family' | 'alias' | 'raw';
  match_source?: string;
  match_code?: string;
  match_reason?: string;
  idempotency_key?: string;
  line: string;
  category: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: 'open' | 'monitoring' | 'closed';
  pic: string;
  root_cause: string;
  action_taken: string;
  estimated_loss_output: number;
  linked_signal_type: string;
  source_line: string;
  source_order?: number;
  confidence: 'high' | 'medium' | 'low';
  warning: string;
  warning_code?: string;
  condition?: 'downtime' | 'lancar' | 'off' | 'normal' | 'standby' | 'setup' | 'cleaning' | 'trial' | 'running' | 'changeover' | 'unknown';
};

type WaPreviewBlock = {
  event_date: string;
  shift_code: string;
  area: string;
  machine: string;
  row_count: number;
  label: string;
  rows: ParsedWaDowntimeRow[];
};

type AiParseBlock = {
  event_date: string;
  shift_code: string;
  area: string;
  machine: string;
  rows: ParsedWaDowntimeRow[];
};

type AiParseResult = {
  blocks: AiParseBlock[];
  skipped: Array<{ line: string; reason: string }>;
  notes: string[];
};

type DuplicateHint = {
  kind: 'internal' | 'existing';
  row_index: number;
  event_date: string;
  shift_code: string;
  machine: string;
  machine_normalized: string;
  start_time: string;
  end_time: string;
  duplicate_key: string;
  match_source: string;
  reason: string;
};

type WaParseQualitySummary = {
  riskLevel: 'low' | 'medium' | 'high';
  reviewRequired: boolean;
  totalRows: number;
  parsedRows: number;
  structuredRows: number;
  productionRows: number;
  skippedLines: number;
  aiUsed: boolean;
  duplicateHintCount: number;
  rawMachineRows: number;
  lowConfidenceRows: number;
  stateRows: number;
  timingFallbackRows: number;
  notes: string[];
  reasons: string[];
};

type WaStructuredRow = {
  tanggal: string;
  machine_master: string;
  machine_raw: string;
  machine_normalized: string;
  machine_match: 'family' | 'alias' | 'raw';
  match_source: string;
  match_code: string;
  match_reason: string;
  idempotency_key: string;
  start: string;
  end: string;
  durasi_menit: number;
  reason: string;
  operator: string;
  note: string;
  source_line: string;
  condition: string;
  shift_code: string;
  area: string;
  category: string;
  confidence: string;
  warning_code: string;
};

type ProductionSummaryRow = {
  tanggal: string;
  shift_code: string;
  area: 'PRINTING' | 'THERMOFORMING';
  section_label: string;
  machine_master: string;
  machine_raw: string;
  machine_normalized: string;
  machine_match: 'family' | 'alias' | 'raw';
  match_source: string;
  match_code: string;
  match_reason: string;
  idempotency_key: string;
  product: string;
  metric_hasil: string;
  metric_reject_print: string;
  metric_reject_polos: string;
  metric_reject_setup: string;
  metric_reject_sheet: string;
  metric_reject_cup: string;
  metric_sisa_order: string;
  metric_ct: string;
  metric_productivity: string;
  metric_reject_pct: string;
  condition: 'running' | 'off' | 'standby' | 'unknown';
  note: string;
  source_line: string;
  confidence: 'high' | 'medium' | 'low';
  source_order?: number;
};

type ParserMode = 'rules' | 'ai' | 'hybrid';
type AiProvider = 'openai' | 'gemini';

type ParserContext = {
  eventDate: string;
  shiftCode: string;
  machine: string;
  machineRaw: string;
  machineNormalized: string;
  machineMatch: 'family' | 'alias' | 'raw';
  machineMatchCode: string;
  machineMatchReason: string;
  area: string;
  lastEventIndex: number;
  inProblem: boolean;
};

const monthMap: Record<string, string> = {
  januari: '01', jan: '01',
  februari: '02', feb: '02',
  maret: '03', mar: '03',
  april: '04', apr: '04',
  mei: '05',
  juni: '06', jun: '06',
  juli: '07', jul: '07',
  agustus: '08', agu: '08', ags: '08',
  september: '09', sep: '09',
  oktober: '10', okt: '10',
  november: '11', nov: '11',
  desember: '12', des: '12',
};

function resolveShiftWindow(shiftCode: string) {
  return sharedResolveDowntimeWaShiftWindow(shiftCode);
}

function isPlaceholderTime(value: string | null | undefined) {
  return sharedIsPlaceholderDowntimeWaTime(value);
}

function normalizeDowntimeWaCondition(...values: Array<string | undefined | null>) {
  return sharedNormalizeDowntimeWaCondition(...values);
}

function resolveDowntimeWaTiming(args: {
  eventDate: string;
  shiftCode: string;
  condition?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number | null;
}) {
  return sharedResolveDowntimeWaTiming(args);
}

function applyShiftWindowFallback(row: ParsedWaDowntimeRow): ParsedWaDowntimeRow {
  const resolved = resolveDowntimeWaTiming({
    eventDate: row.event_date,
    shiftCode: row.shift_code,
    condition: row.condition || row.root_cause || row.source_line,
    startTime: row.start_time,
    endTime: row.end_time,
    durationMinutes: row.duration_minutes,
  });
  const usedFallback =
    resolved.startTime !== clean(row.start_time)
    || resolved.endTime !== clean(row.end_time)
    || resolved.durationMinutes !== row.duration_minutes
    || (resolved.condition && resolved.condition !== clean(row.condition).toLowerCase());
  if (!usedFallback) return row;
  const warningCode = mergeCodes(row.warning_code, 'timing:shift_window');
  const warning = mergeCodes(
    row.warning,
    resolved.condition === 'lancar' ? 'Kondisi lancar; durasi dinormalisasi ke 0.' : 'Tidak ada jam/durasi eksplisit; memakai rentang shift.',
  );
  return {
    ...row,
    start_time: resolved.startTime,
    end_time: resolved.endTime,
    duration_minutes: resolved.durationMinutes,
    warning,
    warning_code: warningCode,
    idempotency_key: buildDowntimeWaIdempotencyKey({
      event_date: row.event_date,
      shift_code: row.shift_code,
      area: row.area,
      machine: row.machine,
      machine_normalized: row.machine_normalized,
      line: row.line || row.machine,
      category: row.category,
      start_time: resolved.startTime,
      end_time: resolved.endTime,
      root_cause: row.root_cause,
      action_taken: row.action_taken,
      condition: row.condition,
    }),
  };
}

function buildWaParseQualitySummary(args: {
  rows: ParsedWaDowntimeRow[];
  structuredRows: WaStructuredRow[];
  productionRows: ProductionSummaryRow[];
  duplicateHints: DuplicateHint[];
  skippedCount: number;
  notes: string[];
  aiUsed: boolean;
}): WaParseQualitySummary {
  const rawMachineRows = args.rows.filter((row) => row.machine_match === 'raw' || /raw/.test(row.match_code || '') || /raw/.test(row.match_source || '')).length;
  const lowConfidenceRows = args.rows.filter((row) => row.confidence !== 'high').length;
  const stateRows = args.rows.filter((row) => (row.condition || '').toLowerCase() !== 'downtime').length;
  const timingFallbackRows = args.rows.filter((row) => /timing:shift_window|state:/.test(row.warning_code || '')).length;
  const reasons: string[] = [];
  if (args.aiUsed) reasons.push('AI dipakai pada parsing.');
  if (rawMachineRows) reasons.push(`${rawMachineRows} row masih pakai machine raw fallback.`);
  if (lowConfidenceRows) reasons.push(`${lowConfidenceRows} row confidence belum high.`);
  if (args.duplicateHints.length) reasons.push(`${args.duplicateHints.length} conflict/duplicate terdeteksi.`);
  if (args.skippedCount) reasons.push(`${args.skippedCount} line di-skip.`);
  if (timingFallbackRows) reasons.push(`${timingFallbackRows} row pakai fallback timing shift.`);

  let riskLevel: WaParseQualitySummary['riskLevel'] = 'low';
  if (rawMachineRows > 2 || lowConfidenceRows > Math.max(1, Math.ceil(args.rows.length / 2)) || args.duplicateHints.length > 2 || args.skippedCount > args.rows.length) {
    riskLevel = 'high';
  } else if (rawMachineRows > 0 || lowConfidenceRows > 0 || args.duplicateHints.length > 0 || args.skippedCount > 0 || args.aiUsed) {
    riskLevel = 'medium';
  }
  const reviewRequired = riskLevel !== 'low' || args.duplicateHints.length > 0 || rawMachineRows > 0 || lowConfidenceRows > 0;
  if (!reasons.length) reasons.push('Tidak ada indikasi ambiguity utama.');
  return {
    riskLevel,
    reviewRequired,
    totalRows: args.rows.length + args.productionRows.length,
    parsedRows: args.rows.length,
    structuredRows: args.structuredRows.length,
    productionRows: args.productionRows.length,
    skippedLines: args.skippedCount,
    aiUsed: args.aiUsed,
    duplicateHintCount: args.duplicateHints.length,
    rawMachineRows,
    lowConfidenceRows,
    stateRows,
    timingFallbackRows,
    notes: args.notes.slice(0, 8),
    reasons,
  };
}

function value(input: unknown) {
  return input === null || input === undefined ? '' : String(input);
}

function compactKey(input: string) {
  return normalizeText(input)
    .replace(/\b0+(\d+)\b/g, '$1')
    .replace(/[^a-z0-9]+/g, '');
}

function buildDowntimeWaIdempotencyKey(row: Pick<ParsedWaDowntimeRow, 'event_date' | 'shift_code' | 'area' | 'machine' | 'machine_normalized' | 'line' | 'category' | 'start_time' | 'end_time' | 'root_cause' | 'action_taken' | 'condition'>) {
  return [
    clean(row.event_date),
    clean(row.shift_code),
    clean(row.area).toUpperCase(),
    machineKey(row.machine_normalized || row.machine),
    machineKey(row.line || row.machine),
    clean(row.category).toLowerCase(),
    clean(row.start_time),
    clean(row.end_time),
    compactKey(row.root_cause),
    compactKey(row.action_taken),
    clean(row.condition || '').toLowerCase(),
  ].join('|');
}

function buildDowntimeWaMatchSource(machineMatch: 'family' | 'alias' | 'raw', matchCode: string, matchReason: string) {
  if (matchCode.startsWith('family:')) return matchCode;
  if (machineMatch === 'alias') {
    const sourceMatch = matchReason.match(/\bvia\s+([a-z_]+):/i);
    if (sourceMatch?.[1]) return sourceMatch[1].toLowerCase();
    return 'alias_registry';
  }
  if (machineMatch === 'family') return matchCode || 'family';
  return 'raw:fallback';
}

function inferMachineFamilyLabel(text: string) {
  const normalized = normalizeMachineAliasText(text);
  if (/longsun/.test(normalized)) return 'Longsun';
  if (/v\s*-?\s*fine|vfine/.test(normalized)) return 'V-FINE';
  if (/chum power|\bcp\b/.test(normalized)) return 'Chum Power';
  if (/borch|borche/.test(normalized)) return /\b02\b|\b2\b/.test(normalized) ? 'Borche 2' : 'Borche 1';
  if (/illig/.test(normalized)) return `Illig ${normalized.match(/\b([1-3])\b/)?.[1] || '1'}`;
  if (/hengfeng|\bhf\s*0?([1-4])\b/.test(normalized)) return `Hengfeng ${normalized.match(/\bhf\s*0?([1-4])\b/)?.[1] || normalized.match(/\bhengfeng[- ]?([1-4])\b/)?.[1] || '1'}`;
  if (/poly\s*print|polyprint/.test(normalized)) {
    const number = normalized.match(/\b([12])\b/)?.[1] || '';
    return number ? `Polyprint ${number}` : 'Polyprint';
  }
  if (/omso/.test(normalized)) return `OMSO ${normalized.match(/\b([12])\b/)?.[1] || '1'}`;
  if (/newdo/.test(normalized)) return `Newdo ${normalized.match(/\b([12])\b/)?.[1] || '1'}`;
  if (/cai/.test(normalized)) return `CAI ${normalized.match(/\b([12])\b/)?.[1] || '1'}`;
  return '';
}

type MachineCatalogRow = {
  area_kerja_line: string;
  kode_asli_sistem: string;
  kode_asli_normalized: string;
  display_laporan: string;
  deskripsi_produk: string;
};

type MachineResolution = {
  machine: string;
  machineRaw: string;
  machineNormalized: string;
  machineMatch: 'family' | 'alias' | 'raw';
  matchSource: string;
  matchCode: string;
  matchReason: string;
  area: string;
};

type MachineCatalog = {
  rows: MachineCatalogRow[];
  aliases: Array<MachineAliasEntry>;
};

type MachineOrderMap = Map<string, number>;

type MachineAliasSource = 'display_laporan' | 'kode_asli_sistem' | 'kode_asli_normalized' | 'deskripsi_produk' | 'area_kerja_line' | 'family_variant';

type MachineAliasEntry = {
  row: MachineCatalogRow;
  alias: string;
  aliasCompact: string;
  aliasTokens: string[];
  source: MachineAliasSource;
  reason: string;
};

function pushMachineAlias(
  aliases: MachineAliasEntry[],
  seen: Set<string>,
  row: MachineCatalogRow,
  alias: string,
  source: MachineAliasSource,
  reason: string,
) {
  const cleaned = clean(alias);
  if (!cleaned) return;
  const aliasText = normalizeMachineAliasText(cleaned);
  const dedupeKey = `${clean(normalizeText(row.display_laporan))}::${aliasText}`;
  if (seen.has(dedupeKey)) return;
  seen.add(dedupeKey);
  aliases.push({
    row,
    alias: cleaned,
    aliasCompact: compactKey(aliasText),
    aliasTokens: aliasText.split(' ').filter(Boolean),
    source,
    reason,
  });
}

function loadMachineCatalog(): MachineCatalog {
  const db = getDb();
  const rows = db.prepare(`
    SELECT area_kerja_line, kode_asli_sistem, kode_asli_normalized, display_laporan, deskripsi_produk
    FROM master_entity_target
  `).all() as MachineCatalogRow[];
  const aliases: MachineAliasEntry[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    pushMachineAlias(aliases, seen, row, row.display_laporan || '', 'display_laporan', 'Nama laporan master yang disimpan langsung sebagai alias utama.');
    pushMachineAlias(aliases, seen, row, row.kode_asli_sistem || '', 'kode_asli_sistem', 'Kode asli sistem dipakai sebagai alias referensi.');
    pushMachineAlias(aliases, seen, row, row.kode_asli_normalized || '', 'kode_asli_normalized', 'Kode sistem yang sudah dinormalisasi dipakai sebagai alias referensi.');
    pushMachineAlias(aliases, seen, row, row.deskripsi_produk || '', 'deskripsi_produk', 'Deskripsi produk ikut dipakai sebagai sinyal alias.');
    pushMachineAlias(aliases, seen, row, row.area_kerja_line || '', 'area_kerja_line', 'Area/line juga dipakai sebagai alias pendukung.');
    for (const alias of buildMachineSynonymPack(row)) {
      pushMachineAlias(aliases, seen, row, alias, 'family_variant', 'Sinonim family / variasi bentuk teks dari registry alias.');
    }
  }
  return { rows, aliases };
}

function buildMachineOrderMap(catalog: MachineCatalog): MachineOrderMap {
  const map: MachineOrderMap = new Map();
  catalog.rows.forEach((row, index) => {
    const key = machineKey(row.display_laporan || row.kode_asli_sistem || row.kode_asli_normalized || row.deskripsi_produk || row.area_kerja_line);
    if (key && !map.has(key)) map.set(key, index);
  });
  return map;
}

function machineKey(input: string) {
  return compactKey(normalizeMachineAliasText(clean(input)));
}

function isSimilarReason(a: string, b: string) {
  const left = compactKey(a);
  const right = compactKey(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function detectDuplicateHints(rows: ParsedWaDowntimeRow[], existingRows: Array<{ event_date: string; shift_code: string; area: string; machine: string; line: string; start_time: string; end_time: string; root_cause: string }>) {
  const hints: DuplicateHint[] = [];
  const seen = new Map<string, number>();

  rows.forEach((row, index) => {
    const machineNorm = row.machine_normalized || machineKey(row.machine);
    const internalKey = row.idempotency_key || [row.event_date, row.shift_code, machineNorm, row.start_time, row.end_time, compactKey(row.root_cause), compactKey(row.action_taken)].join('|');
    const firstIndex = seen.get(internalKey);
    if (firstIndex !== undefined) {
      hints.push({
        kind: 'internal',
        row_index: index,
        event_date: row.event_date,
        shift_code: row.shift_code,
        machine: row.machine,
        machine_normalized: machineNorm,
        start_time: row.start_time,
        end_time: row.end_time,
        duplicate_key: internalKey,
        match_source: row.match_source || row.match_code || 'raw:fallback',
        reason: `Duplikat dengan baris ${firstIndex + 1} pada hasil parse`,
      });
    } else {
      seen.set(internalKey, index);
    }

    for (const existing of existingRows) {
      const existingMachineNorm = machineKey(existing.machine || existing.line);
      if (existing.event_date !== row.event_date) continue;
      if (existingMachineNorm !== machineNorm) continue;
      if (existing.start_time === row.start_time && existing.end_time === row.end_time) {
        hints.push({
          kind: 'existing',
          row_index: index,
          event_date: row.event_date,
          shift_code: row.shift_code,
          machine: row.machine,
          machine_normalized: machineNorm,
          start_time: row.start_time,
          end_time: row.end_time,
          duplicate_key: internalKey,
          match_source: row.match_source || row.match_code || 'raw:fallback',
          reason: 'Cocok dengan data downtime yang sudah ada',
        });
        continue;
      }
      if (isSimilarReason(row.root_cause, existing.root_cause)) {
        hints.push({
          kind: 'existing',
          row_index: index,
          event_date: row.event_date,
          shift_code: row.shift_code,
          machine: row.machine,
          machine_normalized: machineNorm,
          start_time: row.start_time,
          end_time: row.end_time,
          duplicate_key: internalKey,
          match_source: row.match_source || row.match_code || 'raw:fallback',
          reason: 'Mesin & tanggal cocok, reason sangat mirip dengan histori',
        });
      }
    }
  });

  return hints;
}

function familyBoost(raw: string, alias: string) {
  const rawText = normalizeMachineAliasText(raw);
  const aliasText = normalizeMachineAliasText(alias);
  let boost = 0;
  if (/borch|borche/.test(rawText) && /borch|borche/.test(aliasText)) boost += 200;
  if (/longsun/.test(rawText) && /longsun/.test(aliasText)) boost += 200;
  if (/v\s*-?\s*fine|vfine/.test(rawText) && /v\s*-?\s*fine|vfine/.test(aliasText)) boost += 200;
  if (/\bcp\b|chum power/.test(rawText) && /\bcp\b|chum power/.test(aliasText)) boost += 200;
  if (/illig/.test(rawText) && /illig/.test(aliasText)) boost += 200;
  if (/hengfeng/.test(rawText) && /hengfeng/.test(aliasText)) boost += 200;
  if (/polyprint/.test(rawText) && /polyprint/.test(aliasText)) boost += 150;
  if (/omso/.test(rawText) && /omso/.test(aliasText)) boost += 150;
  if (/newdo/.test(rawText) && /newdo/.test(aliasText)) boost += 150;
  if (/cai/.test(rawText) && /cai/.test(aliasText)) boost += 150;
  const sizeMatch = rawText.match(/\b(\d{2,4}(?:[.,]\d+)?)\s*(ml|gr|gram|oz)\b/);
  if (sizeMatch && aliasText.includes(sizeMatch[1].replace(',', '.'))) boost += 75;
  return boost;
}

type MachineAliasScore = {
  score: number;
  code: string;
  reason: string;
  source: MachineAliasSource;
};

function scoreMachineAlias(raw: string, aliasEntry: MachineAliasEntry): MachineAliasScore | null {
  const rawCompact = compactKey(normalizeMachineAliasText(raw));
  const { alias, aliasCompact, aliasTokens, source, reason } = aliasEntry;
  if (!aliasCompact) return null;
  if (rawCompact === aliasCompact) {
    return {
      score: 5000 + aliasCompact.length,
      code: 'alias:exact',
      reason: `Alias exact match via ${source}: ${alias}. ${reason}`,
      source,
    };
  }
  if (rawCompact.includes(aliasCompact) || aliasCompact.includes(rawCompact)) {
    return {
      score: 3000 + aliasCompact.length,
      code: 'alias:contains',
      reason: `Alias containment match via ${source}: ${alias}. ${reason}`,
      source,
    };
  }
  const rawTokens = new Set(normalizeMachineAliasText(raw).split(' ').filter(Boolean));
  const overlap = aliasTokens.filter((token) => rawTokens.has(token)).length;
  const prefixMatch = aliasTokens[0] && rawTokens.has(aliasTokens[0]) ? 1 : 0;
  const family = familyBoost(raw, alias);
  const score = family + (overlap * 120) + (prefixMatch * 40) + Math.min(aliasTokens.length, 5) * 5;
  if (!score) return null;
  const pieces = [
    overlap > 0 ? `overlap ${overlap}/${aliasTokens.length}` : '',
    prefixMatch ? 'prefix match' : '',
    family ? `family boost ${family}` : '',
    `source ${source}`,
  ].filter(Boolean);
  return {
    score,
    code: family > 0 ? 'alias:family-bias' : overlap >= 2 ? 'alias:overlap' : 'alias:weak',
    reason: `Alias score via ${alias}: ${pieces.join('; ') || reason}.`,
    source,
  };
}

function catalogRowByLabel(catalog: MachineCatalog, label: string) {
  const normalized = normalizeText(label);
  if (!normalized) return null;
  const resolved = catalog.aliases
    .filter((entry) => normalizeText(entry.row.display_laporan) === normalized || normalizeText(entry.alias) === normalized)
    .sort((a, b) => {
      const aExactDisplay = normalizeText(a.row.display_laporan) === normalized ? 1 : 0;
      const bExactDisplay = normalizeText(b.row.display_laporan) === normalized ? 1 : 0;
      if (aExactDisplay !== bExactDisplay) return bExactDisplay - aExactDisplay;

      const aExactAlias = normalizeText(a.alias) === normalized ? 1 : 0;
      const bExactAlias = normalizeText(b.alias) === normalized ? 1 : 0;
      if (aExactAlias !== bExactAlias) return bExactAlias - aExactAlias;

      const sourceRank = (source: MachineAliasSource) => {
        if (source === 'display_laporan') return 5;
        if (source === 'kode_asli_sistem' || source === 'kode_asli_normalized') return 4;
        if (source === 'deskripsi_produk') return 3;
        if (source === 'area_kerja_line') return 2;
        return 1;
      };
      const sourceDiff = sourceRank(b.source) - sourceRank(a.source);
      if (sourceDiff !== 0) return sourceDiff;

      const scoreDiff = (scoreMachineAlias(label, b)?.score ?? 0) - (scoreMachineAlias(label, a)?.score ?? 0);
      if (scoreDiff !== 0) return scoreDiff;

      return a.alias.localeCompare(b.alias);
    })[0]?.row;
  return resolved || null;
}

function resolveMachineLabel(rawLine: string, catalog: MachineCatalog): MachineResolution {
  const raw = stripWaMarkdown(rawLine);
  const borcheFamily = normalizeMachineAliasText(raw).match(/\b(?:borch|borche)\s*0*([1-2])\b/);
  if (borcheFamily) {
    const familyName = `Borche ${borcheFamily[1]}`;
    const family = catalogRowByLabel(catalog, familyName);
    if (family) {
      return {
        machine: clean(family.display_laporan),
        machineRaw: raw,
        machineNormalized: machineKey(family.display_laporan),
        machineMatch: 'family',
        matchSource: 'family:borche',
        matchCode: 'family:borche',
        matchReason: `Family inference dari teks "${familyName}" ke master ${clean(family.display_laporan)}.`,
        area: clean(family.area_kerja_line),
      };
    }
  }
  const directFamily = normalizeMachineAliasText(raw).match(/\b(?:hengfeng|hf)\s*0*([1-4])\b|\b(?:illig|tf)\s*0*([1-3])\b/);
  if (directFamily) {
    const hengfeng = directFamily[1];
    const illig = directFamily[2];
    const familyName = hengfeng ? `Hengfeng ${hengfeng}` : `Illig ${illig}`;
    const family = catalogRowByLabel(catalog, familyName);
    if (family) {
      return {
        machine: clean(family.display_laporan),
        machineRaw: raw,
        machineNormalized: machineKey(family.display_laporan),
        machineMatch: 'family',
        matchSource: 'family:direct',
        matchCode: 'family:direct',
        matchReason: `Family inference langsung dari teks "${familyName}" ke master ${clean(family.display_laporan)}.`,
        area: clean(family.area_kerja_line),
      };
    }
  }
  const inferred = inferMachineFamilyLabel(raw);
  if (inferred) {
    const family = catalogRowByLabel(catalog, inferred);
    if (family) {
      return {
        machine: clean(family.display_laporan),
        machineRaw: raw,
        machineNormalized: machineKey(family.display_laporan),
        machineMatch: 'family',
        matchSource: 'family:inferred',
        matchCode: 'family:inferred',
        matchReason: `Family inference dari pola teks "${inferred}" ke master ${clean(family.display_laporan)}.`,
        area: clean(family.area_kerja_line),
      };
    }
  }

  let best: MachineCatalogRow | null = null;
  let bestScore = 0;
  let bestDecision: MachineAliasScore | null = null;
  for (const entry of catalog.aliases) {
    const decision = scoreMachineAlias(raw, entry);
    if (decision && decision.score > bestScore) {
      best = entry.row;
      bestScore = decision.score;
      bestDecision = decision;
    }
  }

  if (best && bestScore > 0) {
    return {
      machine: clean(best.display_laporan),
      machineRaw: raw,
      machineNormalized: machineKey(best.display_laporan),
      machineMatch: 'alias',
      matchSource: bestDecision?.source || 'alias_registry',
      matchCode: bestDecision?.code || 'alias:match',
      matchReason: bestDecision?.reason || `Alias registry match ke master ${clean(best.display_laporan)}.`,
      area: clean(best.area_kerja_line),
    };
  }

    return {
      machine: clean(raw),
      machineRaw: raw,
      machineNormalized: machineKey(raw),
      machineMatch: 'raw',
      matchSource: 'raw:fallback',
      matchCode: 'machine:raw-fallback',
      matchReason: 'Tidak ada alias registry yang cocok; fallback ke teks asli.',
      area: inferArea(raw),
    };
}

function resolveProductionMachine(rawLine: string, section: 'PRINTING' | 'THERMOFORMING', catalog: MachineCatalog) {
  const raw = stripWaMarkdown(rawLine);
  const normalized = normalizeText(raw);

  if (section === 'PRINTING') {
    const omso = normalized.match(/\bomso\s*([12])\b|\bomso([12])\b/);
    if (omso) {
      const machine = `OMSO ${omso[1] || omso[2]}`;
      return { machine, machineRaw: raw, machineNormalized: machineKey(machine), machineMatch: 'family' as const, matchSource: 'family:printing', matchCode: 'family:printing', matchReason: `Header produksi printing terdeteksi sebagai ${machine}.`, area: 'PRINTING' as const };
    }
    const poly = normalized.match(/\bpoly\s*print\s*([12])\b|\bpolyprint\s*([12])\b/);
    if (poly) {
      const machine = `Polyprint ${poly[1] || poly[2]}`;
      return { machine, machineRaw: raw, machineNormalized: machineKey(machine), machineMatch: 'family' as const, matchSource: 'family:printing', matchCode: 'family:printing', matchReason: `Header produksi printing terdeteksi sebagai ${machine}.`, area: 'PRINTING' as const };
    }
    const cai = normalized.match(/\bcai[- ]?([12])\b/);
    if (cai) {
      const machine = `CAI ${cai[1]}`;
      return { machine, machineRaw: raw, machineNormalized: machineKey(machine), machineMatch: 'family' as const, matchSource: 'family:printing', matchCode: 'family:printing', matchReason: `Header produksi printing terdeteksi sebagai ${machine}.`, area: 'PRINTING' as const };
    }
    const newdo = normalized.match(/\bnewdo[- ]?([12])\b/);
    if (newdo) {
      const machine = `Newdo ${newdo[1]}`;
      return { machine, machineRaw: raw, machineNormalized: machineKey(machine), machineMatch: 'family' as const, matchSource: 'family:printing', matchCode: 'family:printing', matchReason: `Header produksi printing terdeteksi sebagai ${machine}.`, area: 'PRINTING' as const };
    }
  }

  if (section === 'THERMOFORMING') {
    const hf = normalized.match(/\bhf\s*0?([1-4])\b/);
    if (hf) {
      const machine = `Hengfeng ${hf[1]}`;
      return { machine, machineRaw: raw, machineNormalized: machineKey(machine), machineMatch: 'family' as const, matchSource: 'family:thermoforming', matchCode: 'family:thermoforming', matchReason: `Header produksi thermoforming terdeteksi sebagai ${machine}.`, area: 'THERMOFORMING' as const };
    }
    const hengfeng = normalized.match(/\bhengfeng[- ]?([1-4])\b/);
    if (hengfeng) {
      const machine = `Hengfeng ${hengfeng[1]}`;
      return { machine, machineRaw: raw, machineNormalized: machineKey(machine), machineMatch: 'family' as const, matchSource: 'family:thermoforming', matchCode: 'family:thermoforming', matchReason: `Header produksi thermoforming terdeteksi sebagai ${machine}.`, area: 'THERMOFORMING' as const };
    }
    const illig = normalized.match(/\billig[- ]?([1-3])\b/);
    if (illig) {
      const machine = `Illig ${illig[1]}`;
      return { machine, machineRaw: raw, machineNormalized: machineKey(machine), machineMatch: 'family' as const, matchSource: 'family:thermoforming', matchCode: 'family:thermoforming', matchReason: `Header produksi thermoforming terdeteksi sebagai ${machine}.`, area: 'THERMOFORMING' as const };
    }
  }

  const resolved = resolveMachineLabel(raw, catalog);
  return { machine: resolved.machine, machineRaw: raw, machineNormalized: resolved.machineNormalized, machineMatch: resolved.machineMatch, matchSource: resolved.matchSource, matchCode: resolved.matchCode, matchReason: resolved.matchReason, area: section };
}

function detectProductionSection(line: string): '' | 'PRINTING' | 'THERMOFORMING' {
  const text = normalizeText(line);
  if (!text) return '';
  if (/grand total/.test(text)) return '';
  if (/total hasil printing|hasil printing|printing/.test(text)) return 'PRINTING';
  if (/hasil thermo|thermo/.test(text)) return 'THERMOFORMING';
  return '';
}

function isProductionMachineHeader(line: string, section: 'PRINTING' | 'THERMOFORMING') {
  const text = normalizeText(line);
  if (!text) return false;
  if (section === 'PRINTING') return /(omso|poly\s*print|polyprint|cai[- ]?\d|newdo[- ]?\d)/i.test(text) && /[:]|hasil|reject|product|trial|oz|box|pcs|cf|qr/i.test(text);
  return /(hf\s*0?\d|hengfeng|illig)/i.test(text) && /[:]|hasil|reject|rijek|ct|sisa order|pcs|box|gr/i.test(text);
}

function metricValue(line: string, labels: RegExp[]) {
  const text = stripWaMarkdown(line);
  for (const label of labels) {
    const match = text.match(label);
    if (match) return clean(match[1] || match[0]);
  }
  return '';
}

function formatMetricLine(line: string) {
  return stripWaMarkdown(line).replace(/\s+/g, ' ').trim();
}

type ProductionBlockState = {
  section: 'PRINTING' | 'THERMOFORMING';
  date: string;
  shiftCode: string;
  machine: string;
  machineRaw: string;
  machineNormalized: string;
  machineMatch: 'family' | 'alias' | 'raw';
  matchSource: string;
  matchCode: string;
  matchReason: string;
  product: string;
  metrics: Record<string, string>;
  notes: string[];
  sourceLines: string[];
  condition: 'running' | 'off' | 'standby' | 'unknown';
};

function blankProductionState(section: 'PRINTING' | 'THERMOFORMING'): ProductionBlockState {
  return {
    section,
    date: '',
    shiftCode: '',
    machine: '',
    machineRaw: '',
    machineNormalized: '',
    machineMatch: 'raw',
    matchSource: 'raw:fallback',
    matchCode: 'machine:raw-fallback',
    matchReason: '',
    product: '',
    metrics: {},
    notes: [],
    sourceLines: [],
    condition: 'running',
  };
}

function finalizeProductionBlock(block: ProductionBlockState | null): ProductionSummaryRow | null {
  if (!block || !block.date || !block.machine) return null;
  const summary = [
    block.metrics.hasil ? `Hasil: ${block.metrics.hasil}` : '',
    block.metrics.reject_print ? `Reject print: ${block.metrics.reject_print}` : '',
    block.metrics.reject_polos ? `Reject polos: ${block.metrics.reject_polos}` : '',
    block.metrics.reject_setup ? `Reject set up: ${block.metrics.reject_setup}` : '',
    block.metrics.reject_sheet ? `Rijek sheet: ${block.metrics.reject_sheet}` : '',
    block.metrics.reject_cup ? `Rijek cup: ${block.metrics.reject_cup}` : '',
    block.metrics.sisa_order ? `Sisa order: ${block.metrics.sisa_order}` : '',
    block.metrics.ct ? `CT: ${block.metrics.ct}` : '',
    block.metrics.productivity ? `Produktivitas: ${block.metrics.productivity}` : '',
    block.metrics.reject_pct ? `%Reject: ${block.metrics.reject_pct}` : '',
  ].filter(Boolean).join(' | ');
  const note = [...block.notes, summary].filter(Boolean).join(' | ');
  const source = [...block.sourceLines].filter(Boolean).join(' | ');
  const hasOff = /\boff\b/i.test(note) || /\boff\b/i.test(source);
  const hasStandby = /standby|waiting|close order|sisa order/i.test(note + ' ' + source);
  return {
    tanggal: block.date,
    shift_code: block.shiftCode,
    area: block.section,
    section_label: block.section === 'PRINTING' ? 'Total Hasil Printing' : 'Hasil Thermo',
    machine_master: block.machine,
    machine_raw: block.machineRaw,
    machine_normalized: block.machineNormalized,
    machine_match: block.machineMatch,
    match_source: block.matchSource,
    match_code: block.matchCode,
    match_reason: block.matchReason,
    idempotency_key: buildDowntimeWaIdempotencyKey({
      event_date: block.date,
      shift_code: block.shiftCode,
      area: block.section,
      machine: block.machine,
      machine_normalized: block.machineNormalized,
      line: block.machineRaw,
      category: 'other',
      start_time: '00:00',
      end_time: '00:00',
      root_cause: block.product || block.notes.join(' '),
      action_taken: block.notes.join(' '),
      condition: block.condition,
    }),
    product: block.product,
    metric_hasil: block.metrics.hasil || '',
    metric_reject_print: block.metrics.reject_print || '',
    metric_reject_polos: block.metrics.reject_polos || '',
    metric_reject_setup: block.metrics.reject_setup || '',
    metric_reject_sheet: block.metrics.reject_sheet || '',
    metric_reject_cup: block.metrics.reject_cup || '',
    metric_sisa_order: block.metrics.sisa_order || '',
    metric_ct: block.metrics.ct || '',
    metric_productivity: block.metrics.productivity || '',
    metric_reject_pct: block.metrics.reject_pct || '',
    condition: hasOff ? 'off' : hasStandby ? 'standby' : block.condition,
    note,
    source_line: source,
    confidence: block.section === 'PRINTING' ? 'medium' : 'high',
  };
}

function parseProductionReport(text: string, catalog: MachineCatalog): ProductionSummaryRow[] {
  const rows: ProductionSummaryRow[] = [];
  const lines = text.split(/\r?\n/).map((line) => stripWaMarkdown(line)).filter(Boolean);
  let currentSection: '' | 'PRINTING' | 'THERMOFORMING' = '';
  let sectionDate = '';
  let sectionShift = '';
  let current: ProductionBlockState | null = null;

  const flush = () => {
    const row = finalizeProductionBlock(current);
    if (row) rows.push(row);
    current = null;
  };

  for (const line of lines) {
    const date = parseDateLine(line);
    if (date) {
      sectionDate = date;
      if (current) current.date = date;
      continue;
    }
    const shift = parseShiftLine(line);
    if (shift) {
      sectionShift = shift;
      if (current) current.shiftCode = shift;
      continue;
    }

    const section = detectProductionSection(line);
    if (section) {
      flush();
      currentSection = section;
      continue;
    }

    if (!currentSection) continue;

    const headerMatch = currentSection === 'PRINTING'
      ? line.match(/^(?:P\d+\s*[:\-]?)?\s*([^:]+(?:omso|poly\s*print|polyprint|cai[- ]?\d|newdo[- ]?\d)[^:]*)\s*[:\-]\s*(.*)$/i)
      : line.match(/^(?:\*?\s*)?(hf\s*0?\d[^:]*)\s*[:\-]?\s*(.*)$/i);

    if (headerMatch && isProductionMachineHeader(line, currentSection)) {
      flush();
      const resolved = resolveProductionMachine(headerMatch[1], currentSection, catalog);
      current = {
        section: currentSection,
        date: sectionDate,
        shiftCode: sectionShift,
        machine: resolved.machine,
        machineRaw: resolved.machineRaw,
        machineNormalized: resolved.machineNormalized,
        machineMatch: resolved.machineMatch,
        matchSource: resolved.matchSource,
        matchCode: resolved.matchCode,
        matchReason: resolved.matchReason,
        product: autoCorrectHighConfidenceTypos(clean(headerMatch[2])).text,
        metrics: {},
        notes: [],
        sourceLines: [line],
        condition: 'running',
      };
      continue;
    }

    if (!current) continue;
    current.sourceLines.push(line);

    if (currentSection === 'PRINTING') {
      const cleaned = formatMetricLine(line);
      if (/^hasil[:=]/i.test(cleaned)) current.metrics.hasil = clean(cleaned.replace(/^hasil[:=]\s*/i, ''));
      else if (/^(reject print|r\.print)[:=]/i.test(cleaned)) current.metrics.reject_print = clean(cleaned.replace(/^(reject print|r\.print)[:=]\s*/i, ''));
      else if (/^(reject polos|r\.polos)[:=]/i.test(cleaned)) current.metrics.reject_polos = clean(cleaned.replace(/^(reject polos|r\.polos)[:=]\s*/i, ''));
      else if (/^(reject set up|r\.set up)[:=]/i.test(cleaned)) current.metrics.reject_setup = clean(cleaned.replace(/^(reject set up|r\.set up)[:=]\s*/i, ''));
      else if (/^%reject[:=]/i.test(cleaned)) current.metrics.reject_pct = clean(cleaned.replace(/^%reject[:=]\s*/i, ''));
      else if (/^produktifitas|^produktivitas/i.test(cleaned)) current.metrics.productivity = clean(cleaned.replace(/^(produktifitas|produktivitas)[:=]\s*/i, ''));
      else current.notes.push(autoCorrectHighConfidenceTypos(cleaned).text);
    } else {
      const cleaned = formatMetricLine(line);
      if (/^hasil\s*[:=]/i.test(cleaned)) current.metrics.hasil = clean(cleaned.replace(/^hasil\s*[:=]\s*/i, ''));
      else if (/^(rijek sheet|reject sheet)\s*[:=]/i.test(cleaned)) current.metrics.reject_sheet = clean(cleaned.replace(/^(rijek sheet|reject sheet)\s*[:=]\s*/i, ''));
      else if (/^(rijek cup|rejeck cup|reject cup)\s*[:=]/i.test(cleaned)) current.metrics.reject_cup = clean(cleaned.replace(/^(rijek cup|rejeck cup|reject cup)\s*[:=]\s*/i, ''));
      else if (/^sisa order\s*[:=]/i.test(cleaned)) current.metrics.sisa_order = clean(cleaned.replace(/^sisa order\s*[:=]\s*/i, ''));
      else if (/^ct\s*[:=]/i.test(cleaned)) current.metrics.ct = clean(cleaned.replace(/^ct\s*[:=]\s*/i, ''));
      else if (/^\-/.test(cleaned) || /mc off|close order|ganti produk|lanjut/i.test(cleaned)) current.notes.push(autoCorrectHighConfidenceTypos(cleaned).text);
      else current.notes.push(autoCorrectHighConfidenceTypos(cleaned).text);
    }
  }

  flush();
  return rows;
}

function stripWaMarkdown(input: string) {
  return input
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/^\s*[>*•-]+\s*/g, '')
    .replace(/\*/g, '')
    .replace(/_/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(input: string) {
  return stripWaMarkdown(input).toLowerCase().replace(/[^a-z0-9:.,=\-/ ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

type TypoCorrection = { from: string; to: string; confidence: number };

const typoCorrectionRules = [
  { canonical: 'reject', variants: ['rejct', 'rejeck', 'rejek', 'rejekt', 'rijek', 'rject'], confidence: 0.99 },
  { canonical: 'protect', variants: ['proteck', 'protek', 'protct', 'prottek', 'protet'], confidence: 0.99 },
  { canonical: 'produktivitas', variants: ['produktifitas', 'produtivitas', 'prodktivitas'], confidence: 0.98 },
  { canonical: 'cleaning', variants: ['cleanning', 'clening', 'cleanin', 'clinning'], confidence: 0.96 },
  { canonical: 'setup', variants: ['set up', 'set-up', 'setuppp', 'setupp'], confidence: 0.97 },
  { canonical: 'changeover', variants: ['change over', 'change-over', 'changeovr'], confidence: 0.96 },
  { canonical: 'waiting', variants: ['waitting', 'wainting', 'wating'], confidence: 0.95 },
  { canonical: 'problem', variants: ['probelm', 'prblem', 'probem'], confidence: 0.96 },
  { canonical: 'trouble', variants: ['truble', 'troube', 'trbouble'], confidence: 0.95 },
  { canonical: 'machine', variants: ['machne', 'mchine'], confidence: 0.93 },
  { canonical: 'operator', variants: ['operartor', 'opertor'], confidence: 0.94 },
  { canonical: 'material', variants: ['matrial', 'materil'], confidence: 0.94 },
  { canonical: 'electrical', variants: ['electrikal', 'elektrical'], confidence: 0.93 },
  { canonical: 'standby', variants: ['stand by', 'stanby', 'stndby'], confidence: 0.95 },
  { canonical: 'running', variants: ['runing', 'runnning'], confidence: 0.94 },
] as const;

function levenshteinDistance(a: string, b: string) {
  const left = a.replace(/\s+/g, ' ').trim();
  const right = b.replace(/\s+/g, ' ').trim();
  if (!left) return right.length;
  if (!right) return left.length;
  const prev = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = temp;
    }
  }
  return prev[right.length];
}

function autoCorrectHighConfidenceTypos(input: string) {
  const source = clean(input);
  if (!source) return { text: '', corrections: [] as TypoCorrection[] };

  const corrections: TypoCorrection[] = [];
  let text = source;

  for (const rule of typoCorrectionRules) {
    for (const variant of rule.variants) {
      const pattern = new RegExp(`\\b${variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'ig');
      if (!pattern.test(text)) continue;
      text = text.replace(pattern, rule.canonical);
      corrections.push({ from: variant, to: rule.canonical, confidence: rule.confidence });
    }
  }

  const corrected = text.split(/(\s+)/).map((part) => {
    if (/^\s+$/.test(part)) return part;
    if (!/^[a-z][a-z'-]{3,}$/i.test(part)) return part;
    let best: { canonical: string; confidence: number; distance: number } | null = null;
    for (const rule of typoCorrectionRules) {
      for (const candidate of [rule.canonical, ...rule.variants]) {
        const distance = levenshteinDistance(part.toLowerCase(), candidate.toLowerCase());
        const similarity = 1 - (distance / Math.max(part.length, candidate.length));
        if (similarity >= 0.9 && rule.confidence >= 0.95) {
          if (!best || rule.confidence > best.confidence || (rule.confidence === best.confidence && distance < best.distance)) {
            best = { canonical: rule.canonical, confidence: rule.confidence, distance };
          }
        }
      }
    }
    if (!best) return part;
    corrections.push({ from: part, to: best.canonical, confidence: best.confidence });
    return best.canonical;
  }).join('');

  return { text: clean(corrected), corrections };
}

function applyHighConfidenceTyposToRow(row: ParsedWaDowntimeRow) {
  const rootText = normalizeReasonText(row.root_cause, row.source_line || row.line || row.machine_raw || row.machine || '');
  const actionText = normalizeActionText(row.action_taken, row.source_line || row.line || row.machine_raw || row.machine || '');
  const root = autoCorrectHighConfidenceTypos(rootText);
  const action = autoCorrectHighConfidenceTypos(actionText);
  const warningParts = [clean(row.warning)];
  const warningCode = mergeCodes(
    row.warning_code,
    root.corrections.length ? 'typo:root_cause' : '',
    action.corrections.length ? 'typo:action_taken' : '',
  );
  if (root.corrections.length) warningParts.push(`Auto-correct cause: ${root.corrections.slice(0, 3).map((item) => `${item.from}→${item.to}`).join(', ')}`);
  if (action.corrections.length) warningParts.push(`Auto-correct action: ${action.corrections.slice(0, 3).map((item) => `${item.from}→${item.to}`).join(', ')}`);
  return {
    ...row,
    root_cause: root.text || rootText || row.root_cause,
    action_taken: action.text || actionText || row.action_taken,
    warning: warningParts.filter(Boolean).join(' | '),
    warning_code: warningCode,
  } as ParsedWaDowntimeRow;
}

function parseDateLine(line: string) {
  const normalized = normalizeText(line).replace(/,/g, ' ');
  const match = normalized.match(/(?:senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu)?\s*(\d{1,3})\s*([a-z]+)\s*(20\d{2})/i)
    || normalized.match(/(?:senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu)?\s*(\d{1,3})([a-z]+)\s*(20\d{2})/i);
  if (!match) return '';
  const rawDay = match[1];
  const month = monthMap[match[2].toLowerCase()];
  if (!month) return '';
  const dayCandidates = [rawDay, rawDay.slice(-2), rawDay.slice(0, 2)]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value >= 1 && value <= 31);
  const day = String(dayCandidates[0] ?? Number(rawDay)).padStart(2, '0');
  return `${match[3]}-${month}-${day}`;
}

function parseShiftLine(line: string) {
  const match = normalizeText(line).match(/\bshift\s*([123])\b/i);
  return match ? `Shift ${match[1]}` : '';
}

function shiftNumber(shiftCode: string) {
  return shiftCode.match(/[123]/)?.[0] || '1';
}

function minutesBetween(eventDate: string, startTime: string, endTime: string) {
  void eventDate;
  return sharedDeriveDowntimeWaDurationMinutes(startTime, endTime);
}

function addMinutes(time: string, minutes: number) {
  return sharedAddDowntimeWaMinutes(time, minutes);
}

function normalizeTime(raw: string) {
  const text = raw.trim().replace(',', '.');
  const parts = text.split(/[.:]/).map((part) => part.trim());
  const hour = Number(parts[0]);
  const minute = Number(parts[1] ?? 0);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23 || !Number.isFinite(minute) || minute < 0 || minute > 59) return '';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseProblemTiming(line: string, context: Pick<ParserContext, 'eventDate' | 'shiftCode'>) {
  const text = normalizeText(line);
  const range = text.match(/(?:\(|\b)(\d{1,2}[.:]\d{2})\s*[-–]\s*(\d{1,2}[.:]\d{2})(?:\s*=\s*(\d{1,4})\s*(?:menit|mnt|min)?)?/i);
  if (range) {
    const start = normalizeTime(range[1]);
    const end = normalizeTime(range[2]);
    const duration = range[3] !== undefined ? Number(range[3]) : minutesBetween(context.eventDate, start, end);
    return { start, end, duration, confidence: 'high' as const, warning: '' };
  }

  const durationMatch = text.match(/(\d{1,4})\s*(?:menit|mnt|min)\b/i);
  if (durationMatch) {
    const duration = Number(durationMatch[1]);
    const shiftWindow = resolveShiftWindow(context.shiftCode);
    return {
      start: shiftWindow.start,
      end: addMinutes(shiftWindow.start, duration),
      duration,
      confidence: 'medium' as const,
      warning: 'Jam tidak disebut di WA; start auto dari awal shift.',
    };
  }

  return null;
}

function looksLikeMachineLine(line: string) {
  const text = stripWaMarkdown(line);
  const normalized = normalizeText(text);
  if (!text || normalized.includes(':')) return false;
  if (/^(hasil|sisa order|rijek|reject|r\.preform|r\.prifrom|prifrom|preform b|gumpalan|ct|problem|lancar)\b/i.test(normalized)) return false;
  if (/^(botol|preform loaded|reset|penambahan|mesin stop)\b/i.test(normalized)) return false;
  if (inferMachineFamilyLabel(text)) return true;
  if (/\b(longsun|borch|borche|v\s*-?\s*fine|chum power|cp|hengfeng|hf|illig|tf|poly\s*print|polyprint|omso|new\s*do|newdo|cai)\b/i.test(normalized)) return true;
  return /^[A-Z0-9 .-]{2,24}$/.test(text) && !/\d+\s*(ml|gr|gram|pcs|kg|jb|polly)/i.test(text);
}

function normalizeMachine(line: string, catalog: MachineCatalog) {
  const resolved = resolveMachineLabel(line, catalog);
  const text = stripWaMarkdown(resolved.machine)
    .replace(/^[-•*\s]+/, '')
    .replace(/\bcp\b.*$/i, '')
    .replace(/\boff\b.*$/i, '')
    .replace(/\b(preform|botol|product|produk|logo|pristine|gram|gr|ml|pcs|kg|jb|polly)\b.*$/i, '')
    .replace(/[,:;\-–]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const compact = text || stripWaMarkdown(line);
  const core = compact.match(/^(LONGSUN|BORCHE\s*\d+|V-?FINE|CP)\b/i)?.[1];
  if (core) return core.replace(/\s+/g, ' ').trim();
  const prefix = compact.match(/^[A-Za-z][A-Za-z0-9\- ]{1,20}?/i)?.[0];
  return (prefix || compact).trim();
}

function inferArea(machine: string) {
  const text = normalizeMachineAliasText(machine);
  if (/longsun|borche|v\s*-?\s*fine|cp/.test(text)) return 'BLOWING';
  return '';
}

function inferCategory(problem: string) {
  const text = normalizeText(autoCorrectHighConfidenceTypos(problem).text);
  if (/ciler|chiller|trip|breker|breaker|panel|sdp|listrik|power/.test(text)) return 'electrical';
  if (/preform|material|loaded|ganjel|bahan/.test(text)) return 'material';
  if (/mould|mold|dies/.test(text)) return 'mould';
  if (/setting|seting|setup|ct\b|cycle/.test(text)) return 'setup';
  if (/qc|quality|reject|rijek/.test(text)) return 'qc-hold';
  if (/off|order|cp\b|tunggu/.test(text)) return 'waiting-order';
  if (/stop|mesin|trouble|macet/.test(text)) return 'machine-trouble';
  return 'other';
}

function isNoProblem(line: string) {
  const text = normalizeText(line);
  return !text || /^[-–]*\s*(lancar|aman|normal|ok|all ok|steady)\s*$/i.test(text) || text === 'problem';
}

function inferConditionFromText(line: string) {
  const text = normalizeText(autoCorrectHighConfidenceTypos(line).text);
  if (!text) return '';
  if (/^[-–]*\s*(lancar|aman|normal|ok|all ok|steady)\s*$/i.test(text)) return 'lancar';
  if (/\boff\b/i.test(text)) return 'off';
  if (/\bstandby|waiting|tunggu order|waiting order\b/i.test(text)) return 'standby';
  if (/\bsetup|changeover|switch over|switching\b/i.test(text)) return 'setup';
  if (/\bclean|cleaning|wash|cuci\b/i.test(text)) return 'cleaning';
  if (/\btrial|test run|uji coba\b/i.test(text)) return 'trial';
  if (/\brunning|jalan|run\b/i.test(text)) return 'running';
  return '';
}

function parseMachineState(line: string) {
  const state = inferConditionFromText(line);
  return ['lancar', 'off', 'standby', 'setup', 'cleaning', 'trial', 'running'].includes(state) ? state : '';
}

function isLikelyProblemStarter(line: string) {
  const text = normalizeText(autoCorrectHighConfidenceTypos(line).text);
  if (!text || isNoProblem(line)) return false;
  if (parseProblemTiming(line, { eventDate: '2026-01-01', shiftCode: 'Shift 1' })) return true;
  return /(stop|trip|breker|breaker|chiller|jam|ganjel|loaded|macet|trouble|error|reject|quality|qc|mould|mold|setup|electrical|hold|material|off line|line off|reset)/i.test(text);
}

function shouldCreateOffRow(line: string) {
  const text = normalizeText(autoCorrectHighConfidenceTypos(line).text);
  if (!/\boff\b/i.test(text)) return false;
  return /(stop|trip|breker|breaker|chiller|jam|ganjel|loaded|macet|trouble|error|reject|quality|qc|mould|mold|setup|electrical|hold|material|reset|line off)/i.test(text);
}

function removeTimingFromCause(line: string) {
  return stripWaMarkdown(line)
    .replace(/\(?\s*\d{1,2}[.:]\d{2}\s*[-–]\s*\d{1,2}[.:]\d{2}\s*(=\s*\d{1,4}\s*(menit|mnt|min)?)?\)?/ig, '')
    .replace(/\b\d{1,4}\s*(menit|mnt|min)\b/ig, '')
    .replace(/^[:=\-–\s]+/, '')
    .trim();
}

function mergeCodes(...codes: Array<string | undefined | null>) {
  return [...new Set(codes.flatMap((code) => (code || '').split(/\s*\|\s*/).map((item) => item.trim()).filter(Boolean)))].join(' | ');
}

function makeRow(context: ParserContext, line: string, timing: ReturnType<typeof parseProblemTiming>, sourceOrder = 0, overrides: Partial<ParsedWaDowntimeRow> = {}): ParsedWaDowntimeRow | null {
  if (!context.eventDate || !context.shiftCode || !context.machine) return null;
  const causeAuto = autoCorrectHighConfidenceTypos(overrides.root_cause || removeTimingFromCause(line) || stripWaMarkdown(line));
  const cause = clean(causeAuto.text);
  if (!cause) return null;
  const inferredCondition = inferConditionFromText(cause);
  const condition = overrides.condition || inferredCondition || (!isGenericDowntimeRootCause(cause) ? 'downtime' : 'unknown');
  const resolved = resolveDowntimeWaTiming({
    eventDate: context.eventDate,
    shiftCode: context.shiftCode,
    condition,
    startTime: overrides.start_time || timing?.start || null,
    endTime: overrides.end_time || timing?.end || null,
    durationMinutes: overrides.duration_minutes ?? timing?.duration ?? null,
  });
  const actionAuto = autoCorrectHighConfidenceTypos(clean(overrides.action_taken));
  const matchCode = context.machineMatchCode || `machine:${context.machineMatch}`;
  const warningCode = mergeCodes(
    overrides.warning_code,
    timing ? (timing.confidence === 'high' ? 'timing:explicit' : 'timing:duration_inferred') : 'timing:shift_window',
    causeAuto.corrections.length ? 'typo:root_cause' : '',
    actionAuto.corrections.length ? 'typo:action_taken' : '',
    condition && condition !== 'unknown' ? `condition:${condition}` : '',
  );
  const warningParts = [clean(overrides.warning || timing?.warning || (!timing ? 'Tidak ada jam/durasi eksplisit; memakai rentang shift.' : ''))];
  if (causeAuto.corrections.length) warningParts.push(`Auto-correct cause: ${causeAuto.corrections.slice(0, 3).map((item) => `${item.from}→${item.to}`).join(', ')}`);
  if (actionAuto.corrections.length) warningParts.push(`Auto-correct action: ${actionAuto.corrections.slice(0, 3).map((item) => `${item.from}→${item.to}`).join(', ')}`);
  return {
    event_date: context.eventDate,
    shift_code: context.shiftCode,
    area: context.area || inferArea(context.machine),
    machine: context.machine,
    machine_raw: context.machineRaw,
    machine_normalized: context.machineNormalized,
    machine_match: context.machineMatch,
    match_source: buildDowntimeWaMatchSource(context.machineMatch, context.machineMatchCode, context.machineMatchReason),
    line: context.machine,
    category: overrides.category || inferCategory(cause),
    start_time: resolved.startTime,
    end_time: resolved.endTime,
    duration_minutes: resolved.durationMinutes,
    status: overrides.status || (timing?.confidence === 'high' ? 'open' : 'monitoring'),
    pic: '',
    root_cause: cause,
    action_taken: actionAuto.text,
    estimated_loss_output: 0,
    linked_signal_type: '',
    source_line: stripWaMarkdown(line),
    confidence: overrides.confidence || timing?.confidence || 'low',
    source_order: sourceOrder,
    match_code: matchCode,
    match_reason: context.machineMatchReason || '',
    idempotency_key: buildDowntimeWaIdempotencyKey({
      event_date: context.eventDate,
      shift_code: context.shiftCode,
      area: context.area || inferArea(context.machine),
      machine: context.machine,
      machine_normalized: context.machineNormalized,
      line: context.machineRaw || context.machine,
      category: overrides.category || inferCategory(cause),
      start_time: resolved.startTime,
      end_time: resolved.endTime,
      root_cause: cause,
      action_taken: actionAuto.text,
      condition,
    }),
    warning: warningParts.filter(Boolean).join(' | '),
    warning_code: warningCode,
    condition,
  };
}

function makeStateRow(context: ParserContext, state: 'lancar' | 'off' | 'standby' | 'setup' | 'cleaning' | 'trial' | 'running', line: string, sourceOrder = 0): ParsedWaDowntimeRow | null {
  if (!context.eventDate || !context.shiftCode || !context.machine) return null;
  const shiftWindow = resolveShiftWindow(context.shiftCode);
  const resolved = resolveDowntimeWaTiming({
    eventDate: context.eventDate,
    shiftCode: context.shiftCode,
    condition: state,
    startTime: state === 'lancar' ? shiftWindow.start : shiftWindow.start,
    endTime: state === 'lancar' ? shiftWindow.start : shiftWindow.end,
    durationMinutes: state === 'lancar' ? 0 : 480,
  });
  return {
    event_date: context.eventDate,
    shift_code: context.shiftCode,
    area: context.area || inferArea(context.machine),
    machine: context.machine,
    machine_raw: context.machineRaw,
    machine_normalized: context.machineNormalized,
    machine_match: context.machineMatch,
    match_source: buildDowntimeWaMatchSource(context.machineMatch, context.machineMatchCode, context.machineMatchReason),
    line: context.machine,
    category: 'other',
    start_time: resolved.startTime,
    end_time: resolved.endTime,
    duration_minutes: resolved.durationMinutes,
    status: 'closed',
    pic: '',
    root_cause: state.toUpperCase(),
    action_taken: '',
    estimated_loss_output: 0,
    linked_signal_type: '',
    source_line: stripWaMarkdown(line),
    confidence: 'medium',
    source_order: sourceOrder,
    match_code: context.machineMatchCode || `machine:${context.machineMatch}`,
    match_reason: context.machineMatchReason || '',
    idempotency_key: buildDowntimeWaIdempotencyKey({
      event_date: context.eventDate,
      shift_code: context.shiftCode,
      area: context.area || inferArea(context.machine),
      machine: context.machine,
      machine_normalized: context.machineNormalized,
      line: context.machineRaw || context.machine,
      category: 'other',
      start_time: resolved.startTime,
      end_time: resolved.endTime,
      root_cause: state.toUpperCase(),
      action_taken: '',
      condition: state,
    }),
    warning: `State mesin ${state.toUpperCase()} terdeteksi.`,
    warning_code: `state:${state}`,
    condition: state,
  };
}

function parseWaReport(text: string, catalog: MachineCatalog) {
  const rows: ParsedWaDowntimeRow[] = [];
  const stateRows: ParsedWaDowntimeRow[] = [];
  const skipped: Array<{ line: string; reason: string }> = [];
  let sourceOrder = 0;
  const context: ParserContext = {
    eventDate: '',
    shiftCode: '',
    machine: '',
    machineRaw: '',
    machineNormalized: '',
    machineMatch: 'raw',
    machineMatchCode: 'machine:raw-fallback',
    machineMatchReason: '',
    area: '',
    lastEventIndex: -1,
    inProblem: false,
  };
  const lines = text.split(/\r?\n/).map((line) => stripWaMarkdown(line)).filter(Boolean);

  for (const line of lines) {
    const date = parseDateLine(line);
    if (date) {
      context.eventDate = date;
      context.inProblem = false;
      context.lastEventIndex = -1;
      context.machine = '';
      context.machineRaw = '';
      context.machineNormalized = '';
      context.machineMatch = 'raw';
      context.machineMatchCode = 'machine:raw-fallback';
      context.machineMatchReason = '';
      context.area = '';
      continue;
    }

    const shift = parseShiftLine(line);
    if (shift) {
      context.shiftCode = shift;
      context.inProblem = false;
      context.lastEventIndex = -1;
      context.machine = '';
      context.machineRaw = '';
      context.machineNormalized = '';
      context.machineMatch = 'raw';
      context.machineMatchCode = 'machine:raw-fallback';
      context.machineMatchReason = '';
      context.area = '';
      continue;
    }

    if (/^problem\b/i.test(normalizeText(line))) {
      context.inProblem = true;
      context.lastEventIndex = -1;
      continue;
    }

    if (looksLikeMachineLine(line)) {
      const resolved = resolveMachineLabel(line, catalog);
      context.machine = resolved.machine;
      context.machineRaw = resolved.machineRaw;
      context.machineNormalized = resolved.machineNormalized;
      context.machineMatch = resolved.machineMatch;
      context.machineMatchCode = resolved.matchCode;
      context.machineMatchReason = resolved.matchReason;
      context.area = resolved.area || inferArea(context.machine);
      context.inProblem = false;
      context.lastEventIndex = -1;
      const state = parseMachineState(line);
      if (state && context.eventDate && context.shiftCode) {
        const row = makeStateRow(context, state, line, sourceOrder);
        if (row) stateRows.push(row);
        sourceOrder += 1;
      }
      continue;
    }

    const state = parseMachineState(line);
    if (state && context.eventDate && context.shiftCode && context.machine) {
      const row = makeStateRow(context, state, line, sourceOrder);
      if (row) stateRows.push(row);
      sourceOrder += 1;
      continue;
    }

    if (!context.inProblem) continue;
    if (isNoProblem(line)) {
      if (context.machine && context.eventDate && context.shiftCode) {
        const row = makeStateRow(context, 'lancar', line, sourceOrder);
        if (row) stateRows.push(row);
        sourceOrder += 1;
      } else {
        skipped.push({ line, reason: 'Lancar / bukan downtime' });
      }
      continue;
    }

    const timing = parseProblemTiming(line, context);
    if (timing || (context.lastEventIndex < 0 && isLikelyProblemStarter(line))) {
      const row = makeRow(context, line, timing, sourceOrder);
      if (row) {
        rows.push(row);
        context.lastEventIndex = rows.length - 1;
      } else {
        skipped.push({ line, reason: 'Tanggal/shift/mesin belum lengkap' });
      }
      sourceOrder += 1;
      continue;
    }

    const action = stripWaMarkdown(line);
    if (action && context.lastEventIndex >= 0) {
      const current = rows[context.lastEventIndex];
      current.action_taken = clean([current.action_taken, action].filter(Boolean).join(' | '));
      current.source_line = clean([current.source_line, action].filter(Boolean).join(' | '));
    }
  }

  return { rows, stateRows, skipped, processedLines: lines.length };
}

function buildPreviewBlocks(rows: ParsedWaDowntimeRow[], machineOrderMap: MachineOrderMap): WaPreviewBlock[] {
  const map = new Map<string, WaPreviewBlock>();
  for (const row of rows) {
    const key = [row.event_date, row.shift_code, row.area, row.machine].join('|');
    if (!map.has(key)) {
      map.set(key, {
        event_date: row.event_date,
        shift_code: row.shift_code,
        area: row.area,
        machine: row.machine,
        row_count: 0,
        label: `${row.event_date} • ${row.shift_code} • ${row.machine}${row.area ? ` • ${row.area}` : ''}`,
        rows: [],
      });
    }
    const block = map.get(key)!;
    block.rows.push(row);
    block.row_count += 1;
  }
  return [...map.values()].sort((a, b) => {
    const dateDiff = a.event_date.localeCompare(b.event_date);
    if (dateDiff !== 0) return dateDiff;
    const shiftDiff = shiftSortRank(a.shift_code) - shiftSortRank(b.shift_code);
    if (shiftDiff !== 0) return shiftDiff;
    const machineDiff = machineSortRank(a.machine, machineOrderMap) - machineSortRank(b.machine, machineOrderMap);
    if (machineDiff !== 0) return machineDiff;
    return (a.rows[0]?.source_order || 0) - (b.rows[0]?.source_order || 0);
  });
}

function isGenericDowntimeRootCause(text: string) {
  const normalized = normalizeText(text);
  return /^(problem|issue|gangguan|trouble|macet|mesin mati|stop|off|standby|running|trial|setup|normal|lancar|unknown|tidak jelas|belum jelas|n\/a)$/i.test(normalized);
}

function shiftSortRank(shiftCode: string) {
  const normalized = shiftNumber(shiftCode);
  const rank = Number(normalized);
  return Number.isFinite(rank) && rank > 0 ? rank : 99;
}

function machineSortRank(machine: string, machineOrderMap: MachineOrderMap) {
  const key = machineKey(machine);
  return machineOrderMap.get(key) ?? 9999;
}

function compareDowntimeRows(a: ParsedWaDowntimeRow, b: ParsedWaDowntimeRow, machineOrderMap: MachineOrderMap) {
  const dateDiff = a.event_date.localeCompare(b.event_date);
  if (dateDiff !== 0) return dateDiff;
  const shiftDiff = shiftSortRank(a.shift_code) - shiftSortRank(b.shift_code);
  if (shiftDiff !== 0) return shiftDiff;
  const machineDiff = machineSortRank(a.machine, machineOrderMap) - machineSortRank(b.machine, machineOrderMap);
  if (machineDiff !== 0) return machineDiff;
  const timeDiff = a.start_time.localeCompare(b.start_time);
  if (timeDiff !== 0) return timeDiff;
  return (a.source_order || 0) - (b.source_order || 0);
}

function collapseStateCompanionDowntimeRows(rows: ParsedWaDowntimeRow[], stateRows: ParsedWaDowntimeRow[]) {
  const statefulKeys = new Set(
    stateRows
      .filter((row) => row.condition && row.condition !== 'downtime')
      .map((row) => [clean(row.event_date), clean(row.shift_code), machineKey(row.machine)].join('|')),
  );
  if (!statefulKeys.size) return rows;
  return rows.filter((row) => {
    const key = [clean(row.event_date), clean(row.shift_code), machineKey(row.machine)].join('|');
    if (!statefulKeys.has(key)) return true;
    if (row.condition && row.condition !== 'downtime') return true;
    if (!isGenericDowntimeRootCause(row.root_cause)) return true;
    if (clean(row.action_taken)) return true;
    return false;
  });
}

function dedupeStateRowsAgainstRows(rows: ParsedWaDowntimeRow[], stateRows: ParsedWaDowntimeRow[]) {
  const existingStateKeys = new Set(
    rows
      .filter((row) => row.condition && row.condition !== 'downtime')
      .map((row) => [clean(row.event_date), clean(row.shift_code), machineKey(row.machine), clean(row.condition)].join('|')),
  );
  if (!existingStateKeys.size) return stateRows;
  return stateRows.filter((row) => {
    const key = [clean(row.event_date), clean(row.shift_code), machineKey(row.machine), clean(row.condition)].join('|');
    return !existingStateKeys.has(key);
  });
}

function buildStructuredRows(rows: ParsedWaDowntimeRow[], stateRows: ParsedWaDowntimeRow[], machineOrderMap: MachineOrderMap): WaStructuredRow[] {
  return [...rows, ...stateRows].sort((a, b) => compareDowntimeRows(a, b, machineOrderMap)).map((row) => ({
    ...(() => {
      const fallbackWindow = resolveShiftWindow(row.shift_code);
      const isLancar = clean(row.condition).toLowerCase() === 'lancar';
      const startTime = isPlaceholderTime(row.start_time) ? fallbackWindow.start : clean(row.start_time);
      const endTime = isPlaceholderTime(row.end_time) ? fallbackWindow.end : clean(row.end_time);
      return {
        start: startTime,
        end: endTime,
        durasi_menit: isLancar ? 0 : (row.duration_minutes > 0 ? row.duration_minutes : minutesBetween(row.event_date, startTime, endTime)),
      };
    })(),
    tanggal: row.event_date,
    machine_master: row.machine,
    machine_raw: row.machine_raw || row.source_line,
    machine_normalized: row.machine_normalized || machineKey(row.machine),
    machine_match: row.machine_match || 'raw',
    match_source: row.match_source || row.match_code || 'raw:fallback',
    match_code: row.match_code || '',
    match_reason: row.match_reason || '',
    idempotency_key: row.idempotency_key || buildDowntimeWaIdempotencyKey({
      event_date: row.event_date,
      shift_code: row.shift_code,
      area: row.area,
      machine: row.machine,
      machine_normalized: row.machine_normalized,
      line: row.line || row.machine,
      category: row.category,
      start_time: row.start_time || resolveShiftWindow(row.shift_code).start,
      end_time: row.end_time || resolveShiftWindow(row.shift_code).end,
      root_cause: row.root_cause,
      action_taken: row.action_taken,
      condition: row.condition,
    }),
    reason: row.root_cause,
    operator: row.pic,
    note: row.action_taken || row.warning || row.source_line,
    source_line: row.source_line || row.machine_raw || row.machine || row.line || '',
    condition: row.condition || (row.root_cause.toLowerCase() === 'lancar' ? 'lancar' : row.root_cause.toLowerCase() === 'off' ? 'off' : 'downtime'),
    shift_code: row.shift_code,
    area: row.area,
    category: row.category,
    confidence: row.confidence,
    warning_code: row.warning_code || '',
  }));
}

function dedupeRows(rows: ParsedWaDowntimeRow[]) {
  const seen = new Set<string>();
  const unique: ParsedWaDowntimeRow[] = [];
  for (const row of rows) {
    const key = row.idempotency_key || [row.event_date, row.shift_code, row.area, row.machine, row.line, row.category, row.start_time, row.end_time, row.root_cause, row.action_taken].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  return unique;
}

type ExistingDowntimeRow = {
  id: number;
  event_date: string;
  shift_code: string;
  area: string;
  machine: string;
  line: string;
  category: string;
  start_time: string;
  end_time: string;
  root_cause: string;
  action_taken: string;
  duration_minutes: number;
  status: string;
  pic: string;
  estimated_loss_output: number;
  linked_signal_type: string;
};

function downtimeExactKey(row: Pick<ParsedWaDowntimeRow, 'event_date' | 'shift_code' | 'area' | 'machine' | 'line' | 'category' | 'start_time' | 'end_time'>) {
  return [
    clean(row.event_date),
    clean(row.shift_code),
    clean(row.area),
    clean(row.machine),
    clean(row.line),
    clean(row.category),
    clean(row.start_time),
    clean(row.end_time),
  ].join('|');
}

function downtimeCanonicalKey(row: Pick<ParsedWaDowntimeRow, 'event_date' | 'shift_code' | 'area' | 'machine' | 'line' | 'category' | 'start_time' | 'end_time'>) {
  return [
    clean(row.event_date),
    normalizeCode(row.shift_code),
    clean(row.area).toUpperCase(),
    machineKey(row.machine),
    machineKey(row.line || row.machine),
    clean(row.category).toLowerCase(),
    clean(row.start_time),
    clean(row.end_time),
  ].join('|');
}

function buildExistingDowntimeIndexes(existingRows: ExistingDowntimeRow[]) {
  const exactByKey = new Map<string, ExistingDowntimeRow>();
  const canonicalByKey = new Map<string, ExistingDowntimeRow>();
  for (const row of existingRows) {
    const exactKey = downtimeExactKey(row);
    if (!exactByKey.has(exactKey)) exactByKey.set(exactKey, row);
    const canonicalKey = downtimeCanonicalKey(row);
    if (!canonicalByKey.has(canonicalKey)) canonicalByKey.set(canonicalKey, row);
  }
  return { exactByKey, canonicalByKey };
}

function shouldUseAiFallback(parsed: { rows: ParsedWaDowntimeRow[]; skipped: Array<{ line: string; reason: string }> }) {
  if (!parsed.rows.length) return true;
  const rawFallbackCount = parsed.rows.filter((row) => row.machine_match === 'raw').length;
  const lowConfidenceCount = parsed.rows.filter((row) => row.confidence !== 'high').length;
  if (rawFallbackCount > 0 && lowConfidenceCount > 0) return true;
  if (rawFallbackCount > 2) return true;
  if (lowConfidenceCount > parsed.rows.length / 2) return true;
  if (parsed.skipped.length > parsed.rows.length) return true;
  return false;
}

function extractJsonObject(input: string) {
  const trimmed = input.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;
  const first = candidate.indexOf('{');
  if (first < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = first; i < candidate.length; i += 1) {
    const ch = candidate[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return candidate.slice(first, i + 1);
    }
  }
  return null;
}


function buildAiPrompt(text: string) {
  return [
    'Kamu parser laporan WhatsApp produksi/downtime pabrik.',
    'Ubah teks WA menjadi JSON strict tanpa markdown, tanpa komentar, tanpa code fence.',
    'Output schema:',
    '{"blocks":[{"event_date":"YYYY-MM-DD","shift_code":"Shift 1|2|3","area":"","machine":"","rows":[{"event_date":"YYYY-MM-DD","shift_code":"Shift 1|2|3","area":"","machine":"","machine_raw":"","machine_normalized":"","machine_match":"family|alias|raw","match_source":"","match_code":"","match_reason":"","line":"","category":"setup|machine-trouble|material|mould|electrical|qc-hold|waiting-order|cleaning|minor-stop|other","start_time":"HH:MM","end_time":"HH:MM","duration_minutes":0,"status":"open|monitoring|closed","pic":"","root_cause":"","action_taken":"","estimated_loss_output":0,"linked_signal_type":"","source_line":"","confidence":"high|medium|low","warning":"","warning_code":"","condition":"downtime|lancar|off|normal|standby|setup|cleaning|trial|running"}]}],"skipped":[{"line":"","reason":""}],"notes":["..."]}',
    'Aturan:',
    '- Kelompokkan per tanggal, shift, mesin/line, dan problem yang sama.',
    '- Jangan skip baris lancar/normal/aman/off; tetap buat row kondisi mesin.',
    '- Jika ada jam/range/durasi, isi start/end/duration seakurat mungkin.',
    '- Jika tanggal nempel seperti 18Mei atau typo ringan seperti 119Mei, infer tanggal paling masuk akal dari konteks.',
    '- Jika header mesin hanya status seperti Off/CP tanpa problem, jangan buat row downtime, tapi tetap boleh buat row kondisi bila jelas.',
    '- Usahakan machine pakai nama master/display_laporan yang sudah dinormalisasi, dan simpan teks asli di machine_raw serta source_line.',
    '- machine_raw harus mempertahankan label asli WA apa adanya sebelum normalisasi.',
    '- source_line harus berisi baris pemicu asli atau ringkasan paling dekat dengan teks WA.',
    '- Normalisasi harus membersihkan typo, menyusun kategori, dan memindahkan label mesin ke master yang paling tepat dari registry.',
    '- Semua row tetap harus menyimpan raw truth; jangan hilangkan machine_raw, source_line, atau teks asli yang penting untuk audit.',
    '- Kalau machine belum bisa dipastikan, set machine_match = raw dan jelaskan di match_reason.',
    '- Kalau machine sudah cocok ke master registry, gunakan machine_match family atau alias dan match_source yang menjelaskan asal mapping dengan jelas.',
    '- confidence high kalau ada jam/range jelas, medium kalau durasi jelas tapi jam kurang, low kalau inferensi lemah.',
    '- warning_code boleh dipakai untuk menandai state, typo, ambiguity, atau fallback.',
    '- Pilih kategori yang paling masuk akal berdasarkan root cause dan action, jangan biarkan kategori mentah jika bisa dinormalisasi.',
    '- root_cause / REASON harus natural, spesifik, dan mudah dipahami; hindari istilah kosong seperti Trouble, Mesin Mati, Macet, Problem, Issue, Gangguan, Stop, atau istilah generik lain yang tidak menjelaskan konteks.',
    '- reason sebaiknya menyebut komponen fisik atau titik proses yang terdampak secara jelas bila memang ada di teks sumber, misalnya sensor, conveyor, ejection, motor, heater, panel, valve, belt, jaw, feeder, chuck, atau sejenisnya.',
    '- action_taken / ACTION harus natural, konkret, dan operasional; jelaskan tindakan yang benar-benar dilakukan serta langkah pencegahan bila ada, tanpa memaksa format tag/tagging.',
    '- Jangan tulis action yang terlalu generik seperti "Diperbaiki oleh MTC" jika sumber memberi detail yang lebih spesifik.',
    '- Jika sumber WA belum mencantumkan detail pencegahan atau PIC, jangan mengarang; pertahankan sebagai info yang perlu follow-up, bukan dipaksa jadi format kaku.',
    '- Typos pada reason dan action harus diperbaiki agar maknanya lebih jelas, tetap konsisten, dan mendekati istilah operasional pabrik yang umum dipakai.',
    '- Kalau teks mengarah ke area PRINTING atau THERMOFORMING, pertahankan area itu dengan konsisten di setiap blok dan row; jangan campur area hanya karena ada istilah mesin yang mirip.',
    '- Untuk baris produksi, jangan ubah section/area PRINTING dan THERMOFORMING menjadi downtime kecuali memang ada problem downtime yang eksplisit.',
    '- Jika ada header area, jadikan itu petunjuk utama untuk parsing mesin, output, dan kategori; jangan biarkan AI menebak area dari kata umum bila header sudah jelas.',
    '- Jawab dengan JSON object tunggal saja.',
    '',
    'Teks WA:',
    text,
  ].join('\n');
}

function normalizeReasonText(input: string, sourceLine: string) {
  const raw = clean(input);
  const source = clean(sourceLine);
  const corrected = autoCorrectHighConfidenceTypos(raw);
  const normalized = clean(corrected.text || raw || source);
  if (!normalized) return source;
  const stripped = normalized
    .replace(/^(?:problem|issue|gangguan|trouble|macet|mesin mati|stop|off|standby|running|trial|setup)\s*[:\-–]?\s*/i, '')
    .replace(/^(?:root cause|reason|penyebab)\s*[:\-–]?\s*/i, '');
  const sourceStripped = clean(source)
    .replace(/\b(problem|issue|gangguan|trouble|macet|mesin mati|stop|off|standby|running|trial|setup)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!stripped) return sourceStripped || source || normalized;
  if (!sourceStripped) return stripped;
  const strippedScore = stripped.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  const sourceScore = sourceStripped.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  const genericRe = /^(?:problem|issue|gangguan|trouble|macet|mesin mati|stop|off|standby|running|trial|setup|normal|lancar|off|unknown|tidak jelas|belum jelas)$/i;
  if (genericRe.test(stripped) && sourceScore > strippedScore) return sourceStripped;
  if (strippedScore <= 2 && sourceScore > strippedScore) return sourceStripped;
  return stripped;
}

function normalizeActionText(input: string, sourceLine: string) {
  const raw = clean(input);
  const source = clean(sourceLine);
  const corrected = autoCorrectHighConfidenceTypos(raw);
  const base = clean(corrected.text || raw || source);
  if (!base) return '';
  const parts = base
    .split(/\s*(?:\||\n|;|•)\s*/)
    .map((part) => clean(part))
    .filter(Boolean);
  const normalizedParts = parts.map((part) => part.replace(/^(?:action|tindakan|solusi)\s*[:\-–]?\s*/i, '').trim()).filter(Boolean);
  const joined = normalizedParts.length ? normalizedParts.join('. ') : base;
  const sourceJoined = source
    .replace(/^(?:action|tindakan|solusi)\s*[:\-–]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!joined) return sourceJoined;
  if (!sourceJoined) return joined;
  const joinedScore = joined.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  const sourceScore = sourceJoined.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  if (joinedScore <= 2 && sourceScore > joinedScore) return sourceJoined;
  return joined;
}

function normalizeAiParsedRow(row: ParsedWaDowntimeRow, catalog: MachineCatalog): ParsedWaDowntimeRow {
  const sourceLine = clean(row.source_line || row.machine_raw || row.line || row.machine || '');
  const machineRaw = clean(row.machine_raw || row.line || row.machine || sourceLine);
  const aiMachine = clean(row.machine || '');
  const candidate = aiMachine || machineRaw || sourceLine;
  const exactCatalog = aiMachine ? catalogRowByLabel(catalog, aiMachine) : null;
  const resolved = exactCatalog
    ? {
        machine: clean(exactCatalog.display_laporan),
        machineRaw: machineRaw || aiMachine,
        machineNormalized: machineKey(exactCatalog.display_laporan),
        machineMatch: 'alias' as const,
        matchSource: 'ai:catalog-exact',
        matchCode: 'ai:catalog-exact',
        matchReason: `AI sudah mengembalikan master canonical ${clean(exactCatalog.display_laporan)}.`,
        area: clean(exactCatalog.area_kerja_line),
      }
    : candidate
      ? resolveMachineLabel(candidate, catalog)
      : null;
  const machine = clean(exactCatalog?.display_laporan || resolved?.machine || aiMachine || machineRaw || sourceLine);
  const normalizedMachine = clean(row.machine_normalized || machineKey(machine));
  const inferredState = inferConditionFromText(sourceLine || row.root_cause || row.action_taken || machineRaw);
  const fallbackCondition = clean(row.condition || inferredState || '');
  type AiCondition = NonNullable<ParsedWaDowntimeRow['condition']>;
  const allowedConditions = new Set<AiCondition>(['downtime', 'lancar', 'off', 'normal', 'standby', 'setup', 'cleaning', 'trial', 'running', 'changeover', 'unknown']);
  const condition: AiCondition = allowedConditions.has(fallbackCondition as AiCondition)
    ? fallbackCondition as AiCondition
    : 'unknown';
  const normalizedCategory = clean(row.category || inferCategory(row.root_cause || sourceLine || row.action_taken || machineRaw)) || 'other';
  const matchSource = exactCatalog ? 'ai:catalog-exact' : clean(resolved?.matchSource || 'ai:parsed');
  const matchCode = exactCatalog ? 'ai:catalog-exact' : clean(resolved?.matchCode || 'ai:parsed');
  const matchReason = exactCatalog
    ? `AI mengembalikan master canonical ${machine}.`
    : clean(resolved?.matchReason || 'AI parser output.');
  const machineMatch = row.machine_match || resolved?.machineMatch || 'raw';
  const line = clean(row.line || machineRaw || machine);
  const warningCodeCandidate = clean(row.warning_code || '');
  const stateWarningCode = condition && condition !== 'downtime' ? `state:${condition}` : '';
  const warningCode = stateWarningCode && (!warningCodeCandidate || /^ai:/i.test(warningCodeCandidate))
    ? stateWarningCode
    : warningCodeCandidate || (stateWarningCode || 'ai:parsed');
  const warning = clean(row.warning || (stateWarningCode ? `State mesin ${condition.toUpperCase()} terdeteksi.` : ''));

  return applyHighConfidenceTyposToRow({
    ...row,
    event_date: clean(row.event_date),
    shift_code: clean(row.shift_code),
    area: clean(row.area || resolved?.area || ''),
    machine,
    machine_raw: machineRaw || machine,
    machine_normalized: normalizedMachine,
    machine_match: machineMatch,
    match_source: matchSource,
    match_code: matchCode,
    match_reason: matchReason,
    line,
    category: normalizedCategory,
    source_line: sourceLine || line,
    condition,
    root_cause: clean(row.root_cause),
    action_taken: clean(row.action_taken),
    warning,
    warning_code: warningCode,
  });
}

function normalizeAiParsedRows(rows: ParsedWaDowntimeRow[], catalog: MachineCatalog) {
  return rows.map((row) => normalizeAiParsedRow(row, catalog));
}

function collapseAiStateCompanions(rows: ParsedWaDowntimeRow[]) {
  const statefulKeys = new Set(
    rows
      .filter((row) => row.condition && row.condition !== 'downtime')
      .map((row) => [clean(row.event_date), clean(row.shift_code), machineKey(row.machine)].join('|')),
  );
  if (!statefulKeys.size) return rows;
  return rows.filter((row) => {
    const key = [clean(row.event_date), clean(row.shift_code), machineKey(row.machine)].join('|');
    if (!statefulKeys.has(key)) return true;
    if (row.condition && row.condition !== 'downtime') return true;
    if (row.start_time && row.end_time && !(row.start_time === '00:00' && row.end_time === '00:00')) return true;
    const rootCause = normalizeText(row.root_cause);
    const action = normalizeText(row.action_taken);
    if (
      /^(problem|issue|gangguan|trouble|error|stop|setup|off|standby|running|trial|cleaning|general|unknown|unspecified|normal operation|normal|n\/a)$/i.test(rootCause)
      || /unsp?ecified|normal operation|belum spesifik|belum jelas|tidak spesifik|general/i.test(rootCause)
      || /AMBIGUOUS_CAUSE/i.test(row.warning_code || '')
      || /problem|lancar|normal operation/i.test(normalizeText(row.source_line || ''))
    ) {
      return false;
    }
    if (!rootCause && !action) return false;
    return true;
  });
}

function shouldUseRulesFallbackFromAi(parsed: { rows: ParsedWaDowntimeRow[]; skipped: Array<{ line: string; reason: string }> }) {
  if (!parsed.rows.length) return true;
  const rawFallbackCount = parsed.rows.filter((row) => row.machine_match === 'raw' || /raw/.test(row.match_code || '') || /raw/.test(row.match_source || '')).length;
  const lowConfidenceCount = parsed.rows.filter((row) => row.confidence !== 'high').length;
  const missingTimeCount = parsed.rows.filter((row) => !row.start_time || !row.end_time).length;
  if (rawFallbackCount > 0) return true;
  if (missingTimeCount > 0) return true;
  if (lowConfidenceCount > parsed.rows.length / 2) return true;
  if (parsed.skipped.length > parsed.rows.length) return true;
  return false;
}

async function parseWithOpenAi(text: string, catalog: MachineCatalog): Promise<{ rows: ParsedWaDowntimeRow[]; skipped: Array<{ line: string; reason: string }>; notes: string[]; model: string; }> {
  const runtimeEnv = loadAppSettings();
  const apiKey = runtimeEnv.OPENAI_API_KEY || process.env.WA_PARSER_AI_API_KEY || '';
  const model = runtimeEnv.WA_PARSER_AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const baseUrl = (runtimeEnv.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  if (!apiKey) throw new Error('OPENAI_API_KEY belum diset');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Kamu parser data yang sangat ketat dan harus output JSON valid.' },
          { role: 'user', content: buildAiPrompt(text) },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content || '';
    const jsonText = extractJsonObject(content);
    if (!jsonText) throw new Error('OpenAI tidak mengembalikan JSON valid');
    const parsed = JSON.parse(jsonText) as AiParseResult;
    const rows = collapseAiStateCompanions(normalizeAiParsedRows((parsed.blocks || []).flatMap((block) => (block.rows || []).map((row, index) => ({
      ...row,
      event_date: row.event_date || block.event_date,
      shift_code: row.shift_code || block.shift_code,
      area: row.area || block.area || '',
      machine: row.machine || block.machine || '',
      machine_raw: row.machine_raw || row.machine || row.line || block.machine || '',
      machine_normalized: row.machine_normalized || '',
      machine_match: row.machine_match || 'raw',
      match_source: row.match_source || 'ai:parsed',
      line: row.line || row.machine || block.machine || '',
      match_code: row.match_code || 'ai:parsed',
      match_reason: row.match_reason || 'AI parser output.',
      warning_code: row.warning_code || 'ai:parsed',
      source_line: row.source_line || row.line || row.machine || block.machine || '',
      source_order: typeof row.source_order === 'number' ? row.source_order : index,
    }))), catalog));
    return { rows, skipped: parsed.skipped || [], notes: parsed.notes || [], model };
  } finally {
    clearTimeout(timeout);
  }
}

async function parseWithGemini(text: string, catalog: MachineCatalog): Promise<{ rows: ParsedWaDowntimeRow[]; skipped: Array<{ line: string; reason: string }>; notes: string[]; model: string; }> {
  const runtimeEnv = loadAppSettings();
  const apiKey = runtimeEnv.GEMINI_API_KEY || '';
  const model = runtimeEnv.GEMINI_MODEL || 'gemini-2.5-flash';
  if (!apiKey) throw new Error('GEMINI_API_KEY belum diset');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        contents: [{ role: 'user', parts: [{ text: buildAiPrompt(text) }] }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const content = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
    const jsonText = (() => {
      const direct = content.trim();
      try {
        JSON.parse(direct);
        return direct;
      } catch {
        return extractJsonObject(content);
      }
    })();
    if (!jsonText) throw new Error('Gemini tidak mengembalikan JSON valid');
    const parsed = JSON.parse(jsonText) as AiParseResult;
    const rows = collapseAiStateCompanions(normalizeAiParsedRows((parsed.blocks || []).flatMap((block) => (block.rows || []).map((row, index) => ({
      ...row,
      event_date: row.event_date || block.event_date,
      shift_code: row.shift_code || block.shift_code,
      area: row.area || block.area || '',
      machine: row.machine || block.machine || '',
      machine_raw: row.machine_raw || row.machine || row.line || block.machine || '',
      machine_normalized: row.machine_normalized || '',
      machine_match: row.machine_match || 'raw',
      match_source: row.match_source || 'ai:parsed',
      line: row.line || row.machine || block.machine || '',
      match_code: row.match_code || 'ai:parsed',
      match_reason: row.match_reason || 'AI parser output.',
      warning_code: row.warning_code || 'ai:parsed',
      source_line: row.source_line || row.line || row.machine || block.machine || '',
      source_order: typeof row.source_order === 'number' ? row.source_order : index,
    }))), catalog));
    return { rows, skipped: parsed.skipped || [], notes: parsed.notes || [], model };
  } finally {
    clearTimeout(timeout);
  }
}

async function parseWithAiFallback(text: string, primary: AiProvider, catalog: MachineCatalog) {
  const chain: AiProvider[] = primary === 'gemini' ? ['gemini', 'openai'] : ['openai', 'gemini'];
  const notes: string[] = [];
  for (const provider of chain) {
    try {
      if (provider === 'gemini') {
        const result = await parseWithGemini(text, catalog);
        return { ...result, provider, notes: [...notes, ...result.notes] };
      }
      const result = await parseWithOpenAi(text, catalog);
      return { ...result, provider, notes: [...notes, ...result.notes] };
    } catch (error) {
      notes.push(`${provider.toUpperCase()} gagal: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
  throw new Error(notes.join(' | ') || 'AI parser gagal');
}

async function parseWaReportWithAi(text: string, primary: AiProvider, catalog: MachineCatalog): Promise<{ rows: ParsedWaDowntimeRow[]; skipped: Array<{ line: string; reason: string }>; notes: string[]; aiModel: string; aiUsed: boolean; aiProvider: string; }> {
  const result = await parseWithAiFallback(text, primary, catalog);
  return { rows: result.rows, skipped: result.skipped, notes: result.notes, aiModel: result.model, aiUsed: true, aiProvider: result.provider };
}


async function parseWaReportHybrid(text: string, parserMode: ParserMode, primaryProvider: AiProvider, catalog: MachineCatalog) {
  if (parserMode === 'rules') {
    const rulesParsed = parseWaReport(text, catalog);
    return {
      ...rulesParsed,
      rows: dedupeRows(rulesParsed.rows),
      stateRows: dedupeRows(rulesParsed.stateRows),
      notes: [] as string[],
      aiUsed: false,
      aiModel: '',
      aiProvider: '',
      parserMode,
    };
  }

  try {
    const aiParsed = await parseWaReportWithAi(text, primaryProvider, catalog);
    const aiShouldFallback = parserMode === 'hybrid' && shouldUseRulesFallbackFromAi(aiParsed);

    if (parserMode === 'ai' || !aiShouldFallback) {
      return {
        rows: dedupeRows(aiParsed.rows),
        stateRows: [],
        skipped: aiParsed.skipped,
        processedLines: text.split(/\r?\n/).filter((line) => stripWaMarkdown(line)).length,
        notes: aiParsed.notes,
        aiUsed: aiParsed.aiUsed,
        aiModel: aiParsed.aiModel,
        aiProvider: aiParsed.aiProvider,
        parserMode,
      };
    }
    const rulesParsed = parseWaReport(text, catalog);
    const mergedRows = dedupeRows([...aiParsed.rows, ...rulesParsed.rows]);
    const notes = [...new Set([...(aiParsed.notes || []), ...(rulesParsed.rows.length ? [`Hybrid: rules dipakai sebagai fallback setelah AI mendeteksi ${aiParsed.rows.filter((row) => row.machine_match === 'raw').length} raw row.`] : []), `Hybrid: AI dipakai sebagai parser utama.`])];
    return {
      rows: mergedRows,
      stateRows: dedupeRows(rulesParsed.stateRows),
      skipped: [...aiParsed.skipped, ...rulesParsed.skipped],
      processedLines: rulesParsed.processedLines || text.split(/\r?\n/).filter((line) => stripWaMarkdown(line)).length,
      notes,
      aiUsed: true,
      aiModel: aiParsed.aiModel,
      aiProvider: aiParsed.aiProvider,
      parserMode,
    };
  } catch (error) {
    const rulesParsed = parseWaReport(text, catalog);
    return {
      ...rulesParsed,
      rows: dedupeRows(rulesParsed.rows),
      stateRows: dedupeRows(rulesParsed.stateRows),
      skipped: rulesParsed.skipped,
      processedLines: rulesParsed.processedLines,
      notes: [error instanceof Error ? error.message : 'AI parser gagal, fallback ke rules.'],
      aiUsed: false,
      aiModel: '',
      aiProvider: '',
      parserMode,
    };
  }
}
function insertRows(rows: ParsedWaDowntimeRow[], mode: string) {
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
      const updateById = db.prepare(`
        UPDATE downtime_events
        SET
          event_date = ?,
          shift_code = ?,
          area = ?,
          machine = ?,
          line = ?,
          category = ?,
          start_time = ?,
          end_time = ?,
          duration_minutes = ?,
          status = ?,
          pic = ?,
          root_cause = ?,
          action_taken = ?,
          estimated_loss_output = ?,
          linked_signal_type = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `);
      let savedRows = 0;
      let insertedRows = 0;
      let updatedRows = 0;
      let existingRows = 0;
      let skippedRows = 0;
      const dates = [...new Set(rows.map((row) => row.event_date).filter(Boolean))];
      const existingRowsForDates = dates.length
        ? db.prepare(
          `SELECT id, event_date, shift_code, area, machine, line, category, start_time, end_time, root_cause, action_taken, duration_minutes, status, pic, estimated_loss_output, linked_signal_type
           FROM downtime_events
           WHERE event_date IN (${dates.map(() => '?').join(',')})`
        ).all(...dates) as ExistingDowntimeRow[]
        : [];
      const { exactByKey, canonicalByKey } = buildExistingDowntimeIndexes(existingRowsForDates);
      for (const row of dedupeRows(rows)) {
        if (!row.event_date || !row.machine || !row.category || !row.start_time || !row.end_time) {
          skippedRows += 1;
          continue;
        }
        const exactKey = downtimeExactKey(row);
        const canonicalKey = downtimeCanonicalKey(row);
        const existingExact = exactByKey.get(exactKey);
        const existingCanonical = exactByKey.get(exactKey) || canonicalByKey.get(canonicalKey);
        if (existingExact) {
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
          if (Number(result.changes ?? 0) > 0) {
            savedRows += 1;
            updatedRows += 1;
            existingRows += 1;
          } else {
            skippedRows += 1;
          }
          continue;
        }
        if (existingCanonical) {
          const result = updateById.run(
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
            existingCanonical.id,
          );
          if (Number(result.changes ?? 0) > 0) {
            savedRows += 1;
            updatedRows += 1;
            existingRows += 1;
            canonicalByKey.set(canonicalKey, existingCanonical);
          } else {
            skippedRows += 1;
          }
          continue;
        }
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
        if (Number(result.changes ?? 0) > 0) {
          savedRows += 1;
          insertedRows += 1;
          const insertedRow: ExistingDowntimeRow = {
            id: Number(result.lastInsertRowid ?? 0),
            event_date: row.event_date,
            shift_code: row.shift_code,
            area: row.area,
            machine: row.machine,
            line: row.line,
            category: row.category,
            start_time: row.start_time,
            end_time: row.end_time,
            root_cause: row.root_cause,
            action_taken: row.action_taken,
            duration_minutes: row.duration_minutes,
            status: row.status,
            pic: row.pic,
            estimated_loss_output: row.estimated_loss_output,
            linked_signal_type: row.linked_signal_type,
          };
          exactByKey.set(exactKey, insertedRow);
          canonicalByKey.set(canonicalKey, insertedRow);
        } else {
          skippedRows += 1;
        }
      }
      db.exec('COMMIT');
      const total = db.prepare('SELECT COUNT(*) AS count FROM downtime_events').get() as { count: number };
      return { savedRows, insertedRows, updatedRows, existingRows, skippedRows, total: total.count, existingRowsScanned: existingRowsForDates.length };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } finally {
    db.close();
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const text = value(body.text);
  const shouldImport = Boolean(body.import);
  const mode = value(body.mode || 'append').toLowerCase();
  const parserMode = value(body.parserMode || 'hybrid').toLowerCase() as ParserMode;
  const aiProvider = value(body.aiProvider || 'gemini').toLowerCase() as AiProvider;
  const catalog = loadMachineCatalog();
  const machineOrderMap = buildMachineOrderMap(catalog);
  const providedRows = Array.isArray(body.rows) ? body.rows as ParsedWaDowntimeRow[] : null;

  if (!text.trim() && !providedRows?.length) return NextResponse.json({ error: 'Teks laporan WA atau hasil parse wajib diisi.' }, { status: 400 });
  if (!['append', 'replace'].includes(mode)) return NextResponse.json({ error: 'Mode tidak valid. Pakai append atau replace.' }, { status: 400 });
  if (!['rules', 'ai', 'hybrid'].includes(parserMode)) return NextResponse.json({ error: 'Mode parser tidak valid. Pakai rules, ai, atau hybrid.' }, { status: 400 });
  if (!['gemini', 'openai'].includes(aiProvider)) return NextResponse.json({ error: 'Provider AI tidak valid. Pakai gemini atau openai.' }, { status: 400 });

  const parsed = providedRows
    ? { rows: providedRows, stateRows: [] as ParsedWaDowntimeRow[], skipped: [] as Array<{ line: string; reason: string }>, processedLines: Number(body.processedLines || 0), notes: Array.isArray(body.notes) ? body.notes as string[] : [], aiUsed: Boolean(body.aiUsed), aiModel: value(body.aiModel), aiProvider: value(body.aiProviderUsed || body.aiProvider) }
    : await parseWaReportHybrid(text, parserMode, aiProvider, catalog);
  const sortedRows = [...parsed.rows].map(applyShiftWindowFallback).sort((a, b) => compareDowntimeRows(a, b, machineOrderMap));
  const sortedStateRows = [...(parsed.stateRows || [])].map(applyShiftWindowFallback).sort((a, b) => compareDowntimeRows(a, b, machineOrderMap));
  const collapsedRows = collapseStateCompanionDowntimeRows(sortedRows, sortedStateRows);
  const dedupedStateRows = dedupeStateRowsAgainstRows(collapsedRows, sortedStateRows);
  const blocks = buildPreviewBlocks(collapsedRows, machineOrderMap);
  const structuredRows = Array.isArray(body.structuredRows) ? body.structuredRows as WaStructuredRow[] : buildStructuredRows(collapsedRows, dedupedStateRows, machineOrderMap);
  const productionRows = Array.isArray(body.productionRows) ? body.productionRows as ProductionSummaryRow[] : parseProductionReport(text, catalog);
  const parserMeta = {
    contractVersion: WA_PARSER_CONTRACT_VERSION,
    aliasRegistrySize: catalog.aliases.length,
    structuredRowCount: structuredRows.length,
    productionRowCount: productionRows.length,
    duplicateHintCount: 0,
  };
  const duplicateHints = (() => {
    const db = getDb();
    try {
      const dates = [...new Set(sortedRows.map((row) => row.event_date).filter(Boolean))];
      const existingRows = dates.length
        ? db.prepare(
          `SELECT event_date, shift_code, area, machine, line, start_time, end_time, root_cause
           FROM downtime_events
           WHERE event_date IN (${dates.map(() => '?').join(',')})`
        ).all(...dates) as Array<{ event_date: string; shift_code: string; area: string; machine: string; line: string; start_time: string; end_time: string; root_cause: string }>
        : [];
      return detectDuplicateHints(sortedRows, existingRows);
    } finally {
      db.close();
    }
  })();
  const existingRowsScanned = (() => {
    const db = getDb();
    try {
      const dates = [...new Set(sortedRows.map((row) => row.event_date).filter(Boolean))];
      if (!dates.length) return 0;
      const row = db.prepare(
        `SELECT COUNT(*) AS count
         FROM downtime_events
         WHERE event_date IN (${dates.map(() => '?').join(',')})`
      ).get(...dates) as { count: number } | undefined;
      return Number(row?.count || 0);
    } finally {
      db.close();
    }
  })();
  parserMeta.duplicateHintCount = duplicateHints.length;
  const quality = buildWaParseQualitySummary({
    rows: sortedRows,
    structuredRows,
    productionRows,
    duplicateHints,
    skippedCount: parsed.skipped.length,
    notes: parsed.notes || [],
    aiUsed: Boolean(parsed.aiUsed),
  });
  if (!shouldImport) {
    return NextResponse.json({
      data: {
        mode,
        parserMode,
        aiProvider,
        parserContractVersion: WA_PARSER_CONTRACT_VERSION,
        parserMeta,
        processedLines: parsed.processedLines,
        parsedRows: sortedRows.length,
        skippedRows: parsed.skipped.length,
        existingRowsScanned,
        rows: sortedRows,
        structuredRows,
        productionRows,
        blocks,
        duplicateHints,
        quality,
        skipped: parsed.skipped.slice(0, 20),
        aiUsed: parsed.aiUsed,
        aiModel: parsed.aiModel,
        aiProviderUsed: parsed.aiProvider,
        notes: parsed.notes,
        message: `Preview parser WA: ${sortedRows.length} event terdeteksi, ${parsed.skipped.length} line di-skip`,
      },
    });
  }

  const result = insertRows(sortedRows, mode);
  const message = result.insertedRows > 0
    ? `Import Copas WA ok (${result.insertedRows} baris baru, ${result.updatedRows} update, ${result.skippedRows + parsed.skipped.length} skip)`
    : `Import Copas WA: data sudah ada (${result.existingRows} baris match), tidak ada baris baru masuk`;
  if (shouldImport) {
    const db = getDb();
    try {
      db.prepare(`
        INSERT INTO downtime_import_runs (
          source, import_kind, mode, parser_mode, ai_provider, status, processed_rows, saved_rows, inserted_rows, updated_rows, existing_rows, skipped_rows, total_rows, message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'copas-wa',
        'wa',
        mode,
        parserMode,
        aiProvider,
        'success',
        result.savedRows || 0,
        result.savedRows || 0,
        result.insertedRows || 0,
        result.updatedRows || 0,
        result.existingRows || 0,
        result.skippedRows + parsed.skipped.length,
        result.total || 0,
        message,
      );
    } finally {
      db.close();
    }
  }
  return NextResponse.json({
    data: {
      source: 'copas-wa',
      mode,
      parserMode,
      aiProvider,
      parserContractVersion: WA_PARSER_CONTRACT_VERSION,
      parserMeta,
      processedLines: parsed.processedLines,
      processedRows: sortedRows.length,
      parsedRows: sortedRows.length,
      savedRows: result.savedRows,
      insertedRows: result.insertedRows,
      updatedRows: result.updatedRows,
      existingRows: result.existingRows,
      existingRowsScanned: result.existingRowsScanned,
      skippedRows: result.skippedRows + parsed.skipped.length,
      total: result.total,
      rows: sortedRows,
      structuredRows,
      productionRows,
      blocks,
      duplicateHints,
      quality,
      skipped: parsed.skipped.slice(0, 20),
      aiUsed: parsed.aiUsed,
      aiModel: parsed.aiModel,
      aiProviderUsed: parsed.aiProvider,
      notes: parsed.notes,
      message,
    },
  });
}
