import type { ChartPoint, OutputRow } from './types';

export const numberFmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
export const decimalFmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });

export function toNumber(value: string | number | undefined | null): number {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function cleanText(value: string | undefined | null, fallback = '(blank)'): string {
  const normalized = (value ?? '').replace(/\u00a0/g, ' ').trim();
  return normalized || fallback;
}

export function normalizeCode(value: string | undefined | null): string {
  return cleanText(value, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\b0+(\d+)\b/g, '$1');
}

export function normalizeMachineAliasText(value: string | undefined | null): string {
  const text = cleanText(value, '')
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/\b0+(\d+)\b/g, '$1')
    .replace(/\blong\s+sung\b/g, 'longsun')
    .replace(/\blongsung\b/g, 'longsun')
    .replace(/\bborch(e)?\b/g, 'borche')
    .replace(/\bpoly\s*print\b/g, 'polyprint')
    .replace(/\bpoly\b/g, 'polyprint')
    .replace(/\bhf\s*[- ]?\s*0*([1-4])\b/g, 'hengfeng $1')
    .replace(/\btf\s*[- ]?\s*0*([1-3])\b/g, 'illig $1')
    .replace(/\bhf\b/g, 'hengfeng')
    .replace(/\btf\b/g, 'illig')
    .replace(/\bv\s*-?\s*fine\b/g, 'vfine')
    .replace(/\bchum\s*power\b/g, 'chumpower')
    .replace(/\bcp\b/g, 'chumpower')
    .replace(/\bheng\s*feng\b/g, 'hengfeng')
    .replace(/\bill?ig\b/g, 'illig')
    .replace(/\bnew\s*do\b/g, 'newdo')
    .replace(/\bcaii?\b/g, 'cai')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

export type MachineMasterLike = {
  area_kerja_line?: string | null;
  kode_asli_sistem?: string | null;
  kode_asli_normalized?: string | null;
  display_laporan?: string | null;
  deskripsi_produk?: string | null;
};

const familyAliasSeeds = [
  ['longsun', ['longsun', 'long sung', 'long-sung']],
  ['borche', ['borche', 'borch', 'borche 1', 'borche 01', 'borche 2', 'borche 02']],
  ['vfine', ['v fine', 'v-fine', 'vfine', 'v fine']],
  ['chumpower', ['chum power', 'chumpower', 'cp']],
  ['hengfeng', ['hengfeng', 'heng feng', 'hf']],
  ['illig', ['illig', 'ill ig', 'tf']],
  ['polyprint', ['polyprint', 'poly print', 'poly-print', 'poly']],
  ['omso', ['omso']],
  ['newdo', ['newdo', 'new do']],
  ['cai', ['cai']],
] as const;

function extractFamilyNumber(text: string) {
  const match = text.match(/\b0*(\d{1,2})\b/);
  return match?.[1] || '';
}

function addFamilyNumberVariants(pack: Set<string>, canonical: string, short: string, maxNumber: number) {
  for (let i = 1; i <= maxNumber; i += 1) {
    const plain = String(i);
    const padded = plain.padStart(2, '0');
    for (const prefix of [canonical, short]) {
      for (const number of [plain, padded]) {
        pack.add(normalizeMachineAliasText(`${prefix} ${number}`));
        pack.add(normalizeMachineAliasText(`${prefix}-${number}`));
        pack.add(normalizeMachineAliasText(`${prefix}${number}`));
      }
    }
  }
}

export function buildMachineSynonymPack(row: MachineMasterLike): string[] {
  const base = [row.display_laporan, row.kode_asli_sistem, row.kode_asli_normalized, row.deskripsi_produk, row.area_kerja_line]
    .map((value) => normalizeMachineAliasText(value))
    .filter(Boolean);
  const pack = new Set<string>(base);

  for (const seed of base) {
    const family = familyAliasSeeds.find(([name]) => seed.includes(name));
    const number = extractFamilyNumber(seed);
    if (!family) continue;
    for (const variant of family[1]) pack.add(normalizeMachineAliasText(variant));
    if (number) {
      pack.add(normalizeMachineAliasText(`${family[0]} ${number}`));
      pack.add(normalizeMachineAliasText(`${family[0]} ${number.padStart(2, '0')}`));
      pack.add(normalizeMachineAliasText(`${family[0]}${number}`));
    }
  }

  addFamilyNumberVariants(pack, 'hengfeng', 'hf', 4);
  addFamilyNumberVariants(pack, 'illig', 'tf', 3);

  const display = normalizeMachineAliasText(row.display_laporan);
  if (display) {
    pack.add(display);
    pack.add(display.replace(/\s+/g, ''));
  }

  return [...pack].filter(Boolean);
}

export function uniqueOptions(rows: OutputRow[], key: keyof OutputRow): string[] {
  return Array.from(new Set(rows.map((row) => cleanText(row[key] as string, '')))).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

export function sumQuantity(rows: OutputRow[]): number {
  return rows.reduce((total, row) => total + toNumber(row.Quantity), 0);
}

export function groupByQuantity(rows: OutputRow[], key: keyof OutputRow, limit = 10): ChartPoint[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const name = cleanText(row[key] as string);
    map.set(name, (map.get(name) ?? 0) + toNumber(row.Quantity));
  }
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function outputByDate(rows: OutputRow[]): ChartPoint[] {
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.Posting_Date, (map.get(row.Posting_Date) ?? 0) + toNumber(row.Quantity));
  return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => a.name.localeCompare(b.name));
}

export function exportCsv<T extends Record<string, unknown>>(rows: T[], filename: string) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [columns.join(','), ...rows.map((row) => columns.map((column) => escape(row[column])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
