import { NextRequest, NextResponse } from 'next/server';
import { clean, getDb } from '@/lib/server/db';
import { loadAppSettings } from '@/lib/server/app-settings';
import { buildMachineSynonymPack, normalizeMachineAliasText } from '@/lib/dashboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ParsedWaDowntimeRow = {
  event_date: string;
  shift_code: string;
  area: string;
  machine: string;
  machine_raw?: string;
  machine_normalized?: string;
  machine_match?: 'family' | 'alias' | 'raw';
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
  confidence: 'high' | 'medium' | 'low';
  warning: string;
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
  reason: string;
};

type WaStructuredRow = {
  tanggal: string;
  machine_master: string;
  machine_raw: string;
  machine_normalized: string;
  machine_match: 'family' | 'alias' | 'raw';
  start: string;
  end: string;
  durasi_menit: number;
  reason: string;
  operator: string;
  note: string;
  condition: string;
  shift_code: string;
  area: string;
  category: string;
  confidence: string;
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

const shiftWindows: Record<string, { start: string; end: string }> = {
  '1': { start: '07:00', end: '15:00' },
  '2': { start: '15:00', end: '23:00' },
  '3': { start: '23:00', end: '07:00' },
};

function value(input: unknown) {
  return input === null || input === undefined ? '' : String(input);
}

function compactKey(input: string) {
  return normalizeText(input)
    .replace(/\b0+(\d+)\b/g, '$1')
    .replace(/[^a-z0-9]+/g, '');
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
  area: string;
};

type MachineCatalog = {
  rows: MachineCatalogRow[];
  aliases: Array<MachineAliasEntry>;
};

type MachineAliasEntry = {
  row: MachineCatalogRow;
  alias: string;
  aliasCompact: string;
  aliasTokens: string[];
};

function loadMachineCatalog(): MachineCatalog {
  const db = getDb();
  const rows = db.prepare(`
    SELECT area_kerja_line, kode_asli_sistem, kode_asli_normalized, display_laporan, deskripsi_produk
    FROM master_entity_target
  `).all() as MachineCatalogRow[];
  const aliases: MachineAliasEntry[] = [];
  for (const row of rows) {
    for (const alias of buildMachineSynonymPack(row)) {
      const cleaned = clean(alias);
      if (!cleaned) continue;
      aliases.push({
        row,
        alias: cleaned,
        aliasCompact: compactKey(normalizeMachineAliasText(cleaned)),
        aliasTokens: normalizeMachineAliasText(cleaned).split(' ').filter(Boolean),
      });
    }
  }
  return { rows, aliases };
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
    const internalKey = [row.event_date, row.shift_code, machineNorm, row.start_time, row.end_time, compactKey(row.root_cause)].join('|');
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

function scoreMachineAlias(raw: string, aliasEntry: MachineAliasEntry) {
  const rawCompact = compactKey(normalizeMachineAliasText(raw));
  const { alias, aliasCompact, aliasTokens } = aliasEntry;
  if (!aliasCompact) return 0;
  if (rawCompact === aliasCompact) return 5000 + aliasCompact.length;
  if (rawCompact.includes(aliasCompact) || aliasCompact.includes(rawCompact)) return 3000 + aliasCompact.length;
  const rawTokens = new Set(normalizeMachineAliasText(raw).split(' ').filter(Boolean));
  const overlap = aliasTokens.filter((token) => rawTokens.has(token)).length;
  const prefixMatch = aliasTokens[0] && rawTokens.has(aliasTokens[0]) ? 1 : 0;
  const family = familyBoost(raw, alias);
  return family + (overlap * 120) + (prefixMatch * 40) + Math.min(aliasTokens.length, 5) * 5;
}

function resolveMachineLabel(rawLine: string, catalog: MachineCatalog): MachineResolution {
  const raw = stripWaMarkdown(rawLine);
  const borcheFamily = normalizeMachineAliasText(raw).match(/\b(?:borch|borche)\s*0*([1-2])\b/);
  if (borcheFamily) {
    const familyName = `Borche ${borcheFamily[1]}`;
    const family = catalog.aliases
      .filter((entry) => normalizeText(entry.row.display_laporan) === normalizeText(familyName) || normalizeText(entry.alias) === normalizeText(familyName))
      .sort((a, b) => scoreMachineAlias(raw, b) - scoreMachineAlias(raw, a))[0]?.row;
    if (family) return { machine: clean(family.display_laporan), machineRaw: raw, machineNormalized: machineKey(family.display_laporan), machineMatch: 'family', area: clean(family.area_kerja_line) };
  }
  const directFamily = normalizeMachineAliasText(raw).match(/\b(?:hengfeng|hf)\s*0*([1-4])\b|\b(?:illig|tf)\s*0*([1-3])\b/);
  if (directFamily) {
    const hengfeng = directFamily[1];
    const illig = directFamily[2];
    const familyName = hengfeng ? `Hengfeng ${hengfeng}` : `Illig ${illig}`;
    const family = catalog.aliases
      .filter((entry) => normalizeText(entry.row.display_laporan) === normalizeText(familyName) || normalizeText(entry.alias) === normalizeText(familyName))
      .sort((a, b) => scoreMachineAlias(raw, b) - scoreMachineAlias(raw, a))[0]?.row;
    if (family) return { machine: clean(family.display_laporan), machineRaw: raw, machineNormalized: machineKey(family.display_laporan), machineMatch: 'family', area: clean(family.area_kerja_line) };
  }
  const inferred = inferMachineFamilyLabel(raw);
  if (inferred) {
    const family = catalog.aliases
      .filter((entry) => normalizeText(entry.row.display_laporan) === normalizeText(inferred) || normalizeText(entry.alias) === normalizeText(inferred))
      .sort((a, b) => scoreMachineAlias(raw, b) - scoreMachineAlias(raw, a))[0]?.row;
    if (family) return { machine: clean(family.display_laporan), machineRaw: raw, machineNormalized: machineKey(family.display_laporan), machineMatch: 'family', area: clean(family.area_kerja_line) };
  }

  let best: MachineCatalogRow | null = null;
  let bestScore = 0;
  for (const entry of catalog.aliases) {
    const score = scoreMachineAlias(raw, entry);
    if (score > bestScore) {
      best = entry.row;
      bestScore = score;
    }
  }

  if (best && bestScore > 0) {
    return { machine: clean(best.display_laporan), machineRaw: raw, machineNormalized: machineKey(best.display_laporan), machineMatch: 'alias', area: clean(best.area_kerja_line) };
  }

  return { machine: clean(raw), machineRaw: raw, machineNormalized: machineKey(raw), machineMatch: 'raw', area: inferArea(raw) };
}

function resolveProductionMachine(rawLine: string, section: 'PRINTING' | 'THERMOFORMING', catalog: MachineCatalog) {
  const raw = stripWaMarkdown(rawLine);
  const normalized = normalizeText(raw);

  if (section === 'PRINTING') {
    const omso = normalized.match(/\bomso\s*([12])\b|\bomso([12])\b/);
    if (omso) return { machine: `OMSO ${omso[1] || omso[2]}`, machineRaw: raw, machineNormalized: machineKey(`OMSO ${omso[1] || omso[2]}`), machineMatch: 'family' as const, area: 'PRINTING' as const };
    const poly = normalized.match(/\bpoly\s*print\s*([12])\b|\bpolyprint\s*([12])\b/);
    if (poly) return { machine: `Polyprint ${poly[1] || poly[2]}`, machineRaw: raw, machineNormalized: machineKey(`Polyprint ${poly[1] || poly[2]}`), machineMatch: 'family' as const, area: 'PRINTING' as const };
    const cai = normalized.match(/\bcai[- ]?([12])\b/);
    if (cai) return { machine: `CAI ${cai[1]}`, machineRaw: raw, machineNormalized: machineKey(`CAI ${cai[1]}`), machineMatch: 'family' as const, area: 'PRINTING' as const };
    const newdo = normalized.match(/\bnewdo[- ]?([12])\b/);
    if (newdo) return { machine: `Newdo ${newdo[1]}`, machineRaw: raw, machineNormalized: machineKey(`Newdo ${newdo[1]}`), machineMatch: 'family' as const, area: 'PRINTING' as const };
  }

  if (section === 'THERMOFORMING') {
    const hf = normalized.match(/\bhf\s*0?([1-4])\b/);
    if (hf) return { machine: `Hengfeng ${hf[1]}`, machineRaw: raw, machineNormalized: machineKey(`Hengfeng ${hf[1]}`), machineMatch: 'family' as const, area: 'THERMOFORMING' as const };
    const hengfeng = normalized.match(/\bhengfeng[- ]?([1-4])\b/);
    if (hengfeng) return { machine: `Hengfeng ${hengfeng[1]}`, machineRaw: raw, machineNormalized: machineKey(`Hengfeng ${hengfeng[1]}`), machineMatch: 'family' as const, area: 'THERMOFORMING' as const };
    const illig = normalized.match(/\billig[- ]?([1-3])\b/);
    if (illig) return { machine: `Illig ${illig[1]}`, machineRaw: raw, machineNormalized: machineKey(`Illig ${illig[1]}`), machineMatch: 'family' as const, area: 'THERMOFORMING' as const };
  }

  const resolved = resolveMachineLabel(raw, catalog);
  return { machine: resolved.machine, machineRaw: raw, machineNormalized: resolved.machineNormalized, machineMatch: resolved.machineMatch, area: section };
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
  const root = autoCorrectHighConfidenceTypos(row.root_cause);
  const action = autoCorrectHighConfidenceTypos(row.action_taken);
  const warningParts = [clean(row.warning)];
  if (root.corrections.length) warningParts.push(`Auto-correct cause: ${root.corrections.slice(0, 3).map((item) => `${item.from}→${item.to}`).join(', ')}`);
  if (action.corrections.length) warningParts.push(`Auto-correct action: ${action.corrections.slice(0, 3).map((item) => `${item.from}→${item.to}`).join(', ')}`);
  return {
    ...row,
    root_cause: root.text || row.root_cause,
    action_taken: action.text || row.action_taken,
    warning: warningParts.filter(Boolean).join(' | '),
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
  if (!eventDate || !startTime || !endTime) return 0;
  const start = new Date(`${eventDate}T${startTime}:00+07:00`);
  let end = new Date(`${eventDate}T${endTime}:00+07:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  if (end < start) end = new Date(end.getTime() + 86400000);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function addMinutes(time: string, minutes: number) {
  const [hour, minute] = time.split(':').map(Number);
  const total = ((hour || 0) * 60 + (minute || 0) + minutes) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
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
    const duration = range[3] ? Number(range[3]) : minutesBetween(context.eventDate, start, end);
    return { start, end, duration: duration || minutesBetween(context.eventDate, start, end), confidence: 'high' as const, warning: '' };
  }

  const durationMatch = text.match(/(\d{1,4})\s*(?:menit|mnt|min)\b/i);
  if (durationMatch) {
    const duration = Number(durationMatch[1]);
    const shiftWindow = shiftWindows[shiftNumber(context.shiftCode)] ?? shiftWindows['1'];
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
  if (/\b(longsun|borch|borche|v\s*-?\s*fine|cp)\b/i.test(normalized)) return true;
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

function makeRow(context: ParserContext, line: string, timing: ReturnType<typeof parseProblemTiming>, overrides: Partial<ParsedWaDowntimeRow> = {}): ParsedWaDowntimeRow | null {
  if (!context.eventDate || !context.shiftCode || !context.machine) return null;
  const shiftWindow = shiftWindows[shiftNumber(context.shiftCode)] ?? shiftWindows['1'];
  const start = overrides.start_time || timing?.start || shiftWindow.start;
  const end = overrides.end_time || timing?.end || shiftWindow.end;
  const duration = overrides.duration_minutes || timing?.duration || minutesBetween(context.eventDate, start, end);
  const causeAuto = autoCorrectHighConfidenceTypos(overrides.root_cause || removeTimingFromCause(line) || stripWaMarkdown(line));
  const cause = clean(causeAuto.text);
  if (!cause) return null;
  const condition = overrides.condition || inferConditionFromText(cause) || (timing?.confidence === 'high' ? 'downtime' : 'unknown');
  const actionAuto = autoCorrectHighConfidenceTypos(clean(overrides.action_taken));
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
    line: context.machine,
    category: overrides.category || inferCategory(cause),
    start_time: start,
    end_time: end,
    duration_minutes: duration,
    status: overrides.status || (timing?.confidence === 'high' ? 'open' : 'monitoring'),
    pic: '',
    root_cause: cause,
    action_taken: actionAuto.text,
    estimated_loss_output: 0,
    linked_signal_type: '',
    source_line: stripWaMarkdown(line),
    confidence: overrides.confidence || timing?.confidence || 'low',
    warning: warningParts.filter(Boolean).join(' | '),
    condition,
  };
}

function makeStateRow(context: ParserContext, state: 'lancar' | 'off' | 'standby' | 'setup' | 'cleaning' | 'trial' | 'running', line: string): ParsedWaDowntimeRow | null {
  if (!context.eventDate || !context.shiftCode || !context.machine) return null;
  const shiftWindow = shiftWindows[shiftNumber(context.shiftCode)] ?? shiftWindows['1'];
  return {
    event_date: context.eventDate,
    shift_code: context.shiftCode,
    area: context.area || inferArea(context.machine),
    machine: context.machine,
    machine_raw: context.machineRaw,
    machine_normalized: context.machineNormalized,
    machine_match: context.machineMatch,
    line: context.machine,
    category: 'other',
    start_time: shiftWindow.start,
    end_time: shiftWindow.end,
    duration_minutes: 0,
    status: 'closed',
    pic: '',
    root_cause: state.toUpperCase(),
    action_taken: '',
    estimated_loss_output: 0,
    linked_signal_type: '',
    source_line: stripWaMarkdown(line),
    confidence: 'medium',
    warning: `State mesin ${state.toUpperCase()} terdeteksi.`,
    condition: state,
  };
}

function parseWaReport(text: string, catalog: MachineCatalog) {
  const rows: ParsedWaDowntimeRow[] = [];
  const stateRows: ParsedWaDowntimeRow[] = [];
  const skipped: Array<{ line: string; reason: string }> = [];
  const context: ParserContext = { eventDate: '', shiftCode: '', machine: '', machineRaw: '', machineNormalized: '', machineMatch: 'raw', area: '', lastEventIndex: -1, inProblem: false };
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
      context.area = resolved.area || inferArea(context.machine);
      context.inProblem = false;
      context.lastEventIndex = -1;
      const state = parseMachineState(line);
      if (state && context.eventDate && context.shiftCode) {
        const row = makeStateRow(context, state, line);
        if (row) stateRows.push(row);
      }
      continue;
    }

    const state = parseMachineState(line);
    if (state && context.eventDate && context.shiftCode && context.machine) {
      const row = makeStateRow(context, state, line);
      if (row) stateRows.push(row);
      continue;
    }

    if (!context.inProblem) continue;
    if (isNoProblem(line)) {
      if (context.machine && context.eventDate && context.shiftCode) {
        const row = makeStateRow(context, 'lancar', line);
        if (row) stateRows.push(row);
      } else {
        skipped.push({ line, reason: 'Lancar / bukan downtime' });
      }
      continue;
    }

    const timing = parseProblemTiming(line, context);
    if (timing || (context.lastEventIndex < 0 && isLikelyProblemStarter(line))) {
      const row = makeRow(context, line, timing);
      if (row) {
        rows.push(row);
        context.lastEventIndex = rows.length - 1;
      } else {
        skipped.push({ line, reason: 'Tanggal/shift/mesin belum lengkap' });
      }
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

function buildPreviewBlocks(rows: ParsedWaDowntimeRow[]): WaPreviewBlock[] {
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
    const dateDiff = b.event_date.localeCompare(a.event_date);
    if (dateDiff !== 0) return dateDiff;
    const shiftDiff = b.shift_code.localeCompare(a.shift_code);
    if (shiftDiff !== 0) return shiftDiff;
    return a.machine.localeCompare(b.machine);
  });
}

function buildStructuredRows(rows: ParsedWaDowntimeRow[], stateRows: ParsedWaDowntimeRow[]): WaStructuredRow[] {
  return [...rows, ...stateRows].map((row) => ({
    tanggal: row.event_date,
    machine_master: row.machine,
    machine_raw: row.machine_raw || row.source_line,
    machine_normalized: row.machine_normalized || machineKey(row.machine),
    machine_match: row.machine_match || 'raw',
    start: row.start_time,
    end: row.end_time,
    durasi_menit: row.duration_minutes,
    reason: row.root_cause,
    operator: row.pic,
    note: row.action_taken || row.warning || row.source_line,
    condition: row.condition || (row.root_cause.toLowerCase() === 'lancar' ? 'lancar' : row.root_cause.toLowerCase() === 'off' ? 'off' : 'downtime'),
    shift_code: row.shift_code,
    area: row.area,
    category: row.category,
    confidence: row.confidence,
  }));
}

function dedupeRows(rows: ParsedWaDowntimeRow[]) {
  const seen = new Set<string>();
  const unique: ParsedWaDowntimeRow[] = [];
  for (const row of rows) {
    const key = [row.event_date, row.shift_code, row.area, row.machine, row.line, row.category, row.start_time, row.end_time, row.root_cause, row.action_taken].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  return unique;
}

function shouldUseAiFallback(parsed: { rows: ParsedWaDowntimeRow[]; skipped: Array<{ line: string; reason: string }> }) {
  if (!parsed.rows.length) return true;
  const lowConfidenceCount = parsed.rows.filter((row) => row.confidence !== 'high').length;
  if (lowConfidenceCount > 0) return true;
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
    '{"blocks":[{"event_date":"YYYY-MM-DD","shift_code":"Shift 1|2|3","area":"","machine":"","rows":[{"event_date":"YYYY-MM-DD","shift_code":"Shift 1|2|3","area":"","machine":"","line":"","category":"setup|machine-trouble|material|mould|electrical|qc-hold|waiting-order|cleaning|minor-stop|other","start_time":"HH:MM","end_time":"HH:MM","duration_minutes":0,"status":"open|monitoring|closed","pic":"","root_cause":"","action_taken":"","estimated_loss_output":0,"linked_signal_type":"","source_line":"","confidence":"high|medium|low","warning":"","condition":"downtime|lancar|off|normal"}]}],"skipped":[{"line":"","reason":""}],"notes":["..."]}',
    'Aturan:',
    '- Kelompokkan per tanggal, shift, mesin/line, dan problem yang sama.',
    '- Jangan skip baris lancar/normal/aman/off; tetap buat row kondisi mesin.',
    '- Jika ada jam/range/durasi, isi start/end/duration seakurat mungkin.',
    '- Jika tanggal nempel seperti 18Mei atau typo ringan seperti 119Mei, infer tanggal paling masuk akal dari konteks.',
    '- Jika header mesin hanya status seperti Off/CP tanpa problem, jangan buat row downtime, tapi tetap boleh buat row kondisi bila jelas.',
    '- Usahakan machine pakai nama master/display_laporan, dan simpan teks asli di source_line atau machine kalau perlu.',
    '- source_line harus berisi ringkasan teks asli baris pemicu.',
    '- confidence high kalau ada jam/range jelas, medium kalau durasi jelas tapi jam kurang, low kalau inferensi lemah.',
    '- Jawab dengan JSON object tunggal saja.',
    '',
    'Teks WA:',
    text,
  ].join('\n');
}

async function parseWithOpenAi(text: string): Promise<{ rows: ParsedWaDowntimeRow[]; skipped: Array<{ line: string; reason: string }>; notes: string[]; model: string; }> {
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
    const rows = (parsed.blocks || []).flatMap((block) => (block.rows || []).map((row) => ({
      ...row,
      event_date: row.event_date || block.event_date,
      shift_code: row.shift_code || block.shift_code,
      area: row.area || block.area || '',
      machine: row.machine || block.machine || '',
      line: row.line || row.machine || block.machine || '',
    }))).map(applyHighConfidenceTyposToRow);
    return { rows, skipped: parsed.skipped || [], notes: parsed.notes || [], model };
  } finally {
    clearTimeout(timeout);
  }
}

async function parseWithGemini(text: string): Promise<{ rows: ParsedWaDowntimeRow[]; skipped: Array<{ line: string; reason: string }>; notes: string[]; model: string; }> {
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
    const rows = (parsed.blocks || []).flatMap((block) => (block.rows || []).map((row) => ({
      ...row,
      event_date: row.event_date || block.event_date,
      shift_code: row.shift_code || block.shift_code,
      area: row.area || block.area || '',
      machine: row.machine || block.machine || '',
      line: row.line || row.machine || block.machine || '',
    }))).map(applyHighConfidenceTyposToRow);
    return { rows, skipped: parsed.skipped || [], notes: parsed.notes || [], model };
  } finally {
    clearTimeout(timeout);
  }
}

async function parseWithAiFallback(text: string, primary: AiProvider) {
  const chain: AiProvider[] = primary === 'gemini' ? ['gemini', 'openai'] : ['openai', 'gemini'];
  const notes: string[] = [];
  for (const provider of chain) {
    try {
      if (provider === 'gemini') {
        const result = await parseWithGemini(text);
        return { ...result, provider, notes: [...notes, ...result.notes] };
      }
      const result = await parseWithOpenAi(text);
      return { ...result, provider, notes: [...notes, ...result.notes] };
    } catch (error) {
      notes.push(`${provider.toUpperCase()} gagal: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
  throw new Error(notes.join(' | ') || 'AI parser gagal');
}

async function parseWaReportWithAi(text: string, primary: AiProvider): Promise<{ rows: ParsedWaDowntimeRow[]; skipped: Array<{ line: string; reason: string }>; notes: string[]; aiModel: string; aiUsed: boolean; aiProvider: string; }> {
  const result = await parseWithAiFallback(text, primary);
  return { rows: result.rows, skipped: result.skipped, notes: result.notes, aiModel: result.model, aiUsed: true, aiProvider: result.provider };
}


async function parseWaReportHybrid(text: string, parserMode: ParserMode, primaryProvider: AiProvider, catalog: MachineCatalog) {
  const rulesParsed = parseWaReport(text, catalog);
  if (parserMode === 'rules') {
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

  if (parserMode === 'ai') {
    try {
      const aiParsed = await parseWaReportWithAi(text, primaryProvider);
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
    } catch (error) {
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

  if (!shouldUseAiFallback(rulesParsed)) {
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
    const aiParsed = await parseWaReportWithAi(text, primaryProvider);
    const mergedRows = dedupeRows([...rulesParsed.rows, ...aiParsed.rows]);
    const notes = [...new Set([...(aiParsed.notes || []), `Hybrid: AI dipakai untuk blok ambigu (${rulesParsed.rows.length} row rules).`])];
    return {
      rows: mergedRows,
      stateRows: dedupeRows(rulesParsed.stateRows),
      skipped: [...rulesParsed.skipped, ...aiParsed.skipped],
      processedLines: rulesParsed.processedLines,
      notes,
      aiUsed: true,
      aiModel: aiParsed.aiModel,
      aiProvider: aiParsed.aiProvider,
      parserMode,
    };
  } catch (error) {
    return {
      ...rulesParsed,
      rows: dedupeRows(rulesParsed.rows),
      stateRows: dedupeRows(rulesParsed.stateRows),
      skipped: rulesParsed.skipped,
      processedLines: rulesParsed.processedLines,
      notes: [error instanceof Error ? error.message : 'AI parser gagal, hybrid fallback ke rules.'],
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
      let savedRows = 0;
      let insertedRows = 0;
      let updatedRows = 0;
      let existingRows = 0;
      let skippedRows = 0;
      const existingForKey = db.prepare(`
        SELECT 1 AS exists_flag
        FROM downtime_events
        WHERE event_date = ? AND shift_code = ? AND area = ? AND machine = ? AND line = ? AND category = ? AND start_time = ? AND end_time = ?
        LIMIT 1
      `);
      for (const row of rows) {
        if (!row.event_date || !row.machine || !row.category || !row.start_time || !row.end_time) {
          skippedRows += 1;
          continue;
        }
        const existedBefore = Boolean(existingForKey.get(row.event_date, row.shift_code, row.area, row.machine, row.line, row.category, row.start_time, row.end_time));
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
          if (existedBefore) updatedRows += 1;
          else insertedRows += 1;
        } else {
          skippedRows += 1;
        }
        if (existedBefore) existingRows += 1;
      }
      db.exec('COMMIT');
      const total = db.prepare('SELECT COUNT(*) AS count FROM downtime_events').get() as { count: number };
      return { savedRows, insertedRows, updatedRows, existingRows, skippedRows, total: total.count };
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
  const parserMode = value(body.parserMode || 'rules').toLowerCase() as ParserMode;
  const aiProvider = value(body.aiProvider || 'gemini').toLowerCase() as AiProvider;
  const catalog = loadMachineCatalog();
  const providedRows = Array.isArray(body.rows) ? body.rows as ParsedWaDowntimeRow[] : null;

  if (!text.trim() && !providedRows?.length) return NextResponse.json({ error: 'Teks laporan WA atau hasil parse wajib diisi.' }, { status: 400 });
  if (!['append', 'replace'].includes(mode)) return NextResponse.json({ error: 'Mode tidak valid. Pakai append atau replace.' }, { status: 400 });
  if (!['rules', 'ai', 'hybrid'].includes(parserMode)) return NextResponse.json({ error: 'Mode parser tidak valid. Pakai rules, ai, atau hybrid.' }, { status: 400 });
  if (!['gemini', 'openai'].includes(aiProvider)) return NextResponse.json({ error: 'Provider AI tidak valid. Pakai gemini atau openai.' }, { status: 400 });

  const parsed = providedRows
    ? { rows: providedRows, stateRows: [] as ParsedWaDowntimeRow[], skipped: [] as Array<{ line: string; reason: string }>, processedLines: Number(body.processedLines || 0), notes: Array.isArray(body.notes) ? body.notes as string[] : [], aiUsed: Boolean(body.aiUsed), aiModel: value(body.aiModel), aiProvider: value(body.aiProviderUsed || body.aiProvider) }
    : await parseWaReportHybrid(text, parserMode, aiProvider, catalog);
  const blocks = buildPreviewBlocks(parsed.rows);
  const structuredRows = Array.isArray(body.structuredRows) ? body.structuredRows as WaStructuredRow[] : buildStructuredRows(parsed.rows, parsed.stateRows || []);
  const productionRows = Array.isArray(body.productionRows) ? body.productionRows as ProductionSummaryRow[] : parseProductionReport(text, catalog);
  const duplicateHints = (() => {
    const db = getDb();
    try {
      const dates = [...new Set(parsed.rows.map((row) => row.event_date).filter(Boolean))];
      const existingRows = dates.length
        ? db.prepare(
          `SELECT event_date, shift_code, area, machine, line, start_time, end_time, root_cause
           FROM downtime_events
           WHERE event_date IN (${dates.map(() => '?').join(',')})`
        ).all(...dates) as Array<{ event_date: string; shift_code: string; area: string; machine: string; line: string; start_time: string; end_time: string; root_cause: string }>
        : [];
      return detectDuplicateHints(parsed.rows, existingRows);
    } finally {
      db.close();
    }
  })();
  if (!shouldImport) {
    return NextResponse.json({
      data: {
        mode,
        parserMode,
        aiProvider,
        processedLines: parsed.processedLines,
        parsedRows: parsed.rows.length,
        skippedRows: parsed.skipped.length,
        rows: parsed.rows,
        structuredRows,
        productionRows,
        blocks,
        duplicateHints,
        skipped: parsed.skipped.slice(0, 20),
        aiUsed: parsed.aiUsed,
        aiModel: parsed.aiModel,
        aiProviderUsed: parsed.aiProvider,
        notes: parsed.notes,
        message: `Preview parser WA: ${parsed.rows.length} event terdeteksi, ${parsed.skipped.length} line di-skip`,
      },
    });
  }

  const result = insertRows(parsed.rows, mode);
  const message = result.insertedRows > 0
    ? `Import Copas WA ok (${result.insertedRows} baris baru, ${result.updatedRows} update, ${result.skippedRows + parsed.skipped.length} skip)`
    : `Import Copas WA: data sudah ada (${result.existingRows} baris match), tidak ada baris baru masuk`;
  return NextResponse.json({
    data: {
      source: 'copas-wa',
      mode,
      parserMode,
      aiProvider,
      processedLines: parsed.processedLines,
      processedRows: parsed.rows.length,
      parsedRows: parsed.rows.length,
      savedRows: result.savedRows,
      insertedRows: result.insertedRows,
      updatedRows: result.updatedRows,
      existingRows: result.existingRows,
      skippedRows: result.skippedRows + parsed.skipped.length,
      total: result.total,
      rows: parsed.rows,
      structuredRows,
      productionRows,
      blocks,
      duplicateHints,
      skipped: parsed.skipped.slice(0, 20),
      aiUsed: parsed.aiUsed,
      aiModel: parsed.aiModel,
      aiProviderUsed: parsed.aiProvider,
      notes: parsed.notes,
      message,
    },
  });
}
