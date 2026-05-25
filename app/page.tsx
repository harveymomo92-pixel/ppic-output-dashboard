'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, CalendarDays, Clock3, Download, FileText, PackageSearch, Pencil, Plus, RotateCcw, Save, Settings2, Trash2, Upload, X } from 'lucide-react';
import { DashboardSidebar, type DashboardFilters } from '@/components/dashboard/dashboard-sidebar';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { buildMachineSynonymPack, cleanText, decimalFmt, exportCsv, normalizeCode, normalizeMachineAliasText, numberFmt, toNumber } from '@/lib/dashboard';
import { resolveDowntimeWaTiming as sharedResolveDowntimeWaTiming } from '@/lib/downtime-wa-timing';
import type { ChartPoint, MasterEntityTarget } from '@/lib/types';
import type { AiProviderKey, ApiKeyCheckResult, SettingsPanel as SettingsPanelType, SettingsData as SettingsDataType } from '@/components/dashboard/settings-section';

const SettingsSection = dynamic(() => import('@/components/dashboard/settings-section').then((mod) => mod.SettingsSection), { ssr: false });
const OverviewDashboardSection: any = dynamic(() => import('@/components/dashboard/overview-section').then((mod) => mod.OverviewSection), { ssr: false });

type ViewMode = 'overview' | 'compare-period' | 'master-entity' | 'data-detail' | 'downtime' | 'settings';
type SettingsPanel = SettingsPanelType;
type MasterEntityRow = MasterEntityTarget & { ui_id: string };
type TargetStatus = 'no-record' | 'under-target' | 'on-track' | 'above-target';
type RejectStatus = 'no-target' | 'within-target' | 'exceed-target';
type TrendRow = {
  name: string;
  date: string;
  dailyTarget: number;
  okQty: number;
  rejectKg: number;
  rejectPcsEq: number;
  totalQty: number;
  achievementPct: number;
  rejectPct: number;
};

type TargetPerformanceRow = MasterEntityRow & {
  output: number;
  workHours: number;
  rejectKg: number;
  rejectPcsEq: number;
  rejectRate: number;
  rejectTargetRate: number;
  rejectStatus: RejectStatus;
  targetAchievementRate: number;
  dailyTarget: number;
  activeDays: number;
  rangeDays: number;
  prorataTarget: number;
  achievement: number;
  prorataAchievement: number;
  status: TargetStatus;
};

type DetailRow = {
  type: 'OK' | 'REJECT';
  document_date: string;
  posting_date: string;
  machine_center_no: string;
  prod_line_no: string;
  prod_line_description: string;
  display_laporan: string;
  active_target: number | null;
  active_target_type: string;
  document_no: string;
  external_document_no: string;
  shift_code: string;
  work_hours: number | null;
  transaction_prorata_target: number;
  achievement_pct: number;
  reject_pct: number;
  operator_name: string;
  item_no: string;
  description: string;
  item_category_code: string;
  quantity: number;
  uom: string;
  gross_weight: number;
  reject_kg: number;
  reject_pcs_eq: number;
  input_count: number;
  document_count: number;
  reject_summary: string;
  reject_details: Array<{
    document_no: string;
    item_no: string;
    item: string;
    quantity: number;
    uom: string;
    gross_weight: number;
    operator_name: string;
    shift_code: string;
  }>;
  operator_summary: string;
  operator_details: Array<{
    operator_name: string;
    shift_code: string;
    document_no: string;
    quantity: number;
  }>;
  document_summary: string;
  document_details: Array<{
    document_no: string;
    quantity: number;
    reject_kg: number;
    type: string;
  }>;
};

type DashboardData = {
  now: { label: string; progress: number };
  kpis: {
    totalOkQty: number;
    rejectKg: number;
    rejectPcsEq: number;
    rejectRate: number;
    documents: number;
    machines: number;
    items: number;
    masterEntities: number;
    activeDays: number;
  };
  trend: TrendRow[];
  byMachine: ChartPoint[];
  byCategory: ChartPoint[];
  byItem: ChartPoint[];
  rejectRateByLine: Array<ChartPoint & { okQty: number; rejectPcsEq: number }>;
  targetPerformance: TargetPerformanceRow[];
  detailRows: DetailRow[];
  rowCounts: { all: number; ok: number; reject: number; total: number };
  dateRange: { min: string; max: string };
  rangeDays: number;
  syncStatus: {
    source: string;
    sourceKind: 'odata-live' | 'csv-cache';
    status: string;
    startedAt: string;
    finishedAt: string | null;
    rowCount: number;
    message: string;
  } | null;
  options: { areas: string[]; machines: string[]; lines: string[]; categories: string[] };
};

type DetailTableFilters = {
  search: string;
  machine: string;
};

type TargetTableFilters = {
  search: string;
  area: string;
  status: '' | TargetStatus;
};

type TrendLocalFilters = {
  area: string;
  machine: string;
};

type FilterOption = {
  value: string;
  label: string;
};

type TargetMachineSummaryRow = {
  ui_id: string;
  area_kerja_line: string;
  display_laporan: string;
  productCount: number;
  productDetails: Array<{
    name: string;
    targetType: string;
    target: number;
    output: number;
    rejectTargetRate: number;
    achievementTargetRate: number;
  }>;
  output: number;
  workHours: number;
  rejectKg: number;
  rejectPcsEq: number;
  rejectRate: number;
  rejectTargetRate: number;
  rejectTargetLabel: string;
  rejectStatus: RejectStatus;
  targetAchievementRate: number;
  dailyTarget: number;
  rangeDays: number;
  prorataTarget: number;
  achievement: number;
  prorataAchievement: number;
  status: TargetStatus;
  sortOrder: number;
};

type AppSettingsResponse = {
  ok: boolean;
  settings: SettingsDataType['settings'];
  syncHistory: SettingsDataType['syncHistory'];
};

const emptyDashboard: DashboardData = {
  now: { label: '--:--', progress: 0 },
  kpis: { totalOkQty: 0, rejectKg: 0, rejectPcsEq: 0, rejectRate: 0, documents: 0, machines: 0, items: 0, masterEntities: 0, activeDays: 0 },
  trend: [],
  byMachine: [],
  byCategory: [],
  byItem: [],
  rejectRateByLine: [],
  targetPerformance: [],
  detailRows: [],
  rowCounts: { all: 0, ok: 0, reject: 0, total: 0 },
  dateRange: { min: '', max: '' },
  rangeDays: 0,
  syncStatus: null,
  options: { areas: [], machines: [], lines: [], categories: [] },
};

type MasterEntityForm = {
  area_kerja_line: string;
  kode_asli_sistem: string;
  display_laporan: string;
  deskripsi_produk: string;
  active_target: string;
  active_target_type: string;
  target_achievement_rate: string;
  target_reject_rate: string;
};

type CompareSummary = {
  previousRange: { dateFrom: string; dateTo: string };
  kpis: DashboardData['kpis'];
  targetPerformance: TargetPerformanceRow[];
};

type CompareMachineRow = {
  name: string;
  area: string;
  current: { output: number; achievementPct: number; rejectPcsEq: number; rejectRatePct: number };
  previous: { output: number; achievementPct: number; rejectPcsEq: number; rejectRatePct: number };
};

type CompareAreaPage = {
  area: string;
  current: { output: number; achievementPct: number; rejectPcsEq: number; rejectRatePct: number };
  previous: { output: number; achievementPct: number; rejectPcsEq: number; rejectRatePct: number };
  machines: CompareMachineRow[];
};

type DowntimeSignalType = 'no-runtime' | 'speed-loss' | 'quality-loss' | 'minor-stop';

type DowntimeSignalRow = {
  ui_id: string;
  area: string;
  machine: string;
  output: number;
  prorataTarget: number;
  workHours: number;
  rejectRatePct: number;
  rejectPcsEq: number;
  estimatedLossQty: number;
  estimatedDowntimeHours: number;
  signalType: DowntimeSignalType;
  status: TargetStatus;
  priorityScore: number;
  note: string;
};

type DowntimeEventStatus = 'open' | 'monitoring' | 'closed';
type DowntimeEventCategory = 'setup' | 'machine-trouble' | 'material' | 'mould' | 'electrical' | 'qc-hold' | 'waiting-order' | 'cleaning' | 'minor-stop' | 'other';

type DowntimeEventRow = {
  id: string;
  ui_id: string;
  event_date: string;
  shift_code: string;
  area: string;
  machine: string;
  line: string;
  category: DowntimeEventCategory;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: DowntimeEventStatus;
  pic: string;
  root_cause: string;
  action_taken: string;
  estimated_loss_output: number;
  linked_signal_type: string;
  created_at: string;
  updated_at: string;
};

type DowntimeWaParsedRow = {
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
  category: DowntimeEventCategory;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: DowntimeEventStatus;
  pic: string;
  root_cause: string;
  action_taken: string;
  estimated_loss_output: number;
  linked_signal_type: string;
  source_line: string;
  confidence: 'high' | 'medium' | 'low';
  warning: string;
  warning_code?: string;
  condition?: 'downtime' | 'lancar' | 'off' | 'normal' | 'standby' | 'setup' | 'cleaning' | 'trial' | 'running' | 'changeover' | 'unknown';
};

type DowntimeWaParseResult = {
  mode: string;
  parserMode?: string;
  aiProvider?: string;
  processedLines: number;
  processedRows?: number;
  parsedRows: number;
  savedRows?: number;
  skippedRows: number;
  total?: number;
  aiUsed?: boolean;
  aiModel?: string;
  aiProviderUsed?: string;
  notes?: string[];
  rows: DowntimeWaParsedRow[];
  structuredRows?: Array<{
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
    source_line?: string;
    condition: string;
    shift_code: string;
    area: string;
    category: string;
    confidence: string;
    warning_code: string;
  }>;
  productionRows?: Array<{
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
    condition: string;
    note: string;
    source_line: string;
    confidence: string;
  }>;
  blocks?: Array<{
    event_date: string;
    shift_code: string;
    area: string;
    machine: string;
    row_count: number;
    label: string;
    rows: DowntimeWaParsedRow[];
  }>;
  duplicateHints?: Array<{
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
  }>;
  quality?: {
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
  existingRowsScanned?: number;
  parserContractVersion?: string;
  parserMeta?: {
    contractVersion: string;
    aliasRegistrySize: number;
    structuredRowCount: number;
    productionRowCount: number;
    duplicateHintCount: number;
  };
  skipped: Array<{ line: string; reason: string }>;
  message: string;
};

type DowntimeEventForm = {
  event_date: string;
  shift_code: string;
  area: string;
  machine: string;
  line: string;
  category: DowntimeEventCategory;
  start_time: string;
  end_time: string;
  duration_minutes: string;
  status: DowntimeEventStatus;
  pic: string;
  root_cause: string;
  action_taken: string;
  estimated_loss_output: string;
  linked_signal_type: string;
};

type DowntimeEventDraft = {
  ui_id: string;
  editingId: string | null;
  form: DowntimeEventForm;
};

type DowntimeEventFilters = {
  category: '' | DowntimeEventCategory;
  shift: string;
  status: '' | DowntimeEventStatus;
};

type DowntimePanel = 'workflow' | 'import' | 'input' | 'followup' | 'table' | 'analysis';

const emptyFilters: DashboardFilters = { month: '', dateFrom: '', dateTo: '', area: '', machine: '', line: '', category: '', outputType: '', search: '' };
const emptyMasterForm: MasterEntityForm = {
  area_kerja_line: '',
  kode_asli_sistem: '',
  display_laporan: '',
  deskripsi_produk: '',
  active_target: '',
  active_target_type: 'target_botol_preform',
  target_achievement_rate: '',
  target_reject_rate: '',
};
const detailTablePageSize = 20;
const emptyDetailTableFilters: DetailTableFilters = { search: '', machine: '' };
const emptyTargetTableFilters: TargetTableFilters = { search: '', area: '', status: '' };
const emptyTrendLocalFilters: TrendLocalFilters = { area: '', machine: '' };
const emptyDowntimeEventFilters: DowntimeEventFilters = { category: '', shift: '', status: '' };
const emptyDowntimeEventForm: DowntimeEventForm = {
  event_date: '',
  shift_code: 'Shift 1',
  area: '',
  machine: '',
  line: '',
  category: 'machine-trouble',
  start_time: '',
  end_time: '',
  duration_minutes: '',
  status: 'open',
  pic: '',
  root_cause: '',
  action_taken: '',
  estimated_loss_output: '',
  linked_signal_type: '',
};
const downtimeCategories: Array<{ value: DowntimeEventCategory; label: string }> = [
  { value: 'setup', label: 'Setup / changeover' },
  { value: 'machine-trouble', label: 'Gangguan mesin' },
  { value: 'material', label: 'Material' },
  { value: 'mould', label: 'Mould / tooling' },
  { value: 'electrical', label: 'Listrik / utility' },
  { value: 'qc-hold', label: 'Tahan QC' },
  { value: 'waiting-order', label: 'Menunggu order produksi' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'minor-stop', label: 'Minor stop' },
  { value: 'other', label: 'Lainnya' },
];
const downtimeShiftChoices: Array<{ value: string; label: string }> = [
  { value: 'Shift 1', label: 'Shift 1 : 07:00-15:00' },
  { value: 'Shift 2', label: 'Shift 2 : 15:00-23:00' },
  { value: 'Shift 3', label: 'Shift 3 : 23:00-07:00' },
];
const downtimeStatuses: Array<{ value: DowntimeEventStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'monitoring', label: 'Monitoring' },
  { value: 'closed', label: 'Closed' },
];
const savedStateStorageKey = 'ppic-output-dashboard:filters:v1';

type SavedFilterState = {
  detailTableFilters: DetailTableFilters;
  targetTableFilters: TargetTableFilters;
  trendLocalFilters: TrendLocalFilters;
};

type DetailReturnState = {
  view: ViewMode;
  detailTableFilters: DetailTableFilters;
  detailTablePage: number;
};

const emptySavedFilterState: SavedFilterState = {
  detailTableFilters: emptyDetailTableFilters,
  targetTableFilters: emptyTargetTableFilters,
  trendLocalFilters: emptyTrendLocalFilters,
};

function getJakartaToday() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

function getJakartaNowTime() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

function getDefaultDowntimeShiftCode() {
  const jakartaHour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    hour12: false,
  }).format(new Date()));
  if (jakartaHour >= 7 && jakartaHour < 15) return 'Shift 1';
  if (jakartaHour >= 15 && jakartaHour < 23) return 'Shift 2';
  return 'Shift 3';
}

function getLastDayOfMonth(month: string) {
  const [year, mon] = month.split('-').map(Number);
  return new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10);
}

function clampDate(date: string, min: string, max: string) {
  if (min && date < min) return min;
  if (max && date > max) return max;
  return date;
}

function getMonthRange(month: string, min: string, max: string) {
  if (!month) return { dateFrom: min, dateTo: max };
  const today = getJakartaToday();
  const monthStart = `${month}-01`;
  const monthEnd = month === today.slice(0, 7) ? today : getLastDayOfMonth(month);
  let dateFrom = clampDate(monthStart, min, max);
  let dateTo = clampDate(monthEnd, min, max);
  if (dateFrom > dateTo) {
    if (month < min.slice(0, 7)) return { dateFrom: min, dateTo: min };
    if (month > max.slice(0, 7)) return { dateFrom: max, dateTo: max };
  }
  return { dateFrom, dateTo };
}

function readSavedFilterState(): SavedFilterState {
  if (typeof window === 'undefined') return emptySavedFilterState;
  try {
    const raw = window.localStorage.getItem(savedStateStorageKey);
    if (!raw) return emptySavedFilterState;
    const parsed = JSON.parse(raw) as Partial<SavedFilterState>;
    return {
      detailTableFilters: { ...emptyDetailTableFilters, ...(parsed.detailTableFilters ?? {}) },
      targetTableFilters: { ...emptyTargetTableFilters, ...(parsed.targetTableFilters ?? {}) },
      trendLocalFilters: { ...emptyTrendLocalFilters, ...(parsed.trendLocalFilters ?? {}) },
    };
  } catch {
    return emptySavedFilterState;
  }
}

function writeSavedFilterState(state: SavedFilterState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(savedStateStorageKey, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

function getDefaultMonthFilters(dateRange: { min: string; max: string }): DashboardFilters {
  const today = getJakartaToday();
  const month = today.slice(0, 7);
  return { ...emptyFilters, month, ...getMonthRange(month, dateRange.min, dateRange.max) };
}

function shiftRangeBack(dateFrom: string, dateTo: string) {
  if (!dateFrom || !dateTo) return null;
  const start = new Date(`${dateFrom}T00:00:00Z`);
  const end = new Date(`${dateTo}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const prevEnd = new Date(start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - (days - 1));
  return { dateFrom: prevStart.toISOString().slice(0, 10), dateTo: prevEnd.toISOString().slice(0, 10) };
}

function compareDeltaText(current: number, previous: number) {
  const delta = current - previous;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${decimalFmt.format(delta)}`;
}

function compareDeltaClass(current: number, previous: number) {
  const delta = current - previous;
  if (delta > 0) return 'is-up';
  if (delta < 0) return 'is-down';
  return 'is-flat';
}

function downtimeSignalLabel(type: DowntimeSignalType) {
  if (type === 'no-runtime') return 'No Runtime';
  if (type === 'speed-loss') return 'Speed Loss';
  if (type === 'quality-loss') return 'Quality Loss';
  return 'Minor Stop';
}

function downtimeSignalColor(type: DowntimeSignalType) {
  if (type === 'no-runtime') return '#C26B5B';
  if (type === 'speed-loss') return '#B48A4A';
  if (type === 'quality-loss') return '#7A6EBD';
  return '#8C877D';
}

function downtimeCategoryLabel(category: string) {
  return downtimeCategories.find((item) => item.value === category)?.label ?? (category || '-');
}

function downtimeStatusLabel(status: string) {
  return downtimeStatuses.find((item) => item.value === status)?.label ?? (status || '-');
}

function minutesBetween(eventDate: string, startTime: string, endTime: string) {
  if (!eventDate || !startTime || !endTime) return 0;
  const start = new Date(`${eventDate}T${startTime}:00+07:00`);
  let end = new Date(`${eventDate}T${endTime}:00+07:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  if (end < start) end = new Date(end.getTime() + 86400000);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function formFromDowntimeEvent(row: DowntimeEventRow): DowntimeEventForm {
  return {
    event_date: row.event_date,
    shift_code: row.shift_code,
    area: row.area,
    machine: row.machine,
    line: row.line,
    category: row.category,
    start_time: row.start_time,
    end_time: row.end_time,
    duration_minutes: row.duration_minutes ? String(row.duration_minutes) : '',
    status: row.status,
    pic: row.pic,
    root_cause: row.root_cause,
    action_taken: row.action_taken,
    estimated_loss_output: row.estimated_loss_output ? String(row.estimated_loss_output) : '',
    linked_signal_type: row.linked_signal_type,
  };
}

function createDowntimeEventDraft(form: Partial<DowntimeEventForm> = {}, editingId: string | null = null): DowntimeEventDraft {
  const nowTime = getJakartaNowTime();
  const defaultShiftCode = getDefaultDowntimeShiftCode();
  return {
    ui_id: `downtime-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    editingId,
    form: {
      ...emptyDowntimeEventForm,
      start_time: nowTime,
      end_time: nowTime,
      ...form,
      shift_code: form.shift_code || defaultShiftCode,
    },
  };
}

function draftFromDowntimeEvent(row: DowntimeEventRow): DowntimeEventDraft {
  return {
    ui_id: `downtime-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    editingId: row.id,
    form: formFromDowntimeEvent(row),
  };
}

type SearchableOption = {
  value: string;
  label: string;
};

type SelectFieldProps = {
  label: string;
  value: string;
  options: SearchableOption[];
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  allowEmpty?: boolean;
};

function SelectField({
  label,
  value,
  options,
  onChange,
  className = '',
  placeholder,
  allowEmpty = false,
}: SelectFieldProps) {
  const inputId = `downtime-select-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <label className={`downtime-field downtime-select-field ${className}`}>
      <span>{label}</span>
      <select
        id={inputId}
        className="detail-table-select downtime-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {allowEmpty ? <option value="">{placeholder || `Pilih ${label.toLowerCase()}`}</option> : null}
        {options.map((option) => (
          <option key={option.value || option.label} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function aggregateCompareRows(rows: TargetPerformanceRow[]) {
  const map = new Map<string, {
    area: string;
    name: string;
    output: number;
    prorataTarget: number;
    rejectPcsEq: number;
  }>();
  for (const row of rows) {
    const area = row.area_kerja_line || '-';
    const name = row.display_laporan || row.kode_asli_sistem || '-';
    const key = `${normalizeCode(area)}|${normalizeCode(name)}`;
    const current = map.get(key) ?? { area, name, output: 0, prorataTarget: 0, rejectPcsEq: 0 };
    current.output += Number(row.output || 0);
    current.prorataTarget += Number(row.prorataTarget || 0);
    current.rejectPcsEq += Number(row.rejectPcsEq || 0);
    map.set(key, current);
  }
  return Array.from(map.values()).map((row) => {
    const achievementPct = row.prorataTarget ? (row.output / row.prorataTarget) * 100 : 0;
    const rejectRatePct = row.output + row.rejectPcsEq ? (row.rejectPcsEq / (row.output + row.rejectPcsEq)) * 100 : 0;
    return { ...row, achievementPct, rejectRatePct };
  });
}

function aggregateByArea(rows: ReturnType<typeof aggregateCompareRows>) {
  const map = new Map<string, CompareAreaPage>();
  for (const row of rows) {
    const area = row.area || '-';
    const current = map.get(area) ?? {
      area,
      current: { output: 0, achievementPct: 0, rejectPcsEq: 0, rejectRatePct: 0 },
      previous: { output: 0, achievementPct: 0, rejectPcsEq: 0, rejectRatePct: 0 },
      machines: [],
    };
    map.set(area, current);
  }
  return map;
}

function KpiCard({ icon, label, value, hint, className }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string; className?: string }) {
  return (
    <div className={`card kpi${className ? ` ${className}` : ''}`}>
      <div className="label">{icon}{label}</div>
      <div className="value">{value}</div>
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="card chart-card">
      <div className="chart-head">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function ChartFrame({ children, variant = 'default', height }: { children: React.ReactNode; variant?: 'default' | 'tall' | 'compact'; height?: number }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div className={`chart-frame ${variant === 'tall' ? 'is-tall' : variant === 'compact' ? 'is-compact' : ''}`.trim()} style={height ? { height, minHeight: height } : undefined}>
      {ready ? children : <div className="chart-frame-placeholder" />}
    </div>
  );
}

function useDebouncedValue<T>(value: T, delay = 250) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

function formatPercent(value: number) {
  return `${decimalFmt.format(value)}%`;
}

function formatCompactNumber(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${decimalFmt.format(value / 1_000_000)} jt`;
  if (abs >= 1_000) return `${decimalFmt.format(value / 1_000)} rb`;
  return numberFmt.format(value);
}

function BarValueLabel(props: any) {
  const { x = 0, y = 0, width = 0, height = 0, value } = props;
  if (!Number(value)) return null;
  return (
    <text x={Number(x) + Number(width) + 6} y={Number(y) + Number(height) / 2 + 4} fill="var(--muted)" fontSize={11} textAnchor="start">
      {formatCompactNumber(Number(value))}
    </text>
  );
}

function PercentBarLabel(props: any) {
  const { x = 0, y = 0, width = 0, height = 0, value } = props;
  if (!Number(value)) return null;
  return (
    <text x={Number(x) + Number(width) + 6} y={Number(y) + Number(height) / 2 + 4} fill="var(--muted)" fontSize={11} textAnchor="start">
      {formatPercent(Number(value))}
    </text>
  );
}

function makeSparsePercentLabel(total: number, color: string) {
  const step = total > 12 ? Math.ceil(total / 6) : total > 7 ? 2 : 1;
  return function SparsePercentLabel(props: any) {
    const { x = 0, y = 0, value, index = 0 } = props;
    if (!Number(value)) return null;
    if (index !== total - 1 && index % step !== 0) return null;
    return (
      <text x={Number(x)} y={Number(y) - 8} fill={color} fontSize={11} fontWeight={700} textAnchor="middle">
        {formatPercent(Number(value))}
      </text>
    );
  };
}

function smartTrim(value: string, maxChars = 24) {
  const text = String(value ?? '').trim();
  if (!text) return '-';
  return text.length > maxChars ? `${text.slice(0, Math.max(1, maxChars - 3))}...` : text;
}

function SmartText({ value, maxChars = 24, className = '' }: { value: string; maxChars?: number; className?: string }) {
  const text = String(value ?? '').trim();
  const display = smartTrim(text, maxChars);
  return (
    <span className={`smart-trim ${className}`.trim()} title={text || '-'}>
      {display}
    </span>
  );
}

function truncateLabel(value: string, max = 18) {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, Math.max(1, max - 1))}…` : value;
}

function renderYAxisTick(maxChars: number) {
  return function YAxisTick({ x, y, payload }: any) {
    const value = String(payload?.value ?? '');
    return (
      <g transform={`translate(${x ?? 0},${y ?? 0})`}>
        <title>{value}</title>
        <text x={0} y={0} dy={4} textAnchor="end" fill="currentColor" fontSize={12}>
          {truncateLabel(value, maxChars)}
        </text>
      </g>
    );
  };
}

function renderXAxisTick(maxChars: number) {
  return function XAxisTick({ x, y, payload }: any) {
    const value = String(payload?.value ?? '');
    return (
      <g transform={`translate(${x ?? 0},${y ?? 0})`}>
        <title>{value}</title>
        <text x={0} y={0} dy={12} textAnchor="middle" fill="currentColor" fontSize={12}>
          {truncateLabel(value, maxChars)}
        </text>
      </g>
    );
  };
}

function ChartTooltip({ active, payload, label, formatter, labelFormatter }: any) {
  if (!active || !payload?.length) return null;
  const title = labelFormatter ? labelFormatter(label) : String(label ?? '');
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{title}</div>
      <div className="chart-tooltip-body">
        {payload.map((entry: any, index: number) => (
          <div className="chart-tooltip-row" key={`${entry.name ?? 'value'}-${index}`}>
            <span className="chart-tooltip-key">
              <span className="chart-tooltip-dot" style={{ backgroundColor: entry.color ?? '#8C877D' }} />
              {entry.name ?? 'Value'}
            </span>
            <span className="chart-tooltip-value">{formatter(Number(entry.value ?? 0), entry.name)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TargetPriorityTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{row.name}</div>
      <div className="chart-tooltip-body">
        <div className="chart-tooltip-row"><span className="chart-tooltip-key">Progress vs Prorata</span><span className="chart-tooltip-value">{formatPercent(row.prorataPct)}</span></div>
        <div className="chart-tooltip-row"><span className="chart-tooltip-key">Achievement Harian</span><span className="chart-tooltip-value">{formatPercent(row.achievementPct)}</span></div>
        <div className="chart-tooltip-row"><span className="chart-tooltip-key">Reject</span><span className="chart-tooltip-value">{formatPercent(row.rejectPct)}</span></div>
        <div className="chart-tooltip-row"><span className="chart-tooltip-key">Output OK</span><span className="chart-tooltip-value">{numberFmt.format(row.output)}</span></div>
        <div className="chart-tooltip-row"><span className="chart-tooltip-key">Status</span><span className="chart-tooltip-value">{formatOutputStatusLabel(row.status)}</span></div>
      </div>
    </div>
  );
}

function HoverSummaryCell({
  value,
  title,
  items,
  emptyLabel = '-',
  align = 'left',
  className = '',
  triggerClassName = '',
  popoverClassName = '',
}: {
  value: React.ReactNode;
  title: string;
  items: React.ReactNode[];
  emptyLabel?: string;
  align?: 'left' | 'right';
  className?: string;
  triggerClassName?: string;
  popoverClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const hasItems = items.length > 0;

  return (
    <div
      className={`reject-cell ${className} ${open ? 'is-open' : ''} ${align === 'right' ? 'is-right' : ''}`.trim()}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        className={`reject-chip ${triggerClassName} ${hasItems ? '' : 'is-empty'}`.trim()}
        type="button"
        onClick={() => setOpen((value) => !value)}
        title={items.length ? String(title) : emptyLabel}
      >
        {value}
      </button>
      {open && hasItems ? (
        <div className={`reject-popover ${popoverClassName}`.trim()}>
          <div className="reject-popover-head">{title}</div>
          <div className="reject-popover-body">
            {items.map((item, index) => (
              <div key={`${title}-${index}`} className="reject-popover-row">
                {item}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function detailLinesFromDocuments(rows: DetailRow['document_details']) {
  return rows.map((doc) => (
    <>
      <div className="reject-popover-item">{doc.document_no}</div>
      <div className="reject-popover-meta">
        Qty {doc.quantity.toLocaleString('en-US')} · Reject {doc.reject_kg.toLocaleString('en-US')} kg · {doc.type}
      </div>
    </>
  ));
}

function detailLinesFromOperators(rows: DetailRow['operator_details']) {
  return rows.map((op) => (
    <>
      <div className="reject-popover-item">{op.operator_name}</div>
      <div className="reject-popover-meta">
        {op.shift_code} · Qty {op.quantity.toLocaleString('en-US')} · {op.document_no}
      </div>
    </>
  ));
}

function achievementCalculationLines(row: DetailRow) {
  const target = row.transaction_prorata_target || 0;
  const output = row.quantity || 0;
  const pct = target ? (output / target) * 100 : 0;
  return [(
    <>
      <div className="reject-popover-item">Rumus % Ach</div>
      <div className="reject-popover-meta">Output OK ÷ Target Prorata Transaksi × 100</div>
      <div className="reject-popover-meta">{numberFmt.format(output)} ÷ {target ? numberFmt.format(target) : '-'} × 100 = {target ? `${decimalFmt.format(pct)}%` : '-'}</div>
      <div className="reject-popover-meta">Target: {row.active_target ? numberFmt.format(row.active_target) : '-'} / 24 jam · Jam kerja: {row.work_hours ? decimalFmt.format(row.work_hours) : '-'}</div>
      <div className="reject-popover-meta">Tipe target: {formatTargetTypeLabel(row.active_target_type)}</div>
    </>
  )];
}

function rejectCalculationLines(row: DetailRow) {
  const output = row.quantity || 0;
  const rejectPcsEq = row.reject_pcs_eq || 0;
  const total = output + rejectPcsEq;
  const pct = total ? (rejectPcsEq / total) * 100 : 0;
  return [(
    <>
      <div className="reject-popover-item">Rumus % Reject</div>
      <div className="reject-popover-meta">Reject PCS Eq ÷ (Output OK + Reject PCS Eq) × 100</div>
      <div className="reject-popover-meta">{numberFmt.format(rejectPcsEq)} ÷ ({numberFmt.format(output)} + {numberFmt.format(rejectPcsEq)}) × 100 = {total ? `${decimalFmt.format(pct)}%` : '-'}</div>
      <div className="reject-popover-meta">Reject kg: {row.reject_kg ? decimalFmt.format(row.reject_kg) : '-'} · Gross weight: {row.gross_weight ? decimalFmt.format(row.gross_weight) : '-'}</div>
    </>
  )];
}

function targetAchievementLines(row: TargetMachineSummaryRow) {
  const dailyTargetTotal = row.dailyTarget * (row.rangeDays || 1);
  return [(
    <>
      <div className="reject-popover-item">Rumus Achievement Harian</div>
      <div className="reject-popover-meta">Output OK ÷ (Target harian × jumlah hari filter) × 100</div>
      <div className="reject-popover-meta">{numberFmt.format(row.output)} ÷ {dailyTargetTotal ? numberFmt.format(dailyTargetTotal) : '-'} × 100 = {dailyTargetTotal ? `${decimalFmt.format(row.achievement * 100)}%` : '-'}</div>
      <div className="reject-popover-meta">Target harian gabungan: {row.dailyTarget ? numberFmt.format(row.dailyTarget) : '-'} · Range: {row.rangeDays || '-'} hari</div>
      <div className="reject-popover-meta">Target achievement area: {formatPercent(row.targetAchievementRate * 100)}</div>
    </>
  )];
}

function targetProrataLines(row: TargetMachineSummaryRow) {
  return [(
    <>
      <div className="reject-popover-item">Rumus Progress vs Prorata</div>
      <div className="reject-popover-meta">Output OK ÷ Target Prorata Jam Kerja × 100</div>
      <div className="reject-popover-meta">{numberFmt.format(row.output)} ÷ {row.prorataTarget ? numberFmt.format(row.prorataTarget) : '-'} × 100 = {row.prorataTarget ? `${decimalFmt.format(row.prorataAchievement * 100)}%` : '-'}</div>
      <div className="reject-popover-meta">Jam kerja transaksi: {row.workHours ? decimalFmt.format(row.workHours) : '-'} jam</div>
      <div className="reject-popover-meta">Status On Track jika ≥ {formatPercent(row.targetAchievementRate * 100)}</div>
    </>
  )];
}

function targetRejectLines(row: TargetMachineSummaryRow) {
  const total = row.output + row.rejectPcsEq;
  return [(
    <>
      <div className="reject-popover-item">Rumus Reject % Mesin</div>
      <div className="reject-popover-meta">Reject PCS Eq ÷ (Output OK + Reject PCS Eq) × 100</div>
      <div className="reject-popover-meta">{numberFmt.format(row.rejectPcsEq)} ÷ ({numberFmt.format(row.output)} + {numberFmt.format(row.rejectPcsEq)}) × 100 = {total ? `${decimalFmt.format(row.rejectRate * 100)}%` : '-'}</div>
      <div className="reject-popover-meta">Target reject: {row.rejectTargetLabel}</div>
    </>
  )];
}

function MetricPill({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="metric-pill">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <em>{hint}</em> : null}
    </div>
  );
}

function TableFilterInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="local-filter-control local-filter-search">
      <span className="local-filter-label">Cari</span>
      <input
        className="detail-table-input"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function TableFilterSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: FilterOption[] }) {
  const label = (options[0]?.label ?? 'Filter').replace(/^Semua\s+/i, '') || 'Filter';
  return (
    <div className="local-filter-control local-filter-select">
      <span className="local-filter-label">{label}</span>
      <select className="detail-table-select" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value || option.label} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}

function DataTableToolbar({
  left,
  totalCount,
  hasActiveFilters,
  onReset,
  compactMobile = false,
}: {
  left: React.ReactNode;
  totalCount: number;
  hasActiveFilters: boolean;
  onReset: () => void;
  compactMobile?: boolean;
}) {
  return (
    <div className={`detail-table-toolbar${compactMobile ? ' is-compact-mobile' : ''}`}>
      <div className="detail-table-toolbar-group">{left}</div>
      <div className="detail-table-toolbar-group detail-table-toolbar-meta">
        <span className="local-filter-count">{numberFmt.format(totalCount)} data</span>
        {hasActiveFilters ? (
          <button className="btn secondary table-mini-btn local-filter-reset" type="button" onClick={onReset}>Reset filter</button>
        ) : null}
      </div>
    </div>
  );
}

function DataTablePagination({
  page,
  totalPages,
  visibleCount,
  totalCount,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  visibleCount: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="detail-table-pagination">
      <div className="detail-table-pagination-meta">
        Halaman {page} / {totalPages} · Menampilkan {numberFmt.format(visibleCount)} dari {numberFmt.format(totalCount)} data
      </div>
      <div className="detail-table-pagination-actions">
        <button className="btn secondary table-mini-btn" type="button" onClick={() => onPageChange(1)} disabled={page <= 1}>« Awal</button>
        <button className="btn secondary table-mini-btn" type="button" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>‹ Prev</button>
        <button className="btn secondary table-mini-btn" type="button" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>Next ›</button>
        <button className="btn secondary table-mini-btn" type="button" onClick={() => onPageChange(totalPages)} disabled={page >= totalPages}>Akhir »</button>
      </div>
    </div>
  );
}

function formatOutputStatusLabel(status: TargetStatus) {
  if (status === 'no-record') return 'No Record';
  return status === 'above-target' ? 'Above Target' : status === 'on-track' ? 'On Track' : 'Under Target';
}

function formatRejectStatusLabel(status: RejectStatus) {
  return status === 'within-target' ? 'Within Target' : status === 'exceed-target' ? 'Exceed Target' : 'No Target';
}

function getTargetAlertClass(row: TargetMachineSummaryRow) {
  if (row.status === 'no-record') return 'is-alert is-no-record';
  if (row.status === 'under-target') return 'is-alert is-under-target';
  if (row.rejectStatus === 'exceed-target') return 'is-alert is-reject';
  return '';
}

function formatTargetTypeLabel(type: string) {
  const labels: Record<string, string> = {
    target_botol_preform: 'Botol & Preform',
    target_thermoforming: 'Thermoforming',
    target_thermoforming_gw_gt_12: 'Thermo GW > 12 gr',
    target_printing_non_oz: 'Printing cup non oz',
    target_printing_oz_lt_20: 'Printing cup oz <20 oz',
    target_printing_22_oz: 'Printing cup 22 oz',
  };
  return labels[type] ?? type;
}

function getRejectStatusBadgeClass(status: RejectStatus) {
  return status === 'within-target' ? 'above-target' : status === 'exceed-target' ? 'under-target' : 'on-track';
}

function getTargetBarColor(status: TargetStatus) {
  if (status === 'no-record') return '#B8B2A7';
  if (status === 'above-target') return '#5E8C61';
  if (status === 'on-track') return '#5B7FC2';
  return '#C26B5B';
}

function getTargetStatusForSummary(output: number, prorataTarget: number, achievementTargetRate: number) {
  if (!output && !prorataTarget) return 'no-record' as TargetStatus;
  if (!prorataTarget) return 'no-record' as TargetStatus;
  if (output >= prorataTarget) return 'above-target' as TargetStatus;
  if (output >= prorataTarget * achievementTargetRate) return 'on-track' as TargetStatus;
  return 'under-target' as TargetStatus;
}

function getRejectStatusForSummary(rejectRate: number, rejectTargetRate: number) {
  if (!rejectTargetRate) return 'no-target' as RejectStatus;
  if (rejectRate <= rejectTargetRate) return 'within-target' as RejectStatus;
  return 'exceed-target' as RejectStatus;
}

function rejectRateMetric(okQty: number, rejectPcsEq: number) {
  const total = okQty + rejectPcsEq;
  return total ? rejectPcsEq / total : 0;
}

function buildMasterEntityRow(form: MasterEntityForm, ui_id: string): MasterEntityRow {
  const targets = {
    target_botol_preform: '',
    target_thermoforming: '',
    target_thermoforming_gw_gt_12: '',
    target_printing_non_oz: '',
    target_printing_oz_lt_20: '',
    target_printing_22_oz: '',
  };

  const keyedTargets = {
    ...targets,
    [form.active_target_type]: form.active_target,
  };

  return {
    ui_id,
    area_kerja_line: cleanText(form.area_kerja_line, ''),
    kode_asli_sistem: cleanText(form.kode_asli_sistem, ''),
    kode_asli_normalized: normalizeCode(form.kode_asli_sistem),
    display_laporan: cleanText(form.display_laporan, ''),
    deskripsi_produk: cleanText(form.deskripsi_produk, ''),
    ...keyedTargets,
    active_target_type: form.active_target_type,
    active_target: cleanText(form.active_target, ''),
    target_achievement_rate: cleanText(form.target_achievement_rate, ''),
    target_reject_rate: cleanText(form.target_reject_rate, ''),
  };
}

function formFromRow(row: MasterEntityRow): MasterEntityForm {
  return {
    area_kerja_line: row.area_kerja_line,
    kode_asli_sistem: row.kode_asli_sistem,
    display_laporan: row.display_laporan,
    deskripsi_produk: row.deskripsi_produk,
    active_target: row.active_target,
    active_target_type: row.active_target_type,
    target_achievement_rate: row.target_achievement_rate,
    target_reject_rate: row.target_reject_rate,
  };
}

export default function Home() {
  const [masterTargets, setMasterTargets] = useState<MasterEntityRow[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<ViewMode>('overview');
  const [filters, setFilters] = useState<DashboardFilters>(emptyFilters);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editingMasterId, setEditingMasterId] = useState<string | null>(null);
  const [masterForm, setMasterForm] = useState<MasterEntityForm>(emptyMasterForm);
  const [detailTableFilters, setDetailTableFilters] = useState<DetailTableFilters>(emptyDetailTableFilters);
  const [detailTablePage, setDetailTablePage] = useState(1);
  const [detailReturnState, setDetailReturnState] = useState<DetailReturnState | null>(null);
  const [targetTableFilters, setTargetTableFilters] = useState<TargetTableFilters>(emptyTargetTableFilters);
  const [targetTablePage, setTargetTablePage] = useState(1);
  const [trendLocalFilters, setTrendLocalFilters] = useState<TrendLocalFilters>(emptyTrendLocalFilters);
  const [localTrendRows, setLocalTrendRows] = useState<TrendRow[] | null>(null);
  const [compareSummary, setCompareSummary] = useState<CompareSummary | null>(null);
  const [comparePageIndex, setComparePageIndex] = useState(0);
  const [comparePaused, setComparePaused] = useState(false);
  const [savedFiltersLoaded, setSavedFiltersLoaded] = useState(false);
  const [downtimeEvents, setDowntimeEvents] = useState<DowntimeEventRow[]>([]);
  const [downtimeEventFilters, setDowntimeEventFilters] = useState<DowntimeEventFilters>(emptyDowntimeEventFilters);
  const downtimeEventDefaultDate = filters.dateTo || filters.dateFrom || getJakartaToday();
  const [downtimeEventDrafts, setDowntimeEventDrafts] = useState<DowntimeEventDraft[]>(() => [
    createDowntimeEventDraft({ event_date: downtimeEventDefaultDate }),
  ]);
  const [editingDowntimeEventId, setEditingDowntimeEventId] = useState<string | null>(null);
  const [savingDowntimeEvent, setSavingDowntimeEvent] = useState(false);
  const [downtimeImportMode, setDowntimeImportMode] = useState<'append' | 'replace'>('append');
  const [downtimeImporting, setDowntimeImporting] = useState(false);
  const [downtimeImportFile, setDowntimeImportFile] = useState<File | null>(null);
  const [downtimeImportDragging, setDowntimeImportDragging] = useState(false);
  const [downtimeImportResult, setDowntimeImportResult] = useState<{ source: string; mode: string; parserMode?: string; aiProvider?: string; aiProviderUsed?: string; processedRows: number; savedRows: number; insertedRows?: number; updatedRows?: number; existingRows?: number; existingRowsScanned?: number; skippedRows: number; total: number; message: string } | null>(null);
  const [downtimeImportError, setDowntimeImportError] = useState<string | null>(null);
  const [downtimeWaText, setDowntimeWaText] = useState('');
  const [downtimeWaViewMode, setDowntimeWaViewMode] = useState<'full' | 'output-only'>('output-only');
  const [downtimeWaParserMode, setDowntimeWaParserMode] = useState<'rules' | 'ai' | 'hybrid'>('hybrid');
  const [downtimeWaAiProvider, setDowntimeWaAiProvider] = useState<'gemini' | 'openai' | 'groq' | 'mistral'>('gemini');
  const [downtimeWaParsing, setDowntimeWaParsing] = useState(false);
  const [downtimeWaSaving, setDowntimeWaSaving] = useState(false);
  const [downtimeWaResult, setDowntimeWaResult] = useState<DowntimeWaParseResult | null>(null);
  const [downtimeWaError, setDowntimeWaError] = useState<string | null>(null);
  const [downtimeWaEditingRowIndex, setDowntimeWaEditingRowIndex] = useState<number | null>(null);
  const [downtimeWaRowDraft, setDowntimeWaRowDraft] = useState<any | null>(null);
  const [downtimeWaAliasOverrides, setDowntimeWaAliasOverrides] = useState<Record<string, string>>({});
  const [downtimeWaAliasHistory, setDowntimeWaAliasHistory] = useState<Record<string, { target: string; count: number; lastUsed: string; area: string }>>({});
  const [downtimeWaAliasAreaScope, setDowntimeWaAliasAreaScope] = useState('GLOBAL');
  const [downtimeWaAliasSource, setDowntimeWaAliasSource] = useState('');
  const [downtimeWaAliasTarget, setDowntimeWaAliasTarget] = useState('');
  const [downtimeWaBaselineRows, setDowntimeWaBaselineRows] = useState<DowntimeWaParsedRow[]>([]);
  const [downtimePanel, setDowntimePanel] = useState<DowntimePanel>('workflow');
  const [settingsPanel, setSettingsPanel] = useState<SettingsPanel>('ai');
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsData, setSettingsData] = useState<AppSettingsResponse | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<Record<string, string>>({});
  const [checkingApiKey, setCheckingApiKey] = useState<AiProviderKey | null>(null);
  const [apiKeyCheckResults, setApiKeyCheckResults] = useState<Partial<Record<AiProviderKey, ApiKeyCheckResult>>>({});
  const [syncError, setSyncError] = useState<string | null>(null);
  const downtimeAreaOptions = useMemo(
    () => dashboard.options.areas.slice().sort((a, b) => a.localeCompare(b)),
    [dashboard.options.areas],
  );
  const downtimeMachineOptions = useMemo(
    () => dashboard.options.machines.slice().sort((a, b) => a.localeCompare(b)),
    [dashboard.options.machines],
  );
  const mergeOptions = (currentValue: string, options: string[]) => {
    const values = [currentValue, ...options].map((item) => cleanText(item)).filter(Boolean);
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  };
  const downtimePanelLabels = useMemo(() => ({
    workflow: 'Ringkasan',
    import: 'Import Backfill',
    input: 'Input Event',
    followup: 'Tindak Lanjut',
    table: 'Daftar',
    analysis: 'Analisis',
  } satisfies Record<DowntimePanel, string>), []);

  const downtimePanelGuides = useMemo(() => ({
    workflow: {
      title: 'Alur kerja downtime',
      subtitle: 'Pantau gap output dulu, lalu pindah ke input atau tindak lanjut kalau ada event yang perlu dibenahi.',
      next: 'Kalau gap sudah jelas, buka Input Event atau Tindak Lanjut.',
      steps: [
        { title: '1. Baca prioritas mesin', text: 'Lihat mesin dengan gap terbesar dan cek apakah sudah ada event terkait.' },
        { title: '2. Masuk ke input', text: 'Tambah event downtime hanya kalau ada gangguan yang memang perlu dicatat.' },
        { title: '3. Lanjutkan follow up', text: 'Update root cause, action, dan status sampai event siap ditutup.' },
      ],
    },
    input: {
      title: 'Input event cepat',
      subtitle: 'Satu card mewakili satu event. Field yang sama bisa ikut terbawa supaya input berulang lebih cepat.',
      next: 'Tambah card baru kalau ada event lain di shift yang sama.',
      steps: [
        { title: '1. Tambah card', text: 'Mulai dari satu event, lalu copy-forward field yang stabil dari card sebelumnya.' },
        { title: '2. Isi jam dan detail', text: 'Fokus ke mesin, waktu mulai/selesai, dan penyebab utama.' },
        { title: '3. Save semua kartu', text: 'Simpan sekali di bagian bawah setelah semua event diisi.' },
      ],
    },
    import: {
      title: 'Import backfill',
      subtitle: 'Dipakai untuk kirim histori dari CSV/XLSX. Append aman dipakai dulu, replace hanya kalau yakin perlu ganti batch lama.',
      next: 'Download template dulu kalau format file belum seragam.',
      steps: [
        { title: '1. Ambil template', text: 'Template CSV/XLSX sudah disederhanakan ke field yang benar-benar diisi user.' },
        { title: '2. Upload file', text: 'Pilih append untuk aman, lalu cek hasil preview sebelum save final.' },
        { title: '3. Validasi conflict', text: 'Kalau ada overlap atau duplikat, cocokkan dengan data existing dulu sebelum replace.' },
      ],
    },
    followup: {
      title: 'Tindak lanjut',
      subtitle: 'Pakai panel ini untuk menutup gap root cause dan menandai event yang sudah selesai diproses.',
      next: 'Prioritaskan event open atau monitoring yang punya loss terbesar.',
      steps: [
        { title: '1. Pilih event terbuka', text: 'Fokus ke event dengan loss output atau durasi paling tinggi.' },
        { title: '2. Isi root cause', text: 'Pastikan penyebab dan action singkat tapi jelas.' },
        { title: '3. Tutup status', text: 'Turunkan status ke closed kalau follow up sudah selesai.' },
      ],
    },
    table: {
      title: 'Daftar downtime',
      subtitle: 'Daftar dipakai untuk cek histori cepat, filter per shift atau kategori, lalu edit baris yang perlu dibenahi.',
      next: 'Kalau cari pola, gunakan filter shift, status, dan kategori dulu.',
      steps: [
        { title: '1. Filter data', text: 'Saring berdasarkan shift, status, atau kategori agar review lebih cepat.' },
        { title: '2. Cek detail', text: 'Gunakan tabel untuk melihat baris yang perlu koreksi.' },
        { title: '3. Edit seperlunya', text: 'Update event yang salah lalu simpan kembali.' },
      ],
    },
    analysis: {
      title: 'Analisis downtime',
      subtitle: 'Panel ini mengubah gap output jadi daftar prioritas. Tujuannya bukan mengganti data, tapi mengarahkan tindakan.',
      next: 'Gunakan hasil ranking mesin untuk tentukan event mana yang dikerjakan duluan.',
      steps: [
        { title: '1. Lihat ranking loss', text: 'Mesin dengan loss terbesar biasanya paling layak dibongkar dulu.' },
        { title: '2. Cek komposisi gangguan', text: 'Lihat apakah masalah dominan ada di setup, material, listrik, atau minor stop.' },
        { title: '3. Masuk ke workflow', text: 'Setelah prioritas jelas, pindah ke input atau follow up.' },
      ],
    },
  } satisfies Record<DowntimePanel, {
    title: string;
    subtitle: string;
    next: string;
    steps: Array<{ title: string; text: string }>;
  }>), []);

  const formatAiChain = (result?: Pick<DowntimeWaParseResult, 'aiProvider' | 'aiProviderUsed'>) => {
    if (!result?.aiProvider && !result?.aiProviderUsed) return '-';
    const primary = (result.aiProvider || '').toLowerCase();
    const used = (result.aiProviderUsed || '').toLowerCase();
    const labelFor = (value: string) => value === 'gemini'
      ? 'Gemini'
      : value === 'openai'
        ? 'OpenAI'
        : value === 'groq'
          ? 'Groq'
          : value === 'mistral'
            ? 'Mistral'
            : '';
    const primaryLabel = labelFor(primary);
    const usedLabel = labelFor(used);
    if (primaryLabel && usedLabel && primaryLabel !== usedLabel) return `${primaryLabel} → ${usedLabel}`;
    return usedLabel || primaryLabel || '-';
  };

  const downtimeWaAliasStorageKey = 'ppic-downtime-wa-machine-aliases-v3';
  const downtimeWaAliasStorageKeyLegacy = 'ppic-downtime-wa-machine-aliases-v2';
  const downtimeWaAliasHistoryStorageKey = 'ppic-downtime-wa-machine-alias-history-v1';

  const normalizeDowntimeWaArea = (value: string) => normalizeCode(value || 'GLOBAL') || 'GLOBAL';
  const normalizeDowntimeWaAliasSource = (value: string) => normalizeMachineAliasText(value || '') || normalizeCode(value || '');
  const downtimeWaAliasScopeKey = (area: string, source: string) => `${normalizeDowntimeWaArea(area)}::${normalizeDowntimeWaAliasSource(source)}`;

  const normalizeDowntimeWaAliasTarget = (value: string) => {
    const normalized = normalizeDowntimeWaAliasSource(value);
    if (!normalized) return '';
    const master = masterTargets.find((row) => {
      const pack = buildMachineSynonymPack(row);
      return pack.some((item) => normalizeDowntimeWaAliasSource(item) === normalized);
    });
    return master?.display_laporan || value.trim();
  };

  const normalizeDowntimeWaAliasMap = (value: Record<string, string>) => {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, target]) => target)
        .map(([key, target]) => [
          key.includes('::') ? key : `GLOBAL::${normalizeDowntimeWaAliasSource(key)}`,
          normalizeDowntimeWaAliasTarget(target),
        ]),
    ) as Record<string, string>;
  };

  const normalizeDowntimeWaAliasHistoryMap = (value: Record<string, { target: string; count: number; lastUsed: string; area: string }>) => {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry?.target)
        .map(([key, entry]) => [
          key.includes('::') ? key : `GLOBAL::${normalizeDowntimeWaAliasSource(key)}`,
          {
            target: normalizeDowntimeWaAliasTarget(entry.target),
            count: Number(entry.count || 0),
            lastUsed: entry.lastUsed || '',
            area: normalizeDowntimeWaArea(entry.area || key.split('::')[0] || 'GLOBAL'),
          },
        ]),
    ) as Record<string, { target: string; count: number; lastUsed: string; area: string }>;
  };

  const readDowntimeWaAliases = () => {
    if (typeof window === 'undefined') return {} as Record<string, string>;
    try {
      const primaryRaw = window.localStorage.getItem(downtimeWaAliasStorageKey);
      const legacyRaw = window.localStorage.getItem(downtimeWaAliasStorageKeyLegacy);
      const parsedPrimary = primaryRaw ? (JSON.parse(primaryRaw) as Record<string, string>) : {};
      const parsedLegacy = legacyRaw ? (JSON.parse(legacyRaw) as Record<string, string>) : {};
      return normalizeDowntimeWaAliasMap({ ...parsedLegacy, ...parsedPrimary });
    } catch {
      return {} as Record<string, string>;
    }
  };

  const readDowntimeWaAliasHistory = () => {
    if (typeof window === 'undefined') return {} as Record<string, { target: string; count: number; lastUsed: string; area: string }>;
    try {
      const raw = window.localStorage.getItem(downtimeWaAliasHistoryStorageKey);
      if (!raw) return {} as Record<string, { target: string; count: number; lastUsed: string; area: string }>;
      const parsed = JSON.parse(raw) as Record<string, { target?: string; count?: number; lastUsed?: string; area?: string }>;
      return normalizeDowntimeWaAliasHistoryMap(Object.fromEntries(Object.entries(parsed).filter(([, value]) => value?.target).map(([key, value]) => [key, {
        target: value.target || '',
        count: Number(value.count || 0),
        lastUsed: value.lastUsed || '',
        area: value.area || 'GLOBAL',
      }]))) as Record<string, { target: string; count: number; lastUsed: string; area: string }>;
    } catch {
      return {} as Record<string, { target: string; count: number; lastUsed: string; area: string }>;
    }
  };

  const writeDowntimeWaAliases = (value: Record<string, string>) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(downtimeWaAliasStorageKey, JSON.stringify(value));
    } catch {
      // ignore storage failures
    }
  };

  const writeDowntimeWaAliasHistory = (value: Record<string, { target: string; count: number; lastUsed: string; area: string }>) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(downtimeWaAliasHistoryStorageKey, JSON.stringify(value));
    } catch {
      // ignore storage failures
    }
  };

  const resolveDowntimeWaTiming = (args: {
    eventDate: string;
    shiftCode: string;
    condition?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    durationMinutes?: number | null;
  }) => {
    return sharedResolveDowntimeWaTiming(args);
  };

  const deriveDowntimeWaStructuredRow = (row: any) => {
    const resolved = resolveDowntimeWaTiming({
      eventDate: row.event_date,
      shiftCode: row.shift_code,
      condition: row.condition || row.root_cause || row.source_line,
      startTime: row.start_time,
      endTime: row.end_time,
      durationMinutes: row.duration_minutes,
    });
    return {
      tanggal: row.event_date,
      machine_master: row.machine,
      machine_raw: row.machine_raw || row.source_line,
      machine_normalized: row.machine_normalized || normalizeCode(row.machine),
      machine_match: row.machine_match || 'raw',
      match_source: row.match_source || row.match_code || 'raw:fallback',
      match_code: row.match_code || '',
      match_reason: row.match_reason || '',
      idempotency_key: row.idempotency_key || `${row.event_date || ''}|${row.shift_code || ''}|${normalizeDowntimeWaArea(row.area || '')}|${normalizeCode(row.machine || '')}|${normalizeCode(row.line || row.machine || '')}|${normalizeCode(row.category || '')}|${resolved.startTime}|${resolved.endTime}|${normalizeCode(row.root_cause || '')}|${normalizeCode(row.action_taken || '')}|${normalizeCode(row.condition || '')}`,
      start: resolved.startTime,
      end: resolved.endTime,
      durasi_menit: resolved.durationMinutes,
      reason: row.root_cause,
      operator: row.pic,
      note: row.action_taken || row.warning || row.source_line,
      condition: row.condition || (row.root_cause.toLowerCase() === 'lancar' ? 'lancar' : row.root_cause.toLowerCase() === 'off' ? 'off' : 'downtime'),
      shift_code: row.shift_code,
      area: row.area,
      category: row.category,
      confidence: row.confidence,
      warning_code: row.warning_code || '',
    };
  };

  const detectLocalDowntimeDuplicates = (rows: DowntimeWaParsedRow[]) => {
    const seen = new Map<string, number>();
    return rows.flatMap((row, index) => {
      const key = row.idempotency_key || [row.event_date, row.shift_code, normalizeDowntimeWaArea(row.area), normalizeCode(row.machine), row.start_time, row.end_time, normalizeCode(row.root_cause), normalizeCode(row.action_taken)].join('|');
      const first = seen.get(key);
      if (first !== undefined) {
        return [{
          kind: 'internal' as const,
          row_index: index,
          event_date: row.event_date,
          shift_code: row.shift_code,
          machine: row.machine,
          machine_normalized: row.machine_normalized || normalizeCode(row.machine),
          start_time: row.start_time,
          end_time: row.end_time,
          duplicate_key: key,
          match_source: row.match_source || row.match_code || 'raw:fallback',
          reason: `Duplikat dengan baris ${first + 1} pada preview`,
        }];
      }
      seen.set(key, index);
      return [];
    });
  };

  const summarizeDowntimeWaConflictHints = (hints: NonNullable<DowntimeWaParseResult['duplicateHints']> = []) => {
    const affectedRows = new Set<number>();
    let internalCount = 0;
    let existingCount = 0;
    for (const hint of hints) {
      affectedRows.add(hint.row_index);
      if (hint.kind === 'internal') internalCount += 1;
      if (hint.kind === 'existing') existingCount += 1;
    }
    return {
      totalCount: hints.length,
      internalCount,
      existingCount,
      affectedRowCount: affectedRows.size,
    };
  };

  const summarizeDowntimeWaQuality = (quality?: DowntimeWaParseResult['quality']) => {
    if (!quality) return null;
    const badgeClass = quality.riskLevel === 'high' ? 'exceed-target' : quality.riskLevel === 'medium' ? 'on-track' : 'within-target';
    return (
      <div className="warning-box">
        <strong>Quality gate</strong>
        <div className="compare-summary-grid downtime-conflict-summary">
          <div className="compare-summary-card">
            <span>Risk</span>
            <strong className={badgeClass}>{quality.riskLevel.toUpperCase()}</strong>
            <em>{quality.reviewRequired ? 'Perlu review sebelum save' : 'Aman untuk lanjut save'}</em>
          </div>
          <div className="compare-summary-card">
            <span>Raw fallback</span>
            <strong>{numberFmt.format(quality.rawMachineRows)}</strong>
            <em>{numberFmt.format(quality.lowConfidenceRows)} low confidence · {numberFmt.format(quality.timingFallbackRows)} timing fallback</em>
          </div>
          <div className="compare-summary-card">
            <span>Dup / skip</span>
            <strong>{numberFmt.format(quality.duplicateHintCount)}</strong>
            <em>{numberFmt.format(quality.skippedLines)} line di-skip</em>
          </div>
        </div>
        {quality.reasons.length ? <ul>{quality.reasons.slice(0, 6).map((reason, index) => <li key={index}>{reason}</li>)}</ul> : null}
      </div>
    );
  };

  const buildDowntimeWaPreviewDiff = (baseline: DowntimeWaParsedRow[], current: DowntimeWaParsedRow[]) => {
    const max = Math.max(baseline.length, current.length);
    return Array.from({ length: max }, (_, index) => {
      const before = baseline[index];
      const after = current[index];
      if (!before || !after) return null;
      const fields: Array<keyof DowntimeWaParsedRow> = ['event_date', 'shift_code', 'area', 'machine', 'start_time', 'end_time', 'duration_minutes', 'root_cause', 'action_taken', 'pic', 'condition'];
      const changed = fields.filter((field) => String(before[field] ?? '') !== String(after[field] ?? ''));
      if (!changed.length) return null;
      return {
        index,
        machine: after.machine,
        area: after.area,
        changed,
        before,
        after,
      };
    }).filter(Boolean) as Array<{ index: number; machine: string; area: string; changed: Array<keyof DowntimeWaParsedRow>; before: DowntimeWaParsedRow; after: DowntimeWaParsedRow }>;
  };

  const resolveDowntimeAliasTarget = (target: string) => {
    const normalized = normalizeDowntimeWaAliasSource(target);
    return masterTargets.find((row) => buildMachineSynonymPack(row).some((item) => normalizeDowntimeWaAliasSource(item) === normalized)) || null;
  };

  const canonicalizeDowntimeWaMachine = (row: DowntimeWaParsedRow) => {
    const sourceCandidates = [row.source_line, row.machine_raw, row.machine, row.line].filter(Boolean) as string[];
    const areaKey = normalizeDowntimeWaArea(row.area);
    for (const candidate of sourceCandidates) {
      const source = normalizeDowntimeWaAliasSource(candidate);
      if (!source) continue;
      const borcheFamily = normalizeMachineAliasText(candidate).match(/\b(?:borch|borche)\s*0*([1-2])\b/);
      if (borcheFamily) {
        const familyName = `Borche ${borcheFamily[1]}`;
        const master = masterTargets.find((item) => normalizeMachineAliasText(item.display_laporan) === normalizeMachineAliasText(familyName) || normalizeMachineAliasText(item.kode_asli_sistem) === normalizeMachineAliasText(familyName) || normalizeMachineAliasText(item.kode_asli_normalized) === normalizeMachineAliasText(familyName));
        if (master) {
          return {
            machine: master.display_laporan || row.machine,
            machine_normalized: normalizeDowntimeWaAliasSource(master.display_laporan || row.machine),
            machine_match: 'family' as const,
            area: master.area_kerja_line || row.area,
          };
        }
      }
      const directFamily = normalizeMachineAliasText(candidate).match(/\b(?:hengfeng|hf)\s*0*([1-4])\b|\b(?:illig|tf)\s*0*([1-3])\b/);
      if (directFamily) {
        const familyName = directFamily[1] ? `Hengfeng ${directFamily[1]}` : `Illig ${directFamily[2]}`;
        const master = masterTargets.find((item) => normalizeMachineAliasText(item.display_laporan) === normalizeMachineAliasText(familyName) || normalizeMachineAliasText(item.kode_asli_sistem) === normalizeMachineAliasText(familyName) || normalizeMachineAliasText(item.kode_asli_normalized) === normalizeMachineAliasText(familyName));
        if (master) {
          return {
            machine: master.display_laporan || row.machine,
            machine_normalized: normalizeDowntimeWaAliasSource(master.display_laporan || row.machine),
            machine_match: 'family' as const,
            area: master.area_kerja_line || row.area,
          };
        }
      }
      const master = masterTargets.find((item) => {
        const sameArea = normalizeDowntimeWaArea(item.area_kerja_line || '') === areaKey || areaKey === 'GLOBAL';
        if (!sameArea) return false;
        return buildMachineSynonymPack(item).some((alias) => normalizeDowntimeWaAliasSource(alias) === source);
      }) || resolveDowntimeAliasTarget(candidate);
      if (master) {
        return {
          machine: master.display_laporan || row.machine,
          machine_normalized: normalizeDowntimeWaAliasSource(master.display_laporan || row.machine),
          machine_match: 'family' as const,
          area: master.area_kerja_line || row.area,
        };
      }
    }
    return null;
  };

  type DowntimeWaProductionRow = NonNullable<NonNullable<DowntimeWaParseResult['productionRows']>>[number];

  const canonicalizeDowntimeWaProductionRow = (row: DowntimeWaProductionRow): DowntimeWaProductionRow => {
    const sourceCandidates = [row.machine_raw, row.machine_master].filter(Boolean) as string[];
    const areaKey = normalizeDowntimeWaArea(row.area);
    for (const candidate of sourceCandidates) {
      const source = normalizeDowntimeWaAliasSource(candidate);
      if (!source) continue;
      const master = masterTargets.find((item) => {
        const sameArea = normalizeDowntimeWaArea(item.area_kerja_line || '') === areaKey || areaKey === 'GLOBAL';
        if (!sameArea) return false;
        return buildMachineSynonymPack(item).some((alias) => normalizeDowntimeWaAliasSource(alias) === source);
      }) || resolveDowntimeAliasTarget(candidate);
      if (master) {
        return {
          ...row,
          machine_master: master.display_laporan || row.machine_master,
          machine_normalized: normalizeDowntimeWaAliasSource(master.display_laporan || row.machine_master),
          machine_match: 'family' as const,
          area: (master.area_kerja_line || row.area) as DowntimeWaProductionRow['area'],
        };
      }
    }
    return row;
  };

  const canonicalizeDowntimeWaResult = (result: DowntimeWaParseResult | null) => {
    if (!result) return result;
    const rows = result.rows.map((row) => {
      const canonical = canonicalizeDowntimeWaMachine(row);
      return canonical ? { ...row, ...canonical } as DowntimeWaParsedRow : row;
    });
    const productionRows = result.productionRows?.map((row) => canonicalizeDowntimeWaProductionRow(row)) as DowntimeWaProductionRow[] | undefined;
    const structuredRows = rows.map(deriveDowntimeWaStructuredRow);
    const duplicateHints = detectLocalDowntimeDuplicates(rows);
    return { ...result, rows, productionRows, structuredRows, duplicateHints };
  };

  const resolveDowntimeAliasOverride = (row: DowntimeWaParsedRow, overrides: Record<string, string>) => {
    const sourceKey = normalizeDowntimeWaAliasSource(row.source_line || row.machine_raw || row.machine || row.line);
    const scopedKey = downtimeWaAliasScopeKey(row.area, sourceKey);
    return overrides[scopedKey] || overrides[`GLOBAL::${sourceKey}`] || '';
  };

  const resolveDowntimeWaAliasSuggestion = (
    row: DowntimeWaParsedRow,
    overrides: Record<string, string>,
    history: Record<string, { target: string; count: number; lastUsed: string; area: string }>,
  ) => {
    const sourceKey = normalizeDowntimeWaAliasSource(row.source_line || row.machine_raw || row.machine || row.line);
    if (!sourceKey) return null;
    const scopedKey = downtimeWaAliasScopeKey(row.area, sourceKey);
    if (overrides[scopedKey] || overrides[`GLOBAL::${sourceKey}`]) return null;
    const candidates = [history[scopedKey], history[`GLOBAL::${sourceKey}`]].filter(Boolean) as Array<{ target: string; count: number; lastUsed: string; area: string }>;
    if (!candidates.length) return null;
    candidates.sort((a, b) => (b.count - a.count) || b.lastUsed.localeCompare(a.lastUsed));
    const best = candidates[0];
    if (!best?.target) return null;
    return { area: normalizeDowntimeWaArea(row.area), source: sourceKey, target: best.target, count: best.count || 0, fromHistory: true, scopedKey };
  };

  const suggestDowntimeWaAliases = (rows: DowntimeWaParsedRow[], overrides: Record<string, string>, history: Record<string, { target: string; count: number; lastUsed: string; area: string }>) => {
    const grouped = new Map<string, { area: string; source: string; target: string; count: number; fromHistory: boolean }>();
    for (const row of rows) {
      if (row.confidence === 'high') continue;
      const suggestion = resolveDowntimeWaAliasSuggestion(row, overrides, history);
      if (!suggestion) continue;
      const prev = grouped.get(suggestion.scopedKey);
      if (prev) {
        prev.count += 1;
        continue;
      }
      grouped.set(suggestion.scopedKey, { area: suggestion.area, source: suggestion.source, target: suggestion.target, count: suggestion.count || 1, fromHistory: true });
    }
    return [...grouped.values()].sort((a, b) => b.count - a.count);
  };

  const applyDowntimeWaAliases = (result: DowntimeWaParseResult | null, overrides: Record<string, string>, history = downtimeWaAliasHistory) => {
    if (!result) return result;
    const autoApplied: string[] = [];
    const nextRows: DowntimeWaParsedRow[] = result.rows.map((row) => {
      const overrideTarget = resolveDowntimeAliasOverride(row, overrides);
      const suggestion = row.confidence === 'high' ? resolveDowntimeWaAliasSuggestion(row, overrides, history) : null;
      const target = overrideTarget || suggestion?.target || '';
      if (!target) return row;
      const master = resolveDowntimeAliasTarget(target);
      const machine = master?.display_laporan || target;
      if (!overrideTarget && suggestion?.target && row.confidence === 'high') {
        autoApplied.push(`${suggestion.area}::${suggestion.source}`);
      }
      return {
        ...row,
        machine,
        machine_raw: row.machine_raw || row.source_line,
        machine_normalized: normalizeCode(machine),
        machine_match: master ? 'family' : 'alias',
        area: master?.area_kerja_line || row.area,
      } as DowntimeWaParsedRow;
    });
    const structuredRows = nextRows.map(deriveDowntimeWaStructuredRow);
    const duplicateHints = detectLocalDowntimeDuplicates(nextRows);
    const notes = autoApplied.length ? [...(result.notes || []), `Auto-applied ${new Set(autoApplied).size} alias suggestion(s) dari histori untuk row confidence high.`] : result.notes;
    return { ...result, rows: nextRows, structuredRows, duplicateHints, notes };
  };

  const commitDowntimeWaAliases = (nextOverrides: Record<string, string>) => {
    setDowntimeWaAliasOverrides(nextOverrides);
    writeDowntimeWaAliases(nextOverrides);
    const nextHistory = (() => {
    const current = readDowntimeWaAliasHistory();
    const draft = { ...current };
    const now = new Date().toISOString();
    for (const [scopedKey, target] of Object.entries(nextOverrides)) {
      const [area = 'GLOBAL'] = scopedKey.split('::');
      const existing = draft[scopedKey] || { target, count: 0, lastUsed: now, area };
      draft[scopedKey] = { target: normalizeDowntimeWaAliasTarget(target), count: (existing.count || 0) + 1, lastUsed: now, area };
    }
      return draft;
    })();
    setDowntimeWaAliasHistory(nextHistory);
    writeDowntimeWaAliasHistory(nextHistory);
    setDowntimeWaResult((current) => applyDowntimeWaAliases(current, nextOverrides, nextHistory));
  };

  const applyDowntimeWaRowPatch = (rowIndex: number, patch: Partial<DowntimeWaParsedRow>) => {
    setDowntimeWaResult((current) => {
      if (!current) return current;
      const rows: DowntimeWaParsedRow[] = current.rows.map((row, index) => {
        if (index !== rowIndex) return row;
        const nextRow = { ...row, ...patch } as DowntimeWaParsedRow;
        if (patch.machine !== undefined) {
          nextRow.machine_normalized = normalizeCode(patch.machine);
          nextRow.machine_match = 'raw';
          nextRow.match_source = 'raw:fallback';
          nextRow.line = patch.machine;
        }
        nextRow.idempotency_key = `${nextRow.event_date}|${nextRow.shift_code}|${normalizeDowntimeWaArea(nextRow.area)}|${normalizeCode(nextRow.machine || '')}|${normalizeCode(nextRow.line || nextRow.machine || '')}|${normalizeCode(nextRow.category)}|${nextRow.start_time}|${nextRow.end_time}|${normalizeCode(nextRow.root_cause)}|${normalizeCode(nextRow.action_taken)}|${normalizeCode(nextRow.condition || '')}`;
        return nextRow;
      });
      const structuredRows = rows.map(deriveDowntimeWaStructuredRow);
      const duplicateHints = detectLocalDowntimeDuplicates(rows);
      return { ...current, rows, structuredRows, duplicateHints };
    });
  };

  const applyDowntimeWaRowToSimilar = (rowIndex: number, patch: Partial<DowntimeWaParsedRow>) => {
    setDowntimeWaResult((current) => {
      if (!current) return current;
      const base = current.rows[rowIndex];
      if (!base) return current;
      const baseMachineKey = normalizeDowntimeWaAliasSource(base.machine_normalized || base.machine);
      const baseAreaKey = normalizeDowntimeWaArea(base.area);
      const rows: DowntimeWaParsedRow[] = current.rows.map((row, index) => {
        const rowMachineKey = normalizeDowntimeWaAliasSource(row.machine_normalized || row.machine);
        const rowAreaKey = normalizeDowntimeWaArea(row.area);
        if (index !== rowIndex && (rowMachineKey !== baseMachineKey || rowAreaKey !== baseAreaKey)) return row;
        const nextRow = { ...row, ...patch } as DowntimeWaParsedRow;
        if (patch.machine !== undefined) {
          nextRow.machine_normalized = normalizeCode(patch.machine);
          nextRow.machine_match = 'raw';
          nextRow.match_source = 'raw:fallback';
          nextRow.line = patch.machine;
        }
        if (patch.root_cause !== undefined || patch.action_taken !== undefined || patch.pic !== undefined || patch.condition !== undefined) {
          nextRow.machine_normalized = nextRow.machine_normalized || row.machine_normalized;
        }
        nextRow.idempotency_key = `${nextRow.event_date}|${nextRow.shift_code}|${normalizeDowntimeWaArea(nextRow.area)}|${normalizeCode(nextRow.machine || '')}|${normalizeCode(nextRow.line || nextRow.machine || '')}|${normalizeCode(nextRow.category)}|${nextRow.start_time}|${nextRow.end_time}|${normalizeCode(nextRow.root_cause)}|${normalizeCode(nextRow.action_taken)}|${normalizeCode(nextRow.condition || '')}`;
        return nextRow;
      });
      const structuredRows = rows.map(deriveDowntimeWaStructuredRow);
      const duplicateHints = detectLocalDowntimeDuplicates(rows);
      return { ...current, rows, structuredRows, duplicateHints };
    });
  };

  const startEditingDowntimeWaRow = (rowIndex: number) => {
    if (!downtimeWaResult?.rows[rowIndex]) return;
    setDowntimeWaEditingRowIndex(rowIndex);
    setDowntimeWaRowDraft({ ...downtimeWaResult.rows[rowIndex] });
  };

  const cancelEditingDowntimeWaRow = () => {
    setDowntimeWaEditingRowIndex(null);
    setDowntimeWaRowDraft(null);
  };

  const saveEditingDowntimeWaRow = () => {
    if (downtimeWaEditingRowIndex === null || !downtimeWaRowDraft) return;
    applyDowntimeWaRowPatch(downtimeWaEditingRowIndex, downtimeWaRowDraft);
    cancelEditingDowntimeWaRow();
  };

  const downtimeWaPreviewDiff = downtimeWaResult ? buildDowntimeWaPreviewDiff(downtimeWaBaselineRows, downtimeWaResult.rows) : [];
  const downtimeWaAliasSuggestions = downtimeWaResult ? suggestDowntimeWaAliases(downtimeWaResult.rows, downtimeWaAliasOverrides, downtimeWaAliasHistory) : [];
  const downtimeWaConflictSummary = downtimeWaResult ? summarizeDowntimeWaConflictHints(downtimeWaResult.duplicateHints) : null;

  const downloadParsedWaCsv = () => {
    if (!downtimeWaResult?.structuredRows?.length) return;
    const headers = ['tanggal', 'machine_master', 'machine_raw', 'machine_match', 'match_source', 'match_code', 'match_reason', 'idempotency_key', 'condition', 'start', 'end', 'durasi_menit', 'reason', 'operator', 'note', 'shift_code', 'area', 'category', 'confidence', 'warning_code'];
    const escapeCsv = (value: unknown) => {
      const text = String(value ?? '');
      if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
      return text;
    };
    const lines = [headers.join(',')].concat(downtimeWaResult.structuredRows.map((row) => headers.map((key) => escapeCsv((row as Record<string, unknown>)[key])).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `copas-wa-structured.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const loadMasterTargets = async () => {
    const response = await fetch('/api/master-entity');
    if (!response.ok) throw new Error('Failed to load master entity');
    const payload = await response.json() as { data: MasterEntityRow[] };
    setMasterTargets(payload.data);
    return payload.data;
  };

  const buildDashboardUrl = (nextFilters: DashboardFilters, nextView: ViewMode) => {
    const params = new URLSearchParams();
    Object.entries(nextFilters).forEach(([key, value]) => {
      if (value && key !== 'month') params.set(key, value);
    });
    params.set('view', nextView === 'downtime' || nextView === 'compare-period' ? 'overview' : nextView);
    return `/api/dashboard?${params.toString()}`;
  };

  const buildTrendUrl = (nextFilters: DashboardFilters, localFilters: TrendLocalFilters) => {
    const params = new URLSearchParams();
    Object.entries(nextFilters).forEach(([key, value]) => {
      if (value && key !== 'month') params.set(key, value);
    });
    params.set('view', 'overview');
    if (localFilters.area) params.set('trendArea', localFilters.area);
    if (localFilters.machine) params.set('trendMachine', localFilters.machine);
    return `/api/dashboard?${params.toString()}`;
  };

  const loadDashboard = async (nextFilters = filters, nextView = activeView) => {
    const response = await fetch(buildDashboardUrl(nextFilters, nextView));
    if (!response.ok) throw new Error('Failed to load dashboard');
    const payload = await response.json() as DashboardData;
    const safePayload: DashboardData = {
      ...emptyDashboard,
      ...payload,
      kpis: { ...emptyDashboard.kpis, ...(payload.kpis ?? {}) },
      rowCounts: { ...emptyDashboard.rowCounts, ...(payload.rowCounts ?? {}) },
      dateRange: { ...emptyDashboard.dateRange, ...(payload.dateRange ?? {}) },
    options: { ...emptyDashboard.options, ...(payload.options ?? {}) },
      trend: payload.trend ?? [],
      byMachine: payload.byMachine ?? [],
      byCategory: payload.byCategory ?? [],
      byItem: payload.byItem ?? [],
      rejectRateByLine: payload.rejectRateByLine ?? [],
      targetPerformance: payload.targetPerformance ?? [],
      detailRows: payload.detailRows ?? [],
    };
    setDashboard(safePayload);
    if (!nextFilters.month && !nextFilters.dateFrom && !nextFilters.dateTo && safePayload.dateRange.min && safePayload.dateRange.max) {
      setFilters((current) => current.month || current.dateFrom || current.dateTo ? current : getDefaultMonthFilters(safePayload.dateRange));
    }
    return safePayload;
  };


  const buildDowntimeEventsUrl = (nextFilters = filters, eventFilters = downtimeEventFilters) => {
    const params = new URLSearchParams();
    if (nextFilters.dateFrom) params.set('dateFrom', nextFilters.dateFrom);
    if (nextFilters.dateTo) params.set('dateTo', nextFilters.dateTo);
    if (nextFilters.machine) params.set('machine', nextFilters.machine);
    if (eventFilters.category) params.set('category', eventFilters.category);
    if (eventFilters.shift) params.set('shift', eventFilters.shift);
    if (eventFilters.status) params.set('status', eventFilters.status);
    return `/api/downtime-events?${params.toString()}`;
  };

  const buildDowntimeRefreshFilters = (rows?: Array<{ event_date?: string }>) => {
    const dates = (rows || []).map((row) => row.event_date || '').filter(Boolean).sort();
    if (!dates.length) return filters;
    return { ...filters, dateFrom: dates[0], dateTo: dates[dates.length - 1] };
  };

  const loadDowntimeEvents = async (nextFilters = filters, eventFilters = downtimeEventFilters) => {
    const response = await fetch(buildDowntimeEventsUrl(nextFilters, eventFilters));
    if (!response.ok) throw new Error('Failed to load downtime events');
    const payload = await response.json() as { data: DowntimeEventRow[] };
    setDowntimeEvents(payload.data ?? []);
    return payload.data ?? [];
  };

  useEffect(() => {
    let cancelled = false;
    loadMasterTargets()
      .catch((error) => console.error(error))
      .finally(() => { if (cancelled) return; });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const saved = readSavedFilterState();
    setDetailTableFilters(saved.detailTableFilters);
    setTargetTableFilters(saved.targetTableFilters);
    setTrendLocalFilters(saved.trendLocalFilters);
    setSavedFiltersLoaded(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setDowntimeWaAliasOverrides(readDowntimeWaAliases());
    setDowntimeWaAliasHistory(readDowntimeWaAliasHistory());
  }, []);

  useEffect(() => {
    if (!masterTargets.length || typeof window === 'undefined') return;
    const syncedAliases = normalizeDowntimeWaAliasMap(readDowntimeWaAliases());
    const syncedHistory = normalizeDowntimeWaAliasHistoryMap(readDowntimeWaAliasHistory());
    setDowntimeWaAliasOverrides((current) => {
      const next = normalizeDowntimeWaAliasMap({ ...current, ...syncedAliases });
      if (JSON.stringify(next) !== JSON.stringify(current)) writeDowntimeWaAliases(next);
      return next;
    });
    setDowntimeWaAliasHistory((current) => {
      const next = normalizeDowntimeWaAliasHistoryMap({ ...current, ...syncedHistory });
      if (JSON.stringify(next) !== JSON.stringify(current)) writeDowntimeWaAliasHistory(next);
      return next;
    });
    setDowntimeWaResult((current) => canonicalizeDowntimeWaResult(applyDowntimeWaAliases(current, syncedAliases, syncedHistory)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterTargets]);

  useEffect(() => {
    setDowntimeWaResult((current) => canonicalizeDowntimeWaResult(applyDowntimeWaAliases(current, downtimeWaAliasOverrides)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterTargets]);

  useEffect(() => {
    if (!savedFiltersLoaded) return;
    writeSavedFilterState({ detailTableFilters, targetTableFilters, trendLocalFilters });
  }, [detailTableFilters, targetTableFilters, trendLocalFilters, savedFiltersLoaded]);

  const scrollToSection = (id: string) => {
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const openDowntimePanel = (panel: DowntimePanel) => {
    setDowntimePanel(panel);
    window.requestAnimationFrame(() => {
      document.getElementById('downtime-panel-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const openDetailDrilldown = (patch: Partial<DetailTableFilters>) => {
    setDetailReturnState({
      view: activeView,
      detailTableFilters,
      detailTablePage,
    });
    setActiveView('data-detail');
    setDetailTableFilters({ ...emptyDetailTableFilters, ...patch });
    setDetailTablePage(1);
    scrollToSection('detail-table-section');
  };

  const backFromDetail = () => {
    const returnState = detailReturnState ?? {
      view: 'overview' as ViewMode,
      detailTableFilters: emptyDetailTableFilters,
      detailTablePage: 1,
    };
    setDetailTableFilters(returnState.detailTableFilters);
    setDetailTablePage(returnState.detailTablePage);
    setActiveView(returnState.view);
    setDetailReturnState(null);
  };

  const openTargetDrilldown = (patch: Partial<TargetTableFilters>) => {
    setActiveView('overview');
    setTargetTableFilters({ ...emptyTargetTableFilters, ...patch });
    setTargetTablePage(1);
    scrollToSection('target-production-section');
  };

  useEffect(() => {
    let cancelled = false;
    if (activeView === 'master-entity') {
      setLoading(false);
      return () => { cancelled = true; };
    }
    setLoading(true);
    loadDashboard(filters, activeView)
      .catch((error) => console.error(error))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, activeView]);


  useEffect(() => {
    if (activeView !== 'downtime') return;
    loadDowntimeEvents(filters, downtimeEventFilters).catch((error) => console.error(error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, downtimeEventFilters, activeView]);

  useEffect(() => {
    if (activeView !== 'downtime') return;
    const savedPanel = window.localStorage.getItem('ppic-downtime-panel');
    const nextPanel = savedPanel && ['workflow', 'import', 'input', 'followup', 'table', 'analysis'].includes(savedPanel)
      ? savedPanel as DowntimePanel
      : 'workflow';
    setDowntimePanel(nextPanel);
  }, [activeView]);

  useEffect(() => {
    if (activeView !== 'downtime') return;
    window.localStorage.setItem('ppic-downtime-panel', downtimePanel);
  }, [activeView, downtimePanel]);

  useEffect(() => {
    if (activeView !== 'settings') return;
    let cancelled = false;
    setSettingsLoading(true);
    setSettingsError(null);
    fetch('/api/settings')
      .then((response) => {
        if (!response.ok) throw new Error('Gagal memuat settings');
        return response.json() as Promise<AppSettingsResponse>;
      })
        .then((payload) => {
          if (cancelled) return;
          setSettingsData(payload);
          const draft: Record<string, string> = {};
          for (const [key, field] of Object.entries(payload.settings || {})) {
            if (!field.set) continue;
            if (['GEMINI_API_KEY', 'OPENAI_API_KEY', 'GROQ_API_KEY', 'MISTRAL_API_KEY', 'PPIC_ODATA_PASSWORD', 'PPIC_ODATA_TOKEN'].includes(key)) continue;
            draft[key] = field.value || '';
          }
          setSettingsDraft((current) => ({ ...draft, ...current }));
        })
      .catch((error) => {
        if (!cancelled) setSettingsError(error instanceof Error ? error.message : 'Gagal memuat settings');
      })
      .finally(() => {
        if (!cancelled) setSettingsLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeView]);

  useEffect(() => {
    if (activeView === 'data-detail') return;
    setDetailReturnState(null);
  }, [activeView]);

  useEffect(() => {
    let cancelled = false;
    const prevRange = shiftRangeBack(filters.dateFrom, filters.dateTo);
    if (!['overview', 'compare-period'].includes(activeView) || !prevRange) {
      setCompareSummary(null);
      return () => { cancelled = true; };
    }
    const compareFilters = { ...filters, dateFrom: prevRange.dateFrom, dateTo: prevRange.dateTo };
    fetch(buildDashboardUrl(compareFilters, 'overview'))
      .then((response) => {
        if (!response.ok) throw new Error('Failed to load compare period');
        return response.json() as Promise<DashboardData>;
      })
      .then((payload) => {
        if (!cancelled) setCompareSummary({ previousRange: prevRange, kpis: payload.kpis ?? emptyDashboard.kpis, targetPerformance: payload.targetPerformance ?? [] });
      })
      .catch((error) => console.error(error));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, activeView, filters.dateFrom, filters.dateTo]);

  useEffect(() => {
    let cancelled = false;
    if (!['overview', 'compare-period'].includes(activeView)) return () => { cancelled = true; };
    if (!trendLocalFilters.area && !trendLocalFilters.machine) {
      setLocalTrendRows(null);
      return () => { cancelled = true; };
    }
    fetch(buildTrendUrl(filters, trendLocalFilters))
      .then((response) => {
        if (!response.ok) throw new Error('Failed to load local trend');
        return response.json() as Promise<DashboardData>;
      })
      .then((payload) => {
        if (!cancelled) setLocalTrendRows(payload.trend ?? []);
      })
      .catch((error) => console.error(error));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, trendLocalFilters, activeView]);

  const options = dashboard.options;
  const kpis = dashboard.kpis;
  const compareKpis = compareSummary?.kpis ?? null;
  const comparePreviousTargetTotalPcs = useMemo(
    () => compareSummary ? compareSummary.targetPerformance.reduce((sum, row) => sum + Number(row.prorataTarget || 0), 0) : 0,
    [compareSummary],
  );
  const compareAchievementPct = compareSummary && compareKpis && comparePreviousTargetTotalPcs ? (compareKpis.totalOkQty / comparePreviousTargetTotalPcs) * 100 : 0;
  const comparePages = useMemo(() => {
    if (!compareSummary) return [] as CompareAreaPage[];
    const currentRows = aggregateCompareRows(dashboard.targetPerformance);
    const previousRows = aggregateCompareRows(compareSummary.targetPerformance ?? []);
    const areas = Array.from(new Set([...currentRows.map((row) => row.area), ...previousRows.map((row) => row.area)]));
    const preferredOrder = ['INJECTION', 'BLOWING', 'THERMOFORMING', 'PRINTING'];
    const sortedAreas = areas.sort((a, b) => {
      const ai = preferredOrder.indexOf(normalizeCode(a));
      const bi = preferredOrder.indexOf(normalizeCode(b));
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a.localeCompare(b);
    });

    return sortedAreas.map((area) => {
      const currentAreaRows = currentRows.filter((row) => normalizeCode(row.area) === normalizeCode(area));
      const previousAreaRows = previousRows.filter((row) => normalizeCode(row.area) === normalizeCode(area));
      const current = currentAreaRows.reduce((acc, row) => {
        acc.output += row.output;
        acc.prorataTarget += row.prorataTarget;
        acc.rejectPcsEq += row.rejectPcsEq;
        return acc;
      }, { output: 0, prorataTarget: 0, rejectPcsEq: 0, achievementPct: 0, rejectRatePct: 0 });
      const previous = previousAreaRows.reduce((acc, row) => {
        acc.output += row.output;
        acc.prorataTarget += row.prorataTarget;
        acc.rejectPcsEq += row.rejectPcsEq;
        return acc;
      }, { output: 0, prorataTarget: 0, rejectPcsEq: 0, achievementPct: 0, rejectRatePct: 0 });
      current.achievementPct = current.prorataTarget ? (current.output / current.prorataTarget) * 100 : 0;
      current.rejectRatePct = current.output + current.rejectPcsEq ? (current.rejectPcsEq / (current.output + current.rejectPcsEq)) * 100 : 0;
      previous.achievementPct = previous.prorataTarget ? (previous.output / previous.prorataTarget) * 100 : 0;
      previous.rejectRatePct = previous.output + previous.rejectPcsEq ? (previous.rejectPcsEq / (previous.output + previous.rejectPcsEq)) * 100 : 0;

      const machines = Array.from(new Set([...currentAreaRows.map((row) => row.name), ...previousAreaRows.map((row) => row.name)])).map((name) => {
        const currentRow = currentAreaRows.find((row) => row.name === name) ?? { area, name, output: 0, prorataTarget: 0, rejectPcsEq: 0, achievementPct: 0, rejectRatePct: 0 };
        const previousRow = previousAreaRows.find((row) => row.name === name) ?? { area, name, output: 0, prorataTarget: 0, rejectPcsEq: 0, achievementPct: 0, rejectRatePct: 0 };
        return { name, area, current: currentRow, previous: previousRow };
      }).sort((a, b) => b.current.output - a.current.output || a.name.localeCompare(b.name));

      return { area, current, previous, machines };
    });
  }, [compareSummary, dashboard.targetPerformance]);
  const comparePage = comparePages[comparePageIndex] ?? null;
  const trend = localTrendRows ?? dashboard.trend;
  const byMachine = dashboard.byMachine;
  const byCategory = dashboard.byCategory;
  const byItem = dashboard.byItem;
  const rejectRateByLine = dashboard.rejectRateByLine;
  const targetPerformance = dashboard.targetPerformance;
  const jakartaNow = dashboard.now;
  const detailRows = dashboard.detailRows;
  const downtimeSignals = useMemo(() => {
    return targetPerformance
      .map((row) => {
        const output = Number(row.output || 0);
        const prorataTarget = Number(row.prorataTarget || 0);
        const workHours = Number(row.workHours || 0);
        const rejectPcsEq = Number(row.rejectPcsEq || 0);
        const rejectRatePct = Number(row.rejectRate || 0) * 100;
        const estimatedLossQty = Math.max(0, prorataTarget - output);
        const nominalRatePerHour = row.dailyTarget ? row.dailyTarget / 24 : (prorataTarget > 0 && workHours > 0 ? prorataTarget / workHours : 0);
        const estimatedDowntimeHours = nominalRatePerHour > 0 ? estimatedLossQty / nominalRatePerHour : 0;
        let signalType: DowntimeSignalType = 'minor-stop';
        if (output <= 0 && workHours <= 0) signalType = 'no-runtime';
        else if (rejectPcsEq > 0 && row.rejectRate > Math.max(row.rejectTargetRate, 0)) signalType = 'quality-loss';
        else if (prorataTarget > 0 && row.prorataAchievement < Math.max(row.targetAchievementRate * 0.7, 0.55)) signalType = 'speed-loss';
        const note = signalType === 'no-runtime'
          ? 'Belum ada output dan jam kerja, cek stop total / belum running.'
          : signalType === 'quality-loss'
            ? 'Reject melewati target, cek apakah downtime terkait setting / quality hold.'
            : signalType === 'speed-loss'
              ? 'Output tertinggal dari target prorata, indikasi speed loss / stop berulang.'
              : 'Perlu monitoring, gap output masih ada tapi belum dominan.';
        const priorityScore = estimatedLossQty + (estimatedDowntimeHours * 1000) + (signalType === 'no-runtime' ? 5000 : signalType === 'quality-loss' ? 2500 : signalType === 'speed-loss' ? 1800 : 0);
        return {
          ui_id: row.ui_id,
          area: cleanText(row.area_kerja_line) || 'Tanpa Area',
          machine: cleanText(row.display_laporan) || cleanText(row.kode_asli_sistem) || '-',
          output,
          prorataTarget,
          workHours,
          rejectRatePct,
          rejectPcsEq,
          estimatedLossQty,
          estimatedDowntimeHours,
          signalType,
          status: row.status,
          priorityScore,
          note,
        } satisfies DowntimeSignalRow;
      })
      .sort((a, b) => b.priorityScore - a.priorityScore || b.estimatedLossQty - a.estimatedLossQty || a.machine.localeCompare(b.machine));
  }, [targetPerformance]);
  const downtimeAreaSummary = useMemo(() => {
    const areas = new Map<string, { area: string; machines: number; output: number; rejectPcsEq: number; workHours: number; belowTarget: number; estimatedLossQty: number; estimatedDowntimeHours: number }>();
    downtimeSignals.forEach((row) => {
      if (!areas.has(row.area)) areas.set(row.area, { area: row.area, machines: 0, output: 0, rejectPcsEq: 0, workHours: 0, belowTarget: 0, estimatedLossQty: 0, estimatedDowntimeHours: 0 });
      const item = areas.get(row.area)!;
      item.machines += 1;
      item.output += row.output;
      item.rejectPcsEq += row.rejectPcsEq;
      item.workHours += row.workHours;
      item.estimatedLossQty += row.estimatedLossQty;
      item.estimatedDowntimeHours += row.estimatedDowntimeHours;
      if (row.status === 'under-target' || row.status === 'no-record') item.belowTarget += 1;
    });
    return Array.from(areas.values()).sort((a, b) => b.estimatedLossQty - a.estimatedLossQty || b.belowTarget - a.belowTarget || a.area.localeCompare(b.area));
  }, [downtimeSignals]);
  const downtimeCauseSummary = useMemo(() => {
    const causes = new Map<DowntimeSignalType, { type: DowntimeSignalType; count: number; estimatedLossQty: number; estimatedDowntimeHours: number }>();
    downtimeSignals.forEach((row) => {
      if (!causes.has(row.signalType)) causes.set(row.signalType, { type: row.signalType, count: 0, estimatedLossQty: 0, estimatedDowntimeHours: 0 });
      const item = causes.get(row.signalType)!;
      item.count += 1;
      item.estimatedLossQty += row.estimatedLossQty;
      item.estimatedDowntimeHours += row.estimatedDowntimeHours;
    });
    return Array.from(causes.values()).sort((a, b) => b.estimatedLossQty - a.estimatedLossQty);
  }, [downtimeSignals]);
  const downtimeAttentionRows = useMemo(() => downtimeSignals.slice(0, 8), [downtimeSignals]);
  const downtimeLossChartRows = useMemo(
    () => downtimeSignals.slice(0, 8).map((row) => ({ name: row.machine, value: row.estimatedLossQty, hours: row.estimatedDowntimeHours, signalType: row.signalType, area: row.area })),
    [downtimeSignals],
  );
  const downtimeTotals = useMemo(() => ({
    estimatedLossQty: downtimeSignals.reduce((sum, row) => sum + row.estimatedLossQty, 0),
    estimatedDowntimeHours: downtimeSignals.reduce((sum, row) => sum + row.estimatedDowntimeHours, 0),
    noRuntimeCount: downtimeSignals.filter((row) => row.signalType === 'no-runtime').length,
    qualityLossCount: downtimeSignals.filter((row) => row.signalType === 'quality-loss').length,
  }), [downtimeSignals]);
  const downtimeLossChartHeight = useMemo(() => Math.max(320, downtimeLossChartRows.length * 38 + 72), [downtimeLossChartRows.length]);

  const downtimeEventShiftOptions = useMemo(
    () => Array.from(new Set(downtimeEvents.map((row) => cleanText(row.shift_code, '')).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [downtimeEvents],
  );
  const downtimeEventSummary = useMemo(() => ({
    totalMinutes: downtimeEvents.reduce((sum, row) => sum + Number(row.duration_minutes || 0), 0),
    openCount: downtimeEvents.filter((row) => row.status === 'open').length,
    monitoringCount: downtimeEvents.filter((row) => row.status === 'monitoring').length,
    closedCount: downtimeEvents.filter((row) => row.status === 'closed').length,
    estimatedLossOutput: downtimeEvents.reduce((sum, row) => sum + Number(row.estimated_loss_output || 0), 0),
  }), [downtimeEvents]);
  const downtimeFollowUpRows = useMemo(() => downtimeEvents
    .map((event) => {
      const missingRootCause = !cleanText(event.root_cause, '');
      const missingAction = !cleanText(event.action_taken, '');
      const needsAttention = event.status !== 'closed' || missingRootCause || missingAction;
      const score = (event.status === 'open' ? 3 : event.status === 'monitoring' ? 2 : 0)
        + (missingRootCause ? 1.25 : 0)
        + (missingAction ? 1.25 : 0)
        + Math.min(1, Number(event.duration_minutes || 0) / 180);
      return { event, missingRootCause, missingAction, needsAttention, score };
    })
    .filter((item) => item.needsAttention)
    .sort((a, b) => b.score - a.score || b.event.duration_minutes - a.event.duration_minutes || b.event.event_date.localeCompare(a.event.event_date) || a.event.machine.localeCompare(b.event.machine))
    .slice(0, 8), [downtimeEvents]);
  const downtimeFollowUpSummary = useMemo(() => ({
    total: downtimeEvents.filter((row) => row.status !== 'closed' || !cleanText(row.root_cause, '') || !cleanText(row.action_taken, '')).length,
    openCount: downtimeEvents.filter((row) => row.status === 'open').length,
    monitoringCount: downtimeEvents.filter((row) => row.status === 'monitoring').length,
    missingRootCause: downtimeEvents.filter((row) => !cleanText(row.root_cause, '')).length,
    missingAction: downtimeEvents.filter((row) => !cleanText(row.action_taken, '')).length,
  }), [downtimeEvents]);
  const downtimeTabMeta = useMemo(() => ({
    workflow: '4 menu',
    import: downtimeImportFile ? '1 file' : 'CSV/XLSX',
    input: editingDowntimeEventId ? 'Edit' : 'Baru',
    followup: numberFmt.format(downtimeFollowUpSummary.total),
    table: numberFmt.format(downtimeEvents.length),
    analysis: numberFmt.format(Math.min(8, downtimeSignals.length)),
  } satisfies Record<DowntimePanel, string>), [downtimeEvents.length, downtimeFollowUpSummary.total, downtimeImportFile, editingDowntimeEventId, downtimeSignals.length]);
  const downtimeEventsByMachine = useMemo(() => {
    const map = new Map<string, { total: number; open: number; monitoring: number; closed: number; minutes: number }>();
    downtimeEvents.forEach((event) => {
      const key = normalizeCode(event.machine);
      const current = map.get(key) ?? { total: 0, open: 0, monitoring: 0, closed: 0, minutes: 0 };
      current.total += 1;
      current.minutes += Number(event.duration_minutes || 0);
      if (event.status === 'open') current.open += 1;
      if (event.status === 'monitoring') current.monitoring += 1;
      if (event.status === 'closed') current.closed += 1;
      map.set(key, current);
    });
    return map;
  }, [downtimeEvents]);
  const totalTargetPcs = useMemo(
    () => targetPerformance.reduce((sum, row) => sum + row.prorataTarget, 0),
    [targetPerformance],
  );
  const overallAchievementPct = totalTargetPcs ? (kpis.totalOkQty / totalTargetPcs) * 100 : 0;
  const detailTableMachineOptions = useMemo(
    () => Array.from(new Set(detailRows.map((row) => cleanText(row.display_laporan)).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [detailRows],
  );

  useEffect(() => {
    setComparePageIndex(0);
  }, [comparePages.length, filters.dateFrom, filters.dateTo, activeView]);

  useEffect(() => {
    if (activeView !== 'compare-period' || comparePaused || comparePages.length <= 1) return;
    const timer = window.setInterval(() => {
      setComparePageIndex((current) => (current + 1) % comparePages.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [activeView, comparePaused, comparePages.length]);

  useEffect(() => {
    if (comparePageIndex >= comparePages.length) setComparePageIndex(0);
  }, [comparePageIndex, comparePages.length]);
  const trendAreaOptions = useMemo(
    () => Array.from(new Set(masterTargets.map((row) => cleanText(row.area_kerja_line)).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [masterTargets],
  );
  const trendMachineOptions = useMemo(
    () => Array.from(new Set(masterTargets
      .filter((row) => !trendLocalFilters.area || row.area_kerja_line === trendLocalFilters.area)
      .map((row) => cleanText(row.display_laporan))
      .filter(Boolean),
    )).sort((a, b) => a.localeCompare(b)),
    [masterTargets, trendLocalFilters.area],
  );
  const detailTableSearchTerm = detailTableFilters.search.trim().toLowerCase();
  const debouncedDetailTableSearchTerm = useDebouncedValue(detailTableSearchTerm, 250);
  const sortedDetailRows = useMemo(() => {
    return [...detailRows].sort((a, b) => {
      const left = `${b.posting_date || ''}|${b.document_date || ''}|${b.document_no || ''}|${b.item_no || ''}`;
      const right = `${a.posting_date || ''}|${a.document_date || ''}|${a.document_no || ''}|${a.item_no || ''}`;
      return left.localeCompare(right);
    });
  }, [detailRows]);
  const filteredDetailRows = useMemo(() => {
    return sortedDetailRows.filter((row) => {
      const machine = cleanText(row.display_laporan || row.prod_line_description || row.machine_center_no);
      if (detailTableFilters.machine && machine !== detailTableFilters.machine) return false;
      if (!debouncedDetailTableSearchTerm) return true;
      const haystack = [
        row.posting_date,
        row.description,
        row.item_no,
        row.document_no,
        row.external_document_no,
        row.operator_summary,
        row.item_category_code,
        machine,
      ].join(' ').toLowerCase();
      return haystack.includes(debouncedDetailTableSearchTerm);
    });
  }, [sortedDetailRows, detailTableFilters.machine, debouncedDetailTableSearchTerm]);
  const detailTableTotalPages = Math.max(1, Math.ceil(filteredDetailRows.length / detailTablePageSize));
  const pagedDetailRows = useMemo(() => {
    const start = (detailTablePage - 1) * detailTablePageSize;
    return filteredDetailRows.slice(start, start + detailTablePageSize);
  }, [filteredDetailRows, detailTablePage]);

  useEffect(() => {
    setDetailTablePage(1);
  }, [detailRows, detailTableFilters.machine, activeView]);

  useEffect(() => {
    if (detailTablePage > detailTableTotalPages) {
      setDetailTablePage(detailTableTotalPages);
    }
  }, [detailTablePage, detailTableTotalPages]);

  const trendSummary = useMemo(() => trend.length
    ? {
        avgAchievementPct: trend.reduce((sum, row) => sum + row.achievementPct, 0) / trend.length,
        avgRejectPct: trend.reduce((sum, row) => sum + row.rejectPct, 0) / trend.length,
        peakAchievement: trend.reduce((best, row) => (row.achievementPct > best.achievementPct ? row : best), trend[0]),
        peakReject: trend.reduce((best, row) => (row.rejectPct > best.rejectPct ? row : best), trend[0]),
        totalOkQty: trend.reduce((sum, row) => sum + row.okQty, 0),
        totalRejectPcsEq: trend.reduce((sum, row) => sum + row.rejectPcsEq, 0),
        totalTarget: trend.reduce((sum, row) => sum + row.dailyTarget, 0),
      }
    : null, [trend]);
  const trendAchievementLabel = useMemo(() => makeSparsePercentLabel(trend.length, '#5B7FC2'), [trend.length]);
  const trendRejectLabel = useMemo(() => makeSparsePercentLabel(trend.length, '#C26B5B'), [trend.length]);
  const rejectRateAxisMax = useMemo(() => {
    const max = Math.max(0, ...rejectRateByLine.map((row) => row.value));
    if (max <= 0) return 10;
    if (max < 10) return Math.max(2, Math.ceil(max * 1.35));
    if (max < 25) return Math.ceil((max * 1.2) / 5) * 5;
    return Math.min(100, Math.ceil((max * 1.15) / 10) * 10);
  }, [rejectRateByLine]);
  const targetMachineRows = useMemo(() => {
    const grouped = new Map<string, TargetMachineSummaryRow>();
    for (const row of targetPerformance) {
      const key = cleanText(row.display_laporan);
      const current = grouped.get(key);
      const rejectTargetRate = toNumber(row.target_reject_rate);
      const achievementTargetRate = toNumber(row.target_achievement_rate) || 0.8;
      if (current) {
        current.output += row.output;
        current.workHours += row.workHours;
        current.rejectKg += row.rejectKg;
        current.rejectPcsEq += row.rejectPcsEq;
        current.dailyTarget += row.dailyTarget;
        current.prorataTarget += row.prorataTarget;
        current.productDetails.push({
          name: row.deskripsi_produk,
          targetType: row.active_target_type,
          target: row.dailyTarget,
          output: row.output,
          rejectTargetRate,
          achievementTargetRate,
        });
      } else {
        grouped.set(key, {
          ui_id: row.ui_id,
          area_kerja_line: row.area_kerja_line,
          display_laporan: row.display_laporan,
          productCount: 0,
          productDetails: [{
            name: row.deskripsi_produk,
            targetType: row.active_target_type,
            target: row.dailyTarget,
            output: row.output,
            rejectTargetRate,
            achievementTargetRate,
          }],
          output: row.output,
          workHours: row.workHours,
          rejectKg: row.rejectKg,
          rejectPcsEq: row.rejectPcsEq,
          rejectRate: 0,
          rejectTargetRate: 0,
          rejectTargetLabel: '-',
          rejectStatus: 'no-target',
          targetAchievementRate: achievementTargetRate,
          dailyTarget: row.dailyTarget,
          rangeDays: row.rangeDays,
          prorataTarget: row.prorataTarget,
          achievement: 0,
          prorataAchievement: 0,
          status: 'no-record',
          sortOrder: Number(row.ui_id),
        });
      }
    }

    return Array.from(grouped.values())
      .map((row) => {
        row.productDetails.sort((a, b) => a.name.localeCompare(b.name));
        row.productCount = row.productDetails.length;
        row.rejectRate = rejectRateMetric(row.output, row.rejectPcsEq);
        const weightedRejectTarget = row.productDetails.reduce((sum, detail) => {
          const basis = detail.target || detail.output || 1;
          return sum + (detail.rejectTargetRate * basis);
        }, 0);
        const weightedBasis = row.productDetails.reduce((sum, detail) => sum + (detail.target || detail.output || 1), 0);
        row.rejectTargetRate = weightedBasis ? weightedRejectTarget / weightedBasis : 0;
        const weightedAchievementTarget = row.productDetails.reduce((sum, detail) => {
          const basis = detail.target || detail.output || 1;
          return sum + (detail.achievementTargetRate * basis);
        }, 0);
        row.targetAchievementRate = weightedBasis ? weightedAchievementTarget / weightedBasis : 0.8;
        const uniqueRejectTargets = Array.from(new Set(row.productDetails.map((detail) => detail.rejectTargetRate).filter((value) => value > 0).map((value) => value.toFixed(6))));
        row.rejectTargetLabel = uniqueRejectTargets.length === 0
          ? '-'
          : uniqueRejectTargets.length === 1
            ? `${decimalFmt.format(row.rejectTargetRate * 100)}%`
            : `Mixed (${uniqueRejectTargets.length})`;
        const dailyTargetTotal = row.dailyTarget * (row.rangeDays || 1);
        row.achievement = dailyTargetTotal ? row.output / dailyTargetTotal : 0;
        row.prorataAchievement = row.prorataTarget ? row.output / row.prorataTarget : 0;
        row.status = getTargetStatusForSummary(row.output, row.prorataTarget, row.targetAchievementRate);
        row.rejectStatus = getRejectStatusForSummary(row.rejectRate, row.rejectTargetRate);
        return row;
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [targetPerformance]);
  const targetTableAreaOptions = useMemo(
    () => Array.from(new Set(targetMachineRows.map((row) => cleanText(row.area_kerja_line)).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [targetMachineRows],
  );
  const targetStatusOptions: FilterOption[] = [
    { value: '', label: 'Semua status output' },
    { value: 'no-record', label: 'No Record' },
    { value: 'above-target', label: 'Above Target' },
    { value: 'on-track', label: 'On Track' },
    { value: 'under-target', label: 'Under Target' },
  ];
  const debouncedTargetTableSearchTerm = useDebouncedValue(targetTableFilters.search.trim().toLowerCase(), 250);
  const filteredTargetRows = useMemo(() => {
    return targetMachineRows.filter((row) => {
      if (targetTableFilters.area && row.area_kerja_line !== targetTableFilters.area) return false;
      if (targetTableFilters.status && row.status !== targetTableFilters.status) return false;
      if (!debouncedTargetTableSearchTerm) return true;
      const haystack = [row.area_kerja_line, row.display_laporan, ...row.productDetails.map((detail) => detail.name)].join(' ').toLowerCase();
      return haystack.includes(debouncedTargetTableSearchTerm);
    });
  }, [targetMachineRows, targetTableFilters.area, targetTableFilters.status, debouncedTargetTableSearchTerm]);
  const targetAttentionRows = useMemo(() => {
    return [...filteredTargetRows]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((row) => ({
        name: row.display_laporan,
        achievementPct: row.achievement * 100,
        prorataPct: row.prorataAchievement * 100,
        rejectPct: row.rejectRate * 100,
        output: row.output,
        status: row.status,
        rejectStatus: row.rejectStatus,
      }));
  }, [filteredTargetRows]);
  const targetPriorityChartHeight = useMemo(() => Math.max(360, targetAttentionRows.length * 34 + 90), [targetAttentionRows.length]);
  const targetPriorityAxisMax = useMemo(() => {
    const max = Math.max(100, ...targetAttentionRows.map((row) => row.prorataPct));
    return Math.ceil(Math.min(Math.max(max * 1.12, 110), 180) / 10) * 10;
  }, [targetAttentionRows]);
  const targetSummary = useMemo(() => {
    const noRecord = filteredTargetRows.filter((row) => row.status === 'no-record');
    const underTarget = filteredTargetRows.filter((row) => row.status === 'under-target');
    const onTrack = filteredTargetRows.filter((row) => row.status === 'on-track');
    const aboveTarget = filteredTargetRows.filter((row) => row.status === 'above-target');
    const rejectExceed = filteredTargetRows.filter((row) => row.rejectStatus === 'exceed-target');
    const worstProrata = [...filteredTargetRows].filter((row) => row.status !== 'no-record').sort((a, b) => a.prorataAchievement - b.prorataAchievement)[0];
    return { noRecord, underTarget, onTrack, aboveTarget, rejectExceed, worstProrata };
  }, [filteredTargetRows]);
  const targetAlertCount = targetSummary.noRecord.length + targetSummary.underTarget.length + targetSummary.rejectExceed.length;
  const targetTableTotalPages = Math.max(1, Math.ceil(filteredTargetRows.length / detailTablePageSize));
  const pagedTargetRows = useMemo(() => {
    const start = (targetTablePage - 1) * detailTablePageSize;
    return filteredTargetRows.slice(start, start + detailTablePageSize);
  }, [filteredTargetRows, targetTablePage]);

  useEffect(() => {
    setTargetTablePage(1);
  }, [targetMachineRows, targetTableFilters, activeView]);

  useEffect(() => {
    if (targetTablePage > targetTableTotalPages) {
      setTargetTablePage(targetTableTotalPages);
    }
  }, [targetTablePage, targetTableTotalPages]);

  const syncData = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const previousMaxDate = dashboard.dateRange.max;
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const parts = [payload.error, payload.stderr, payload.stdout, payload.result?.message].filter(Boolean);
        const message = parts.length ? parts.join('\n') : 'Gagal sync data';
        throw new Error(message);
      }
      const refreshed = await loadDashboard(filters, activeView);
      if (
        previousMaxDate &&
        refreshed.dateRange.max &&
        refreshed.dateRange.max > previousMaxDate &&
        filters.dateTo === previousMaxDate &&
        filters.month === previousMaxDate.slice(0, 7)
      ) {
        setFilters((current) => ({
          ...current,
          dateTo: refreshed.dateRange.max,
        }));
      }
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Sync data gagal. Cek env/source OData lalu coba lagi.';
      setSyncError(message);
      window.alert(message);
    } finally {
      setSyncing(false);
    }
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const values = Object.fromEntries(Object.entries(settingsDraft).filter(([, value]) => value !== ''));
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Gagal menyimpan settings');
      setSettingsData(payload);
      window.alert('Settings tersimpan. Beberapa route akan membaca nilai baru pada request berikutnya.');
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'Gagal menyimpan settings');
    } finally {
      setSettingsSaving(false);
    }
  };

  const resetFilters = () => {
    setFilters(getDefaultMonthFilters(dashboard.dateRange));
  };


  useEffect(() => {
    if (activeView !== 'downtime') return;
    setDowntimeEventDrafts((current) => {
      if (!current.length) return [createDowntimeEventDraft({ event_date: downtimeEventDefaultDate })];
      if (current[0].form.event_date) return current;
      return current.map((draft, index) => index === 0 ? { ...draft, form: { ...draft.form, event_date: downtimeEventDefaultDate } } : draft);
    });
  }, [activeView, downtimeEventDefaultDate]);

  const resetMasterForm = () => {
    setEditingMasterId(null);
    setMasterForm(emptyMasterForm);
  };

  const saveMasterEntity = async () => {
    if (!masterForm.kode_asli_sistem || !masterForm.area_kerja_line) return;
    const optimisticId = editingMasterId ?? `${normalizeCode(masterForm.kode_asli_sistem)}__${Date.now()}`;
    const optimisticRow = buildMasterEntityRow(masterForm, optimisticId);

    if (editingMasterId) {
      setMasterTargets((current) => current.map((row) => row.ui_id === editingMasterId ? optimisticRow : row));
    } else {
      setMasterTargets((current) => [optimisticRow, ...current]);
    }

    const endpoint = editingMasterId ? `/api/master-entity/${editingMasterId}` : '/api/master-entity';
    const method = editingMasterId ? 'PUT' : 'POST';
    const response = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(masterForm),
    });
    if (!response.ok) throw new Error('Gagal menyimpan master entity ke SQLite');
    const payload = await response.json() as { data: MasterEntityRow };
    setMasterTargets((current) => {
      if (editingMasterId) return current.map((row) => row.ui_id === editingMasterId ? payload.data : row);
      return current.map((row) => row.ui_id === optimisticId ? payload.data : row);
    });
    await loadDashboard(filters);
    resetMasterForm();
  };

  const startEditMasterEntity = (row: MasterEntityRow) => {
    setEditingMasterId(row.ui_id);
    setMasterForm(formFromRow(row));
    setActiveView('master-entity');
  };

  const deleteMasterEntity = async (ui_id: string) => {
    if (!window.confirm('Hapus master entity ini?')) return;
    const beforeDelete = masterTargets;
    setMasterTargets((current) => current.filter((row) => row.ui_id !== ui_id));
    if (editingMasterId === ui_id) resetMasterForm();
    const response = await fetch(`/api/master-entity/${ui_id}`, { method: 'DELETE' });
    if (!response.ok) {
      setMasterTargets(beforeDelete);
      throw new Error('Gagal menghapus master entity dari SQLite');
    }
    await loadDashboard(filters);
  };

  const resetDowntimeEventForm = () => {
    setEditingDowntimeEventId(null);
    setDowntimeEventDrafts([createDowntimeEventDraft({ event_date: downtimeEventDefaultDate })]);
  };

  const updateDowntimeDraft = (ui_id: string, patch: Partial<DowntimeEventForm>) => {
    setDowntimeEventDrafts((current) => current.map((item) => item.ui_id === ui_id ? { ...item, form: { ...item.form, ...patch } } : item));
  };

  const pickDowntimeSignal = (row: DowntimeSignalRow) => {
    setDowntimePanel('input');
    setDowntimeEventDrafts((current) => [{
      ui_id: createDowntimeEventDraft().ui_id,
      editingId: null,
      form: createDowntimeEventDraft({
        event_date: current[0]?.form.event_date || downtimeEventDefaultDate,
        area: row.area,
        machine: row.machine,
        line: row.machine,
        estimated_loss_output: row.estimatedLossQty ? String(Math.round(row.estimatedLossQty)) : '',
        linked_signal_type: row.signalType,
        category: row.signalType === 'quality-loss' ? 'qc-hold' : row.signalType === 'speed-loss' ? 'minor-stop' : row.signalType === 'no-runtime' ? 'machine-trouble' : 'machine-trouble',
        root_cause: row.note,
      }).form,
    }]);
    setEditingDowntimeEventId(null);
    scrollToSection('downtime-panel-content');
  };

  const addDowntimeEventDraft = () => {
    setDowntimeEventDrafts((current) => {
      const previous = current[current.length - 1]?.form ?? current[0]?.form ?? createDowntimeEventDraft({ event_date: downtimeEventDefaultDate }).form;
      return [
        ...current,
        createDowntimeEventDraft({
          event_date: previous.event_date || downtimeEventDefaultDate,
          start_time: previous.start_time || getJakartaNowTime(),
          end_time: previous.end_time || getJakartaNowTime(),
          shift_code: previous.shift_code || getDefaultDowntimeShiftCode(),
          area: previous.area,
          category: previous.category,
        }),
      ];
    });
  };

  const removeDowntimeEventDraft = (ui_id: string) => {
    setDowntimeEventDrafts((current) => {
      if (current.length <= 1) return current;
      const removed = current.find((draft) => draft.ui_id === ui_id);
      const next = current.filter((draft) => draft.ui_id !== ui_id);
      if (removed?.editingId && removed.editingId === editingDowntimeEventId) {
        setEditingDowntimeEventId(null);
      }
      return next.length ? next : [createDowntimeEventDraft({ event_date: downtimeEventDefaultDate })];
    });
  };

  const saveDowntimeEvents = async () => {
    if (!downtimeEventDrafts.length) {
      window.alert('Minimal ada 1 card event downtime.');
      return;
    }
    setSavingDowntimeEvent(true);
    try {
      for (let index = 0; index < downtimeEventDrafts.length; index += 1) {
        const draft = downtimeEventDrafts[index];
        const form = draft.form;
        const normalizedShiftCode = form.shift_code || 'Shift 1';
        const shiftIsValid = downtimeShiftChoices.some((option) => option.value === normalizedShiftCode);
        if (!form.event_date || !shiftIsValid || !form.area || !form.machine || !form.start_time || !form.end_time) {
          window.alert(`Card ${index + 1}: tanggal, shift, area, mesin, start, dan end downtime wajib diisi.`);
          return;
        }
      }
      for (const draft of downtimeEventDrafts) {
        const form = draft.form;
        const normalizedShiftCode = form.shift_code || 'Shift 1';
        const normalizedForm = {
          ...form,
          shift_code: normalizedShiftCode,
        };
        const duration = normalizedForm.duration_minutes !== '' && normalizedForm.duration_minutes !== null && normalizedForm.duration_minutes !== undefined
          ? String(form.duration_minutes)
          : String(minutesBetween(normalizedForm.event_date, normalizedForm.start_time, normalizedForm.end_time));
        const endpoint = draft.editingId ? `/api/downtime-events/${draft.editingId}` : '/api/downtime-events';
        const response = await fetch(endpoint, {
          method: draft.editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...normalizedForm, duration_minutes: duration }),
        });
        if (!response.ok) throw new Error('Gagal menyimpan downtime event');
      }
      await loadDowntimeEvents(filters, downtimeEventFilters);
      resetDowntimeEventForm();
    } catch (error) {
      console.error(error);
      window.alert('Downtime event gagal disimpan. Cek input lalu coba lagi.');
    } finally {
      setSavingDowntimeEvent(false);
    }
  };

  const editDowntimeEvent = (row: DowntimeEventRow) => {
    setDowntimePanel('input');
    setEditingDowntimeEventId(row.id);
    setDowntimeEventDrafts([draftFromDowntimeEvent(row)]);
    scrollToSection('downtime-panel-content');
  };

  const deleteDowntimeEvent = async (id: string) => {
    if (!window.confirm('Hapus event downtime ini?')) return;
    const response = await fetch(`/api/downtime-events/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Gagal menghapus downtime event');
    await loadDowntimeEvents(filters, downtimeEventFilters);
    if (editingDowntimeEventId === id) resetDowntimeEventForm();
  };

  const isDowntimeImportFileAllowed = (file: File) => /\.(csv|xlsx)$/i.test(file.name) || file.type === 'text/csv' || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  const setDowntimeImportSelectedFile = (file: File | null) => {
    if (file && !isDowntimeImportFileAllowed(file)) {
      setDowntimeImportError('Gunakan file CSV atau XLSX.');
      setDowntimeImportFile(null);
      return;
    }
    setDowntimeImportError(null);
    setDowntimeImportResult(null);
    setDowntimeImportFile(file);
  };

  const uploadDowntimeBackfill = async () => {
    if (!downtimeImportFile) {
      setDowntimeImportError('Pilih file CSV atau XLSX dulu.');
      return;
    }
    setDowntimeImporting(true);
    setDowntimeImportError(null);
    try {
      const formData = new FormData();
      formData.append('file', downtimeImportFile);
      formData.append('mode', downtimeImportMode);
      const response = await fetch('/api/downtime-events/import', { method: 'POST', body: formData });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Gagal import downtime');
      }
      setDowntimeImportResult(payload.data ?? null);
      setDowntimeImportFile(null);
      await loadDowntimeEvents(filters, downtimeEventFilters);
    } catch (error) {
      console.error(error);
      setDowntimeImportError(error instanceof Error ? error.message : 'Import downtime gagal.');
    } finally {
      setDowntimeImporting(false);
    }
  };

  const downloadDowntimeTemplate = async (format: 'csv' | 'xlsx') => {
    try {
      const response = await fetch(`/api/downtime-events/import/template?format=${format}`);
      if (!response.ok) throw new Error('Gagal mengambil template downtime');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `downtime-backfill-template.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      setDowntimeImportError(error instanceof Error ? error.message : 'Download template gagal.');
    }
  };

  const parseDowntimeWaText = async (shouldImport = false) => {
    if (!downtimeWaText.trim()) {
      setDowntimeWaError('Paste laporan WA dulu.');
      return;
    }
    const effectiveImport = shouldImport && downtimeWaViewMode === 'full';
    setDowntimeWaParsing(true);
    setDowntimeWaError(null);
    try {
      const response = await fetch('/api/downtime-events/import/wa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: downtimeWaText, mode: downtimeImportMode, import: effectiveImport, parserMode: downtimeWaParserMode, aiProvider: downtimeWaAiProvider }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Parser WA gagal.');
      const nextResult = canonicalizeDowntimeWaResult(applyDowntimeWaAliases(payload.data ?? null, downtimeWaAliasOverrides));
      setDowntimeWaResult(nextResult);
      setDowntimeWaBaselineRows(nextResult?.rows ? nextResult.rows.map((row) => ({ ...row })) : []);
      cancelEditingDowntimeWaRow();
      if (effectiveImport) {
        await loadDowntimeEvents(buildDowntimeRefreshFilters(nextResult?.rows), downtimeEventFilters);
        setDowntimeImportResult(payload.data ? {
          source: 'copas-wa',
          mode: payload.data.mode,
          parserMode: payload.data.parserMode,
          aiProvider: payload.data.aiProvider,
          aiProviderUsed: payload.data.aiProviderUsed,
          processedRows: payload.data.processedRows ?? payload.data.parsedRows ?? 0,
          savedRows: payload.data.savedRows ?? 0,
          skippedRows: payload.data.skippedRows ?? 0,
          total: payload.data.total ?? 0,
          message: payload.data.message,
        } : null);
      }
    } catch (error) {
      console.error(error);
      setDowntimeWaError(error instanceof Error ? error.message : 'Parser WA gagal.');
    } finally {
      setDowntimeWaParsing(false);
    }
  };

  const importParsedWaResult = async () => {
    if (!downtimeWaResult?.rows?.length) return;
    setDowntimeWaSaving(true);
    setDowntimeWaError(null);
    try {
      const response = await fetch('/api/downtime-events/import/wa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          import: true,
          mode: downtimeImportMode,
          parserMode: downtimeWaParserMode,
          aiProvider: downtimeWaAiProvider,
          aiUsed: downtimeWaResult.aiUsed,
          aiModel: downtimeWaResult.aiModel,
          aiProviderUsed: downtimeWaResult.aiProviderUsed,
          processedLines: downtimeWaResult.processedLines,
          notes: downtimeWaResult.notes || [],
          rows: downtimeWaResult.rows,
          structuredRows: downtimeWaResult.structuredRows || [],
          productionRows: downtimeWaResult.productionRows || [],
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Gagal import hasil WA');
      setDowntimeImportResult(payload.data ?? null);
      if (downtimeWaResult?.rows?.length) setDowntimeWaBaselineRows(downtimeWaResult.rows.map((row) => ({ ...row })));
      cancelEditingDowntimeWaRow();
      await loadDowntimeEvents(buildDowntimeRefreshFilters(downtimeWaResult.rows), downtimeEventFilters);
      if (payload.data) {
        setDowntimeWaResult((prev) => prev ? ({ ...prev, savedRows: payload.data.savedRows }) : prev);
      }
    } catch (error) {
      console.error(error);
      setDowntimeWaError(error instanceof Error ? error.message : 'Import hasil WA gagal.');
    } finally {
      setDowntimeWaSaving(false);
    }
  };

  const exportFiltered = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      if (activeView === 'data-detail') {
        exportCsv(filteredDetailRows, 'ppic-resume-harian-filtered.csv');
        return;
      }

      const response = await fetch(buildDashboardUrl(filters, 'data-detail'));
      if (!response.ok) throw new Error('Gagal menyiapkan export detail');
      const payload = await response.json() as DashboardData;
      exportCsv(payload.detailRows ?? [], 'ppic-resume-harian-filtered.csv');
    } finally {
      setExporting(false);
    }
  };
  const exportMasterTargets = () => exportCsv(masterTargets, 'master-entity-target-produksi.csv');

  const aiProviderCheckConfig: Record<AiProviderKey, { label: string; apiKeyKey: string; modelKey: string; baseUrlKey?: string }> = {
    gemini: { label: 'Gemini', apiKeyKey: 'GEMINI_API_KEY', modelKey: 'GEMINI_MODEL' },
    openai: { label: 'OpenAI', apiKeyKey: 'OPENAI_API_KEY', modelKey: 'WA_PARSER_AI_MODEL', baseUrlKey: 'OPENAI_BASE_URL' },
    groq: { label: 'Groq', apiKeyKey: 'GROQ_API_KEY', modelKey: 'GROQ_MODEL' },
    mistral: { label: 'Mistral', apiKeyKey: 'MISTRAL_API_KEY', modelKey: 'MISTRAL_MODEL' },
  };

  const checkApiKey = async (provider: AiProviderKey) => {
    const config = aiProviderCheckConfig[provider];
    const hasApiKeyDraft = Object.prototype.hasOwnProperty.call(settingsDraft, config.apiKeyKey);
    const hasModelDraft = Object.prototype.hasOwnProperty.call(settingsDraft, config.modelKey);
    const hasBaseUrlDraft = config.baseUrlKey ? Object.prototype.hasOwnProperty.call(settingsDraft, config.baseUrlKey) : false;
    const apiKey = hasApiKeyDraft ? settingsDraft[config.apiKeyKey] : undefined;
    const model = hasModelDraft ? settingsDraft[config.modelKey] : undefined;
    const baseUrl = config.baseUrlKey && hasBaseUrlDraft ? settingsDraft[config.baseUrlKey] : undefined;
    setCheckingApiKey(provider);
    setSettingsError(null);
    try {
      const response = await fetch('/api/settings/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          ...(hasApiKeyDraft ? { apiKey } : {}),
          ...(hasModelDraft ? { model } : {}),
          ...(config.baseUrlKey && hasBaseUrlDraft ? { baseUrl } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Gagal cek API key');
      setApiKeyCheckResults((current) => ({ ...current, [provider]: payload as ApiKeyCheckResult }));
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : `Gagal cek API key ${config.label}`);
    } finally {
      setCheckingApiKey(null);
    }
  };

  return (
    <SidebarProvider>
      <main className="app-shell">
        <DashboardSidebar
          activeView={activeView}
          onChangeView={setActiveView}
          downtimePanel={downtimePanel}
          onChangeDowntimePanel={setDowntimePanel}
          settingsPanel={settingsPanel}
          onChangeSettingsPanel={setSettingsPanel}
          filters={filters}
          onFiltersChange={setFilters}
          onReset={resetFilters}
          onExport={activeView === 'master-entity' ? exportMasterTargets : exportFiltered}
          options={options}
          dateRange={dashboard.dateRange}
          syncStatus={dashboard.syncStatus ? {
            source: dashboard.syncStatus.source,
            sourceKind: dashboard.syncStatus.sourceKind,
            status: dashboard.syncStatus.status,
            finishedAt: dashboard.syncStatus.finishedAt,
            rowCount: dashboard.syncStatus.rowCount,
            message: dashboard.syncStatus.message,
          } : null}
          syncing={syncing}
          onSync={syncData}
          rowsCount={activeView === 'master-entity' ? masterTargets.length : dashboard.rowCounts.all}
          totalRowsCount={activeView === 'master-entity' ? masterTargets.length : dashboard.rowCounts.total}
          showFilters={activeView !== 'master-entity' && activeView !== 'settings'}
        />
        <SidebarInset>
          <header className="topbar">
            <div className="topbar-left">
              <span className="topbar-mobile-trigger"><SidebarTrigger /></span>
              <div className="topbar-title-block">
                <p className="eyebrow">PPIC Output Dashboard · Prototype</p>
                <div className="topbar-title-row">
                  <h1>{activeView === 'master-entity' ? 'Data Mesin & Target' : activeView === 'data-detail' ? 'Detail Produksi Harian' : activeView === 'downtime' ? 'Gangguan Produksi' : activeView === 'compare-period' ? 'Bandingkan Periode' : activeView === 'settings' ? 'Pengaturan Sistem' : 'Ringkasan Produksi'}</h1>
                  {activeView === 'data-detail' ? (
                    <button className="btn secondary topbar-back-btn" type="button" onClick={backFromDetail}>
                      <RotateCcw size={16} />
                      <span>{detailReturnState?.view === 'overview' ? 'Kembali ke Ringkasan' : 'Kembali'}</span>
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            <button
              className="btn ghost topbar-export-btn"
              onClick={activeView === 'master-entity' ? exportMasterTargets : exportFiltered}
              disabled={exporting || activeView === 'settings' || (activeView === 'master-entity' ? !masterTargets.length : activeView === 'data-detail' ? !filteredDetailRows.length : !dashboard.rowCounts.all)}
              aria-label="Export CSV"
              title="Export CSV"
            >
              <Download size={16}/><span className="btn-label">{exporting ? 'Exporting...' : 'Export'}</span>
            </button>
          </header>

          <section className="main">
            {(activeView === 'overview' || activeView === 'downtime') ? (
              <OverviewDashboardSection
                activeView={activeView}
                downtimePanel={downtimePanel}
                loading={loading}
                kpis={kpis}
                totalTargetPcs={totalTargetPcs}
                overallAchievementPct={overallAchievementPct}
                trend={trend}
                trendSummary={trendSummary}
                trendLocalFilters={trendLocalFilters}
                setTrendLocalFilters={setTrendLocalFilters}
                trendAreaOptions={trendAreaOptions}
                trendMachineOptions={trendMachineOptions}
                byMachine={byMachine}
                byItem={byItem}
                byCategory={byCategory}
                rejectRateByLine={rejectRateByLine}
                rejectRateAxisMax={rejectRateAxisMax}
                targetSummary={targetSummary}
                targetAlertCount={targetAlertCount}
                targetRows={targetAttentionRows}
                targetTableFilters={targetTableFilters}
                setTargetTableFilters={setTargetTableFilters}
                targetTableAreaOptions={targetTableAreaOptions}
                targetStatusOptions={targetStatusOptions}
                pagedTargetRows={pagedTargetRows}
                targetTablePage={targetTablePage}
                targetTableTotalPages={targetTableTotalPages}
                setTargetTablePage={setTargetTablePage}
                targetPriorityAxisMax={targetPriorityAxisMax}
                targetPriorityChartHeight={targetPriorityChartHeight}
                targetBarColor={getTargetBarColor as any}
                openDetailDrilldown={openDetailDrilldown}
                openTargetDrilldown={openTargetDrilldown}
                downtimeLossChartRows={downtimeLossChartRows}
                downtimeLossChartHeight={downtimeLossChartHeight}
                downtimeCauseSummary={downtimeCauseSummary}
                downtimeSignalColor={downtimeSignalColor as any}
                downtimeSignalLabel={downtimeSignalLabel as any}
              />
            ) : null}
            {activeView === 'downtime' && downtimePanel !== 'analysis' ? (
              <section className="card pad downtime-panel-card" id="downtime-panel-content">
                <div className="chart-head">
                  <div>
                    <h2>Gangguan Produksi · {downtimePanelLabels[downtimePanel]}</h2>
                    <p>{downtimePanelGuides[downtimePanel].subtitle}</p>
                  </div>
                </div>

                <section className="card pad soft-card downtime-guide-card">
                  <div className="chart-head downtime-guide-head">
                    <div>
                      <h3>{downtimePanelGuides[downtimePanel].title}</h3>
                      <p>{downtimePanelGuides[downtimePanel].next}</p>
                    </div>
                    <div className="onboarding-chip">Fokus saat ini</div>
                  </div>
                  <div className="downtime-guide-grid">
                    {downtimePanelGuides[downtimePanel].steps.map((step) => (
                      <div key={step.title} className="downtime-guide-step">
                        <strong>{step.title}</strong>
                        <span>{step.text}</span>
                      </div>
                    ))}
                  </div>
                </section>

                {downtimePanel === 'workflow' ? (
                  <>
                    <div className="metric-row">
                      <MetricPill label="Event downtime" value={numberFmt.format(downtimeEvents.length)} hint="Total sesuai filter" />
                      <MetricPill label="Open" value={numberFmt.format(downtimeEventSummary.openCount)} hint="Belum selesai" />
                      <MetricPill label="Monitoring" value={numberFmt.format(downtimeEventSummary.monitoringCount)} hint="Masih dipantau" />
                      <MetricPill label="Follow up" value={numberFmt.format(downtimeFollowUpSummary.total)} hint="Butuh root cause/action" />
                      <MetricPill label="Estimasi loss" value={numberFmt.format(Math.round(downtimeTotals.estimatedLossQty))} hint={`${decimalFmt.format(downtimeTotals.estimatedDowntimeHours)} jam`} />
                    </div>
                    <div className="detail-table-scroll downtime-workflow-scroll">
                      <table className="detail-table downtime-priority-table">
                        <thead><tr><th>Prioritas Mesin</th><th>Signal</th><th className="num">Gap Output</th><th className="num">Estimasi Jam</th><th className="num">Reject</th><th>Event Terkait</th><th>Catatan</th><th>Aksi</th></tr></thead>
                        <tbody>{downtimeAttentionRows.length ? downtimeAttentionRows.map((row) => {
                          const linked = downtimeEventsByMachine.get(normalizeCode(row.machine));
                          return <tr key={`${row.area}-${row.machine}`} className={`downtime-signal-${row.signalType}`}><td><div className="machine-product-cell"><strong>{row.machine}</strong><span>{row.area}</span></div></td><td><span className={`status-badge ${row.status}`}>{downtimeSignalLabel(row.signalType)}</span></td><td className="num">{numberFmt.format(Math.round(row.estimatedLossQty))}</td><td className="num">{decimalFmt.format(row.estimatedDowntimeHours)}</td><td className="num">{decimalFmt.format(row.rejectRatePct)}%</td><td>{linked ? <><strong>{linked.total} event</strong><br/><span className="muted">Open {linked.open} · Monitor {linked.monitoring} · {decimalFmt.format(linked.minutes)} menit</span></> : <span className="muted">Belum ada event</span>}</td><td>{row.note}</td><td><button className="btn secondary table-mini-btn" type="button" onClick={() => pickDowntimeSignal(row)}>Input downtime</button></td></tr>;
                        }) : <tr><td colSpan={8}><div className="empty guided-empty table-empty"><strong>Belum ada mesin prioritas</strong><p>Data saat ini belum menunjukkan gap output/downtime. Jika filter terlalu sempit, coba ganti periode atau area.</p></div></td></tr>}</tbody>
                      </table>
                    </div>
                  </>
                ) : null}

                {downtimePanel === 'import' ? (
                  <div className="downtime-import-grid">
                    <section className="card pad soft-card">
                      <h3>Import File Downtime</h3>
                      <p className="muted">Upload CSV/XLSX backfill. Gunakan append untuk default aman, lalu cocokkan dengan data downtime yang sudah ada sebelum replace.</p>
                      <div className="detail-table-toolbar-group">
                        <button className="btn secondary" type="button" onClick={() => downloadDowntimeTemplate('csv')}>Template CSV</button>
                        <button className="btn secondary" type="button" onClick={() => downloadDowntimeTemplate('xlsx')}>Template XLSX</button>
                      </div>
                      <input type="file" accept=".csv,.xlsx" onChange={(event) => setDowntimeImportSelectedFile(event.target.files?.[0] ?? null)} />
                      <select className="detail-table-select" value={downtimeImportMode} onChange={(event) => setDowntimeImportMode(event.target.value as 'append' | 'replace')}>
                        <option value="append">Append / tambah aman</option>
                        <option value="replace">Replace downtime events</option>
                      </select>
                      <button className="btn primary" type="button" onClick={uploadDowntimeBackfill} disabled={downtimeImporting || !downtimeImportFile}>{downtimeImporting ? 'Importing...' : 'Import File'}</button>
                      <p className="muted">Data existing saat ini: {numberFmt.format(downtimeEvents.length)} event downtime. Import akan dibandingkan dengan data ini saat save.</p>
                    </section>
                    <section className="card pad soft-card">
                      <h3>Copas WA Parser</h3>
                      <p className="muted">Preview dulu sebelum simpan. Hybrid sekarang AI-first, rules jadi guardrail/fallback, dan hasilnya tetap bisa dicek terhadap data existing.</p>
                      <div className="detail-table-toolbar-group">
                        <select className="detail-table-select" value={downtimeWaViewMode} onChange={(event) => setDowntimeWaViewMode(event.target.value as 'full' | 'output-only')}><option value="output-only">Output Saja</option><option value="full">Full + bisa save</option></select>
                        <select className="detail-table-select" value={downtimeWaParserMode} onChange={(event) => setDowntimeWaParserMode(event.target.value as 'rules' | 'ai' | 'hybrid')}><option value="hybrid">Hybrid AI-first</option><option value="rules">Rules</option><option value="ai">AI</option></select>
                        <select className="detail-table-select" value={downtimeWaAiProvider} onChange={(event) => setDowntimeWaAiProvider(event.target.value as 'gemini' | 'openai' | 'groq' | 'mistral')}>
                          <option value="gemini">Gemini</option>
                          <option value="openai">OpenAI</option>
                          <option value="groq">Groq</option>
                          <option value="mistral">Mistral</option>
                        </select>
                      </div>
                      <textarea className="downtime-wa-textarea" value={downtimeWaText} onChange={(event) => setDowntimeWaText(event.target.value)} placeholder="Paste laporan WhatsApp di sini..." rows={8} />
                      <div className="detail-table-toolbar-group">
                        <button className="btn primary" type="button" onClick={() => parseDowntimeWaText(false)} disabled={downtimeWaParsing}>{downtimeWaParsing ? 'Parsing...' : 'Preview Parse'}</button>
                        <button className="btn secondary" type="button" onClick={importParsedWaResult} disabled={downtimeWaSaving || !downtimeWaResult?.rows?.length}>{downtimeWaSaving ? 'Saving...' : 'Save Parsed Result'}</button>
                      </div>
                    </section>
                    {(downtimeImportError || downtimeWaError) ? <div className="error-box">{downtimeImportError || downtimeWaError}</div> : null}
                    {downtimeImportResult ? <div className="success-box">{downtimeImportResult.message} · saved {numberFmt.format(downtimeImportResult.savedRows || 0)} row{downtimeImportResult.insertedRows !== undefined || downtimeImportResult.updatedRows !== undefined || downtimeImportResult.existingRows !== undefined ? ` · new ${numberFmt.format(downtimeImportResult.insertedRows || 0)} · update ${numberFmt.format(downtimeImportResult.updatedRows || 0)} · existing ${numberFmt.format(downtimeImportResult.existingRows || 0)}` : ''}</div> : null}
                    {downtimeWaResult ? (
                      <section className="card pad soft-card downtime-preview-card">
                        <div className="chart-head">
                          <div>
                            <h3>Preview Parse WA</h3>
                            <p className="muted">Provider: {formatAiChain(downtimeWaResult)} · contract {downtimeWaResult.parserContractVersion || downtimeWaResult.parserMeta?.contractVersion || '-'} · alias registry {numberFmt.format(downtimeWaResult.parserMeta?.aliasRegistrySize || 0)} · parsed {numberFmt.format(downtimeWaResult.rows?.length || 0)} downtime row · structured {numberFmt.format(downtimeWaResult.structuredRows?.length || 0)} row · output {numberFmt.format(downtimeWaResult.productionRows?.length || 0)} row · existing scan {numberFmt.format(downtimeWaResult.existingRowsScanned || 0)} row</p>
                            <p className="muted">AI-first dipakai untuk bersihin data, lalu raw truth tetap disimpan di `machine_raw` dan `source_line` untuk audit.</p>
                          </div>
                          <div className="detail-table-toolbar-group">
                            <button className="btn secondary table-mini-btn" type="button" onClick={downloadParsedWaCsv} disabled={!downtimeWaResult.structuredRows?.length}>Download CSV</button>
                            <button className="btn secondary table-mini-btn" type="button" onClick={() => setDowntimeWaResult(canonicalizeDowntimeWaResult(downtimeWaResult))}>Re-normalize</button>
                          </div>
                        </div>

                        {(downtimeWaResult.quality || downtimeWaResult.notes?.length || downtimeWaResult.duplicateHints?.length || downtimeWaPreviewDiff.length) ? (
                          <div className="downtime-review-grid">
                            {summarizeDowntimeWaQuality(downtimeWaResult.quality)}
                            {downtimeWaResult.notes?.length ? <div className="warning-box"><strong>Catatan parser</strong><ul>{downtimeWaResult.notes.slice(0, 8).map((note, index) => <li key={index}>{note}</li>)}</ul></div> : null}
                            {downtimeWaResult.duplicateHints?.length ? (
                              <div className="warning-box">
                                <strong>Conflict preview dengan data existing</strong>
                                <div className="compare-summary-grid downtime-conflict-summary">
                                  <div className="compare-summary-card">
                                    <span>Total conflict</span>
                                    <strong>{numberFmt.format(downtimeWaConflictSummary?.totalCount || 0)}</strong>
                                    <em>{numberFmt.format(downtimeWaConflictSummary?.affectedRowCount || 0)} row terdampak</em>
                                  </div>
                                  <div className="compare-summary-card">
                                    <span>Existing match</span>
                                    <strong>{numberFmt.format(downtimeWaConflictSummary?.existingCount || 0)}</strong>
                                    <em>Match ke data downtime yang sudah tersimpan</em>
                                  </div>
                                  <div className="compare-summary-card">
                                    <span>Internal duplicate</span>
                                    <strong>{numberFmt.format(downtimeWaConflictSummary?.internalCount || 0)}</strong>
                                    <em>Baris ganda di hasil parse yang sama</em>
                                  </div>
                                </div>
                                <div className="downtime-conflict-lists">
                                  {downtimeWaResult.duplicateHints.filter((hint) => hint.kind === 'existing').length ? (
                                    <div>
                                      <span className="muted">Match existing</span>
                                      <ul>{downtimeWaResult.duplicateHints.filter((hint) => hint.kind === 'existing').slice(0, 6).map((hint, index) => <li key={`existing-${index}`}>row {hint.row_index + 1} · {hint.machine} · {hint.start_time}-{hint.end_time} · {hint.reason}{hint.duplicate_key ? <><br/><span className="muted">{hint.duplicate_key}</span></> : null}</li>)}</ul>
                                    </div>
                                  ) : null}
                                  {downtimeWaResult.duplicateHints.filter((hint) => hint.kind === 'internal').length ? (
                                    <div>
                                      <span className="muted">Duplikat internal</span>
                                      <ul>{downtimeWaResult.duplicateHints.filter((hint) => hint.kind === 'internal').slice(0, 6).map((hint, index) => <li key={`internal-${index}`}>row {hint.row_index + 1} · {hint.machine} · {hint.start_time}-{hint.end_time} · {hint.reason}<br/><span className="muted">{hint.duplicate_key}</span></li>)}</ul>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
                            {downtimeWaPreviewDiff.length ? <div className="success-box"><strong>Perubahan normalisasi</strong><ul>{downtimeWaPreviewDiff.slice(0, 8).map((item, index) => <li key={index}>Row {item.index + 1}: {item.changed.join(', ')}</li>)}</ul></div> : null}
                          </div>
                        ) : null}

                        <div className="downtime-alias-box">
                          <div className="detail-table-toolbar-group">
                            <select className="detail-table-select" value={downtimeWaAliasAreaScope} onChange={(e) => setDowntimeWaAliasAreaScope(e.target.value)}>
                              <option value="">Semua area</option>
                              <option value="PRINTING">PRINTING</option>
                              <option value="THERMOFORMING">THERMOFORMING</option>
                            </select>
                            <input className="detail-table-input" value={downtimeWaAliasSource} onChange={(e) => setDowntimeWaAliasSource(e.target.value)} placeholder="Alias dari WA, mis. HF 01" />
                            <input className="detail-table-input" value={downtimeWaAliasTarget} onChange={(e) => setDowntimeWaAliasTarget(e.target.value)} placeholder="Master mesin, mis. Hengfeng 1" />
                            <button className="btn secondary table-mini-btn" type="button" onClick={() => {
                              const key = downtimeWaAliasScopeKey(downtimeWaAliasAreaScope, downtimeWaAliasSource);
                              if (!key || !downtimeWaAliasTarget.trim()) return;
                              commitDowntimeWaAliases({ ...downtimeWaAliasOverrides, [key]: downtimeWaAliasTarget.trim() });
                              setDowntimeWaAliasSource('');
                              setDowntimeWaAliasTarget('');
                            }}>Simpan Alias</button>
                          </div>
                          {downtimeWaAliasSuggestions.length ? <div className="detail-table-toolbar-group">{downtimeWaAliasSuggestions.slice(0, 6).map((suggestion) => <button key={`${suggestion.area}|${suggestion.source}|${suggestion.target}`} className="btn secondary table-mini-btn" type="button" onClick={() => commitDowntimeWaAliases({ ...downtimeWaAliasOverrides, [downtimeWaAliasScopeKey(suggestion.area, suggestion.source)]: suggestion.target })}>Alias {suggestion.source} → {suggestion.target}</button>)}</div> : null}
                        </div>

                        {downtimeWaResult.structuredRows?.length ? (
                          <details className="table-disclosure" open>
                            <summary><span>Structured Output Preview</span><em>{numberFmt.format(downtimeWaResult.structuredRows.length)} row · buka jika perlu cek hasil teknis</em></summary>
                            <div className="detail-table-scroll downtime-wa-table-wrap">
                              <table className="detail-table downtime-wa-table">
                                <thead><tr><th>Tanggal</th><th>Shift</th><th>Area</th><th>Machine Master</th><th>Start</th><th>End</th><th className="num">Durasi</th><th>Reason</th><th>Action</th><th>Condition</th><th>Confidence</th></tr></thead>
                                <tbody>{downtimeWaResult.structuredRows.slice(0, 100).map((row, index) => {
                                  const machineMasterTitle = row.machine_master || '-';
                                  const machineMasterItems = [
                                    row.machine_raw ? (
                                      <>
                                        <div className="reject-popover-item">Machine raw</div>
                                        <div className="reject-popover-meta">{row.machine_raw}</div>
                                      </>
                                    ) : null,
                                    row.machine_normalized ? (
                                      <>
                                        <div className="reject-popover-item">Machine normalized</div>
                                        <div className="reject-popover-meta">{row.machine_normalized}</div>
                                      </>
                                    ) : null,
                                    row.match_code ? (
                                      <>
                                        <div className="reject-popover-item">Match code</div>
                                        <div className="reject-popover-meta">{row.match_code}</div>
                                      </>
                                    ) : null,
                                    row.match_source ? (
                                      <>
                                        <div className="reject-popover-item">Match source</div>
                                        <div className="reject-popover-meta">{row.match_source}</div>
                                      </>
                                    ) : null,
                                    row.match_reason ? (
                                      <>
                                        <div className="reject-popover-item">Match reason</div>
                                        <div className="reject-popover-meta">{row.match_reason}</div>
                                      </>
                                    ) : null,
                                    row.source_line ? (
                                      <>
                                        <div className="reject-popover-item">Raw source</div>
                                        <div className="reject-popover-meta">{row.source_line}</div>
                                      </>
                                    ) : null,
                                  ].filter(Boolean) as React.ReactNode[];
                                  const reasonItems = [
                                    row.category ? (
                                      <>
                                        <div className="reject-popover-item">Category</div>
                                        <div className="reject-popover-meta">{row.category}</div>
                                      </>
                                    ) : null,
                                    row.source_line ? (
                                      <>
                                        <div className="reject-popover-item">Raw source</div>
                                        <div className="reject-popover-meta">{row.source_line}</div>
                                      </>
                                    ) : null,
                                  ].filter(Boolean) as React.ReactNode[];
                                  const actionItems = [
                                    row.note ? (
                                      <>
                                        <div className="reject-popover-item">Action detail</div>
                                        <div className="reject-popover-meta">{row.note}</div>
                                      </>
                                    ) : null,
                                    row.source_line ? (
                                      <>
                                        <div className="reject-popover-item">Raw source</div>
                                        <div className="reject-popover-meta">{row.source_line}</div>
                                      </>
                                    ) : null,
                                  ].filter(Boolean) as React.ReactNode[];
                                  const confidenceItems = [
                                    row.warning_code ? (
                                      <>
                                        <div className="reject-popover-item">Warning code</div>
                                        <div className="reject-popover-meta">{row.warning_code}</div>
                                      </>
                                    ) : null,
                                    row.idempotency_key ? (
                                      <>
                                        <div className="reject-popover-item">Idempotency key</div>
                                        <div className="reject-popover-meta">{row.idempotency_key}</div>
                                      </>
                                    ) : null,
                                    row.match_code ? (
                                      <>
                                        <div className="reject-popover-item">Match code</div>
                                        <div className="reject-popover-meta">{row.match_code}</div>
                                      </>
                                    ) : null,
                                  ].filter(Boolean) as React.ReactNode[];
                                  return <tr key={`${row.tanggal}-${row.machine_master}-${row.start}-${index}`}><td>{row.tanggal}</td><td>{row.shift_code}</td><td>{row.area}</td><td><HoverSummaryCell className="structured-hover-cell" triggerClassName="structured-hover-trigger" popoverClassName="structured-hover-popover" title={`Detail mesin ${machineMasterTitle}`} value={<strong>{machineMasterTitle}</strong>} items={machineMasterItems} /></td><td>{row.start || '-'}</td><td>{row.end || '-'}</td><td className="num">{numberFmt.format(row.durasi_menit || 0)}</td><td><HoverSummaryCell className="structured-hover-cell" triggerClassName="structured-hover-trigger" popoverClassName="structured-hover-popover" title={`Detail reason ${row.machine_master || '-'}`} value={<SmartText value={row.reason || row.category || '-'} maxChars={26} />} items={reasonItems} /></td><td><HoverSummaryCell className="structured-hover-cell" triggerClassName="structured-hover-trigger" popoverClassName="structured-hover-popover" title={`Detail action ${row.machine_master || '-'}`} value={<SmartText value={row.note || '-'} maxChars={20} />} items={actionItems} /></td><td>{row.condition || '-'}</td><td><HoverSummaryCell className="structured-hover-cell" triggerClassName="structured-hover-trigger" popoverClassName="structured-hover-popover" title={`Detail confidence ${row.machine_master || '-'}`} value={<span className={`status-badge ${row.confidence === 'high' ? 'above-target' : row.confidence === 'medium' ? 'on-track' : 'under-target'}`}>{row.confidence || '-'}</span>} items={confidenceItems} /></td></tr>;
                                })}</tbody>
                              </table>
                            </div>
                          </details>
                        ) : null}

                        {downtimeWaResult.productionRows?.length ? (
                          <details className="table-disclosure">
                            <summary><span>Output / Production Structured Rows</span><em>{numberFmt.format(downtimeWaResult.productionRows.length)} row · buka untuk cek output parser</em></summary>
                            <div className="detail-table-scroll downtime-wa-table-wrap"><table className="detail-table downtime-wa-table"><thead><tr><th>Tanggal</th><th>Shift</th><th>Area</th><th>Section</th><th>Mesin Master</th><th>Produk</th><th>Hasil</th><th>Reject Print</th><th>Reject Polos</th><th>Reject Setup</th><th>Sisa Order</th><th>CT</th><th>Productivity</th><th>Reject %</th><th>Condition</th><th>Note</th></tr></thead><tbody>{downtimeWaResult.productionRows.slice(0, 100).map((row, index) => <tr key={`${row.machine_master}-${row.product}-${index}`}><td>{row.tanggal}</td><td>{row.shift_code}</td><td>{row.area}</td><td>{row.section_label}</td><td><strong>{row.machine_master}</strong><br/><span className="muted">{row.machine_raw}</span><br/><span className="muted">{row.match_source || '-'}</span></td><td>{row.product || '-'}</td><td>{row.metric_hasil || '-'}</td><td>{row.metric_reject_print || '-'}</td><td>{row.metric_reject_polos || '-'}</td><td>{row.metric_reject_setup || '-'}</td><td>{row.metric_sisa_order || '-'}</td><td>{row.metric_ct || '-'}</td><td>{row.metric_productivity || '-'}</td><td>{row.metric_reject_pct || '-'}</td><td><span className={`status-badge ${row.condition === 'off' ? 'under-target' : row.condition === 'standby' ? 'on-track' : 'above-target'}`}>{row.condition || '-'}</span></td><td><SmartText value={row.note || row.source_line || '-'} maxChars={40} /><br/><span className="muted">{row.idempotency_key || '-'}</span></td></tr>)}</tbody></table></div>
                          </details>
                        ) : null}

                        {downtimeWaResult.blocks?.length ? (
                          <div className="downtime-wa-blocks">
                                    <div className="downtime-wa-blocks-head"><strong>Preview blok</strong><span>{numberFmt.format(downtimeWaResult.blocks.length)} blok terdeteksi</span></div>
                            <div className="downtime-wa-block-list">
                              {downtimeWaResult.blocks.map((block, index) => (
                                <details key={`${block.label}-${index}`} className="downtime-wa-block">
                                  <summary><div><strong>{block.label}</strong><span>{numberFmt.format(block.row_count)} event</span></div></summary>
                                  <div className="downtime-wa-block-body">
                                    <div className="downtime-wa-block-meta"><span>Kategori utama: {downtimeCategoryLabel(block.rows[0]?.category || 'other')}</span><span>Area: {block.area || '-'}</span><span>Shift: {block.shift_code || '-'}</span></div>
                                    <div className="detail-table-scroll downtime-wa-table-wrap">
                                      <table className="detail-table downtime-wa-table">
                                        <thead><tr><th>Waktu</th><th className="num">Durasi</th><th>Problem</th><th>Action</th><th>Confidence</th></tr></thead>
                                        <tbody>{block.rows.map((row, rowIndex) => <tr key={`${block.label}-${rowIndex}-${row.start_time}`}><td>{row.start_time} - {row.end_time}</td><td className="num">{numberFmt.format(row.duration_minutes)} menit</td><td><SmartText value={row.root_cause || '-'} maxChars={36} /><br/><details className="inline-audit-details"><summary className="muted">raw</summary><SmartText value={row.source_line || row.machine_raw || '-'} maxChars={64} /></details></td><td><SmartText value={row.action_taken || row.warning || '-'} maxChars={28} /><br/><details className="inline-audit-details"><summary className="muted">detail</summary><div className="inline-audit-stack"><SmartText value={row.action_taken || '-'} maxChars={120} /><SmartText value={row.source_line || row.machine_raw || '-'} maxChars={80} /></div></details></td><td><span className={`status-badge ${row.confidence === 'high' ? 'above-target' : row.confidence === 'medium' ? 'on-track' : 'under-target'}`}>{row.confidence}</span>{row.match_code ? <><br/><span className="muted">{row.match_code}</span></> : null}{row.match_source ? <><br/><span className="muted">{row.match_source}</span></> : null}{row.idempotency_key ? <><br/><span className="muted">{row.idempotency_key}</span></> : null}</td></tr>)}</tbody>
                                      </table>
                                    </div>
                                  </div>
                                </details>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <details className="table-disclosure" open>
                          <summary><span>Preview Event Gangguan</span><em>{numberFmt.format((downtimeWaResult.rows || []).length)} row · cek sebelum save</em></summary>
                          <div className="detail-table-scroll downtime-event-scroll"><table className="detail-table"><thead><tr><th>#</th><th>Tanggal</th><th>Shift</th><th>Area</th><th>Mesin</th><th>Start</th><th>End</th><th className="num">Durasi</th><th>Condition</th><th>Reason</th><th>Confidence</th><th>Aksi</th></tr></thead><tbody>{(downtimeWaResult.rows || []).slice(0, 80).map((row, index) => downtimeWaEditingRowIndex === index && downtimeWaRowDraft ? <tr key={`${row.machine}-${index}`}><td>{index + 1}</td><td><input className="detail-table-input" type="date" value={downtimeWaRowDraft.event_date} onChange={(e) => setDowntimeWaRowDraft({ ...downtimeWaRowDraft, event_date: e.target.value })} /></td><td><input className="detail-table-input" value={downtimeWaRowDraft.shift_code} onChange={(e) => setDowntimeWaRowDraft({ ...downtimeWaRowDraft, shift_code: e.target.value })} /></td><td><input className="detail-table-input" value={downtimeWaRowDraft.area} onChange={(e) => setDowntimeWaRowDraft({ ...downtimeWaRowDraft, area: e.target.value })} /></td><td><input className="detail-table-input" value={downtimeWaRowDraft.machine} onChange={(e) => setDowntimeWaRowDraft({ ...downtimeWaRowDraft, machine: e.target.value })} /></td><td><input className="detail-table-input" type="time" value={downtimeWaRowDraft.start_time} onChange={(e) => setDowntimeWaRowDraft({ ...downtimeWaRowDraft, start_time: e.target.value })} /></td><td><input className="detail-table-input" type="time" value={downtimeWaRowDraft.end_time} onChange={(e) => setDowntimeWaRowDraft({ ...downtimeWaRowDraft, end_time: e.target.value })} /></td><td className="num"><input className="detail-table-input" value={downtimeWaRowDraft.duration_minutes} onChange={(e) => setDowntimeWaRowDraft({ ...downtimeWaRowDraft, duration_minutes: toNumber(e.target.value) })} /></td><td><input className="detail-table-input" value={downtimeWaRowDraft.condition || ''} onChange={(e) => setDowntimeWaRowDraft({ ...downtimeWaRowDraft, condition: e.target.value as DowntimeWaParsedRow['condition'] })} /></td><td><input className="detail-table-input" value={downtimeWaRowDraft.root_cause || ''} onChange={(e) => setDowntimeWaRowDraft({ ...downtimeWaRowDraft, root_cause: e.target.value })} /></td><td>{downtimeWaRowDraft.confidence}{downtimeWaRowDraft.warning_code ? <><br/><span className="muted">{downtimeWaRowDraft.warning_code}</span></> : null}{downtimeWaRowDraft.idempotency_key ? <><br/><span className="muted">{downtimeWaRowDraft.idempotency_key}</span></> : null}</td><td><button className="btn secondary table-mini-btn" type="button" onClick={saveEditingDowntimeWaRow}>Save</button><button className="btn secondary table-mini-btn" type="button" onClick={cancelEditingDowntimeWaRow}>Cancel</button></td></tr> : <tr key={`${row.machine}-${index}`} className={downtimeWaResult.duplicateHints?.some((hint) => hint.row_index === index) ? 'target-alert-row' : ''}><td>{index + 1}</td><td>{row.event_date}</td><td>{row.shift_code}</td><td>{row.area}</td><td><strong>{row.machine}</strong><br/><span className="muted">{deriveDowntimeWaStructuredRow(row).machine_match}</span>{row.match_code ? <><br/><span className="status-badge on-track">{row.match_code}</span></> : null}{row.match_reason ? <><br/><span className="muted">{row.match_reason}</span></> : null}{row.match_source ? <><br/><span className="muted">{row.match_source}</span></> : null}</td><td>{row.start_time}</td><td>{row.end_time}</td><td className="num">{decimalFmt.format(row.duration_minutes)}</td><td>{row.condition || '-'}</td><td>{row.root_cause || row.category}</td><td>{row.confidence}{row.warning_code ? <><br/><span className="muted">{row.warning_code}</span></> : null}{row.warning ? <><br/><span className="muted">{row.warning}</span></> : null}{row.idempotency_key ? <><br/><span className="muted">{row.idempotency_key}</span></> : null}</td><td><button className="btn secondary table-mini-btn" type="button" onClick={() => startEditingDowntimeWaRow(index)}>Edit</button><button className="btn secondary table-mini-btn" type="button" onClick={() => applyDowntimeWaRowToSimilar(index, { machine: row.machine, area: row.area })}>Apply Similar</button></td></tr>)}</tbody></table></div>
                        </details>

                      </section>
                    ) : null}
                  </div>
                ) : null}

                {downtimePanel === 'input' ? (
                  <div className="downtime-input-stack">
                    {downtimeEventDrafts.map((draft, index) => (
                      <section key={draft.ui_id} className="card pad soft-card downtime-input-card">
                        <div className="chart-head downtime-input-card-head">
                          <div>
                            <h3>{draft.editingId ? 'Edit Event' : `Event ${index + 1}`}</h3>
                            <p>{draft.editingId ? `Memperbarui event downtime yang dipilih.` : 'Isi satu card untuk satu event. Tombol + akan menambah card baru di bawahnya.'}</p>
                          </div>
                          <div className="detail-table-toolbar-group">
                            {downtimeEventDrafts.length > 1 ? <button className="btn secondary table-mini-btn danger" type="button" onClick={() => removeDowntimeEventDraft(draft.ui_id)}>Hapus</button> : null}
                          </div>
                        </div>
                        <div className="downtime-form-grid downtime-form-grid-compact">
                          <div className="downtime-form-row">
                            <label className="downtime-field">
                              <span>Tanggal</span>
                              <input className="detail-table-input" type="date" value={draft.form.event_date} onChange={(e) => setDowntimeEventDrafts((current) => current.map((item) => item.ui_id === draft.ui_id ? { ...item, form: { ...item.form, event_date: e.target.value } } : item))} />
                            </label>
                            <SelectField
                              label="Shift"
                              value={draft.form.shift_code}
                              options={downtimeShiftChoices}
                              onChange={(shift_code) => updateDowntimeDraft(draft.ui_id, { shift_code })}
                            />
                            <SelectField
                              label="Area"
                              value={draft.form.area}
                              options={downtimeAreaOptions.map((area) => ({ value: area, label: area }))}
                              placeholder="Pilih area"
                              allowEmpty
                              onChange={(area) => updateDowntimeDraft(draft.ui_id, { area })}
                            />
                            <SelectField
                              label="Mesin"
                              value={draft.form.machine}
                              options={downtimeMachineOptions.map((machine) => ({ value: machine, label: machine }))}
                              placeholder="Pilih mesin"
                              allowEmpty
                              onChange={(machine) => updateDowntimeDraft(draft.ui_id, { machine })}
                            />
                          </div>
                          <div className="downtime-form-row">
                            <label className="downtime-field">
                              <span>Start</span>
                              <input className="detail-table-input" type="time" value={draft.form.start_time} onChange={(e) => updateDowntimeDraft(draft.ui_id, { start_time: e.target.value })} />
                            </label>
                            <label className="downtime-field">
                              <span>End</span>
                              <input className="detail-table-input" type="time" value={draft.form.end_time} onChange={(e) => updateDowntimeDraft(draft.ui_id, { end_time: e.target.value })} />
                            </label>
                            <label className="downtime-field">
                              <span>Kategori</span>
                              <select className="detail-table-select" value={draft.form.category} onChange={(e) => updateDowntimeDraft(draft.ui_id, { category: e.target.value as DowntimeEventCategory })}>{downtimeCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                            </label>
                            <label className="downtime-field">
                              <span>Status</span>
                              <select className="detail-table-select" value={draft.form.status} onChange={(e) => updateDowntimeDraft(draft.ui_id, { status: e.target.value as DowntimeEventStatus })}>{downtimeStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                            </label>
                          </div>
                          <label className="downtime-field downtime-field-wide">
                            <span>Penyebab</span>
                            <textarea className="detail-table-input downtime-textarea" value={draft.form.root_cause} onChange={(e) => updateDowntimeDraft(draft.ui_id, { root_cause: e.target.value })} />
                          </label>
                          <label className="downtime-field downtime-field-wide">
                            <span>Tindakan</span>
                            <textarea className="detail-table-input downtime-textarea" value={draft.form.action_taken} onChange={(e) => updateDowntimeDraft(draft.ui_id, { action_taken: e.target.value })} />
                          </label>
                          <div className="span-2 detail-table-toolbar-group">
                            <span className="muted">Card {index + 1} {draft.editingId ? '· edit mode' : ''}</span>
                          </div>
                        </div>
                      </section>
                    ))}
                    <div className="detail-table-toolbar-group downtime-input-stack-actions">
                      <button className="btn secondary" type="button" onClick={addDowntimeEventDraft}>+ Tambah Card</button>
                      <button className="btn secondary" type="button" onClick={resetDowntimeEventForm}>Reset All</button>
                    </div>
                    <div className="detail-table-toolbar-group">
                      <button className="btn primary" type="button" onClick={saveDowntimeEvents} disabled={savingDowntimeEvent}>{savingDowntimeEvent ? 'Saving...' : 'Save Events'}</button>
                    </div>
                  </div>
                ) : null}

                {(downtimePanel === 'followup' || downtimePanel === 'table') ? (
                  <>
                    <DataTableToolbar totalCount={downtimePanel === 'followup' ? downtimeFollowUpRows.length : downtimeEvents.length} hasActiveFilters={Boolean(downtimeEventFilters.category || downtimeEventFilters.shift || downtimeEventFilters.status)} onReset={() => setDowntimeEventFilters(emptyDowntimeEventFilters)} left={<><TableFilterSelect value={downtimeEventFilters.category} onChange={(category) => setDowntimeEventFilters((c) => ({ ...c, category: category as DowntimeEventFilters['category'] }))} options={[{ value: '', label: 'Semua kategori' }, ...downtimeCategories]} /><TableFilterSelect value={downtimeEventFilters.status} onChange={(status) => setDowntimeEventFilters((c) => ({ ...c, status: status as DowntimeEventFilters['status'] }))} options={[{ value: '', label: 'Semua status' }, ...downtimeStatuses]} /><TableFilterSelect value={downtimeEventFilters.shift} onChange={(shift) => setDowntimeEventFilters((c) => ({ ...c, shift }))} options={[{ value: '', label: 'Semua shift' }, ...downtimeEventShiftOptions.map((shift) => ({ value: shift, label: shift }))]} /></>} />
                    <div className="detail-table-scroll"><table className="detail-table downtime-event-table"><thead><tr><th>Tanggal & Shift</th><th>Mesin & Area</th><th>Waktu</th><th className="num">Durasi</th><th>Kategori</th><th>Status</th><th>Penyebab / Tindakan</th><th className="num">Loss</th><th>PIC</th><th>Aksi</th></tr></thead><tbody>{(downtimePanel === 'followup' ? downtimeFollowUpRows.map((x) => x.event) : downtimeEvents).length ? (downtimePanel === 'followup' ? downtimeFollowUpRows.map((x) => x.event) : downtimeEvents).map((row) => <tr key={row.id} className={`downtime-row-${row.status} ${!cleanText(row.root_cause, '') || !cleanText(row.action_taken, '') ? 'is-alert' : ''}`}><td><strong>{row.event_date}</strong><br/><span className="muted">Shift {row.shift_code || '-'}</span></td><td><div className="machine-product-cell"><strong>{row.machine}</strong><span>{row.area || '-'}{row.linked_signal_type ? ` · ${downtimeSignalLabel(row.linked_signal_type as DowntimeSignalType)}` : ''}</span></div></td><td>{row.start_time} - {row.end_time}</td><td className="num">{decimalFmt.format(row.duration_minutes)} menit</td><td>{row.category}</td><td><span className={`status-badge ${row.status}`}>{row.status}</span></td><td><strong>{row.root_cause || 'Penyebab belum diisi'}</strong><br/><span className="muted">{row.action_taken || 'Tindakan belum diisi'}</span></td><td className="num">{row.estimated_loss_output ? numberFmt.format(row.estimated_loss_output) : '-'}</td><td>{row.pic || '-'}</td><td><div className="table-actions"><button className="btn secondary table-mini-btn" type="button" onClick={() => editDowntimeEvent(row)}>Edit</button><button className="btn secondary table-mini-btn danger" type="button" onClick={() => deleteDowntimeEvent(row.id)}>Hapus</button></div></td></tr>) : <tr><td colSpan={10}><div className="empty guided-empty table-empty"><strong>{downtimePanel === 'followup' ? 'Belum ada tindak lanjut' : 'Belum ada event gangguan'}</strong><p>{downtimePanel === 'followup' ? 'Event yang butuh penyebab/tindakan akan muncul di sini.' : 'Klik Input Event untuk mencatat gangguan produksi pertama.'}</p></div></td></tr>}</tbody></table></div>
                  </>
                ) : null}
              </section>
            ) : null}
            {activeView === 'compare-period' ? (
              <>
                {compareKpis && compareSummary ? (
                  <section
                    className="card pad compare-card"
                    onMouseEnter={() => setComparePaused(true)}
                    onMouseLeave={() => setComparePaused(false)}
                  >
                    <div className="chart-head compare-head">
                      <div>
                        <h2>Compare Period</h2>
                        <p>{filters.dateFrom} s/d {filters.dateTo} · dibanding {compareSummary.previousRange.dateFrom} s/d {compareSummary.previousRange.dateTo}</p>
                      </div>
                      <div className="compare-meta">Area {comparePageIndex + 1} / {comparePages.length || 1}</div>
                    </div>

                    <div className="compare-summary-grid">
                      <div className="compare-summary-card">
                        <span>Achievement</span>
                        <strong>{decimalFmt.format(overallAchievementPct)}%</strong>
                        <em>Sebelumnya {decimalFmt.format(compareAchievementPct)}% · {compareDeltaText(overallAchievementPct, compareAchievementPct)} pp</em>
                      </div>
                      <div className="compare-summary-card">
                        <span>Output OK</span>
                        <strong>{numberFmt.format(kpis.totalOkQty)}</strong>
                        <em>Sebelumnya {numberFmt.format(compareKpis.totalOkQty)} · {compareDeltaText(kpis.totalOkQty, compareKpis.totalOkQty)}</em>
                      </div>
                      <div className="compare-summary-card">
                        <span>Reject Rate</span>
                        <strong>{decimalFmt.format(kpis.rejectRate * 100)}%</strong>
                        <em>Sebelumnya {decimalFmt.format(compareKpis.rejectRate * 100)}% · {compareDeltaText(kpis.rejectRate * 100, compareKpis.rejectRate * 100)} pp</em>
                      </div>
                    </div>

                    {comparePage ? (
                      <>
                        <div className="compare-area-strip">
                          <div>
                            <div className="compare-page-label">Area aktif</div>
                            <div className="compare-page-title">{comparePage.area}</div>
                          </div>
                          <div className="compare-area-legend">Current vs previous period per mesin</div>
                        </div>

                        <div className="compare-area-grid">
                          <div className="compare-area-stat">
                            <span>Output OK</span>
                            <strong>{numberFmt.format(comparePage.current.output)}</strong>
                            <em>Prev {numberFmt.format(comparePage.previous.output)} · {compareDeltaText(comparePage.current.output, comparePage.previous.output)}</em>
                          </div>
                          <div className="compare-area-stat">
                            <span>Achievement</span>
                            <strong>{decimalFmt.format(comparePage.current.achievementPct)}%</strong>
                            <em>Prev {decimalFmt.format(comparePage.previous.achievementPct)}% · {compareDeltaText(comparePage.current.achievementPct, comparePage.previous.achievementPct)} pp</em>
                          </div>
                          <div className="compare-area-stat">
                            <span>Reject Rate</span>
                            <strong>{decimalFmt.format(comparePage.current.rejectRatePct)}%</strong>
                            <em>Prev {decimalFmt.format(comparePage.previous.rejectRatePct)}% · {compareDeltaText(comparePage.current.rejectRatePct, comparePage.previous.rejectRatePct)} pp</em>
                          </div>
                        </div>

                        <div className="compare-matrix-wrap">
                          <div className="compare-matrix">
                            <div className="compare-matrix-row compare-matrix-head">
                              <div className="compare-matrix-label">Metric</div>
                              {comparePage.machines.map((machine) => (
                                <div key={`${comparePage.area}-${machine.name}-head`} className="compare-matrix-cell compare-matrix-machine">
                                  <strong>{machine.name}</strong>
                                  <em>Δ OK {compareDeltaText(machine.current.output, machine.previous.output)}</em>
                                </div>
                              ))}
                            </div>
                            <div className="compare-matrix-row">
                              <div className="compare-matrix-label">Output OK</div>
                              {comparePage.machines.map((machine) => (
                                <div key={`${comparePage.area}-${machine.name}-ok`} className="compare-matrix-cell">
                                  <strong>{numberFmt.format(machine.current.output)}</strong>
                                  <span>Prev {numberFmt.format(machine.previous.output)}</span>
                                </div>
                              ))}
                            </div>
                            <div className="compare-matrix-row">
                              <div className="compare-matrix-label">Achievement</div>
                              {comparePage.machines.map((machine) => (
                                <div key={`${comparePage.area}-${machine.name}-ach`} className="compare-matrix-cell">
                                  <strong>{decimalFmt.format(machine.current.achievementPct)}%</strong>
                                  <span>Prev {decimalFmt.format(machine.previous.achievementPct)}%</span>
                                </div>
                              ))}
                            </div>
                            <div className="compare-matrix-row">
                              <div className="compare-matrix-label">Reject Rate</div>
                              {comparePage.machines.map((machine) => (
                                <div key={`${comparePage.area}-${machine.name}-reject`} className="compare-matrix-cell">
                                  <strong>{decimalFmt.format(machine.current.rejectRatePct)}%</strong>
                                  <span>Prev {decimalFmt.format(machine.previous.rejectRatePct)}%</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="compare-dots" aria-label="Compare carousel navigation">
                          {comparePages.map((page, index) => (
                            <button
                              key={page.area}
                              type="button"
                              className={`compare-dot ${index === comparePageIndex ? 'is-active' : ''}`}
                              aria-label={`Lihat area ${page.area}`}
                              aria-pressed={index === comparePageIndex}
                              onClick={() => setComparePageIndex(index)}
                            />
                          ))}
                        </div>
                      </>
                    ) : null}
                  </section>
                ) : loading ? <div className="card pad">Loading compare period...</div> : <div className="card pad empty guided-empty"><strong>Belum bisa dibandingkan</strong><p>Pilih periode yang punya data, lalu pastikan periode sebelumnya juga berisi data produksi.</p></div>}
              </>
            ) : null}

            {activeView === 'settings' ? (
              <SettingsSection
                settingsPanel={settingsPanel}
                onChangePanel={setSettingsPanel}
                settingsLoading={settingsLoading}
                settingsSaving={settingsSaving}
                settingsError={settingsError}
                syncError={syncError}
              settingsData={settingsData}
              settingsDraft={settingsDraft}
              setSettingsDraft={setSettingsDraft}
              onSave={saveSettings}
              onCheckApiKey={checkApiKey}
              checkingApiKey={checkingApiKey}
              apiKeyCheckResults={apiKeyCheckResults}
              onSync={syncData}
              syncing={syncing}
              activeView={activeView}
                downtimeEventsCount={downtimeEvents.length}
                latestSyncStatus={dashboard.syncStatus?.status || '-'}
              />
            ) : null}

            {activeView === 'master-entity' ? (
              <>
                <section className="card chart-card">
                  <div className="chart-head">
                    <div>
                      <h2>{editingMasterId ? 'Edit Master Entity' : 'Tambah Master Entity'}</h2>
                      <p>Perubahan sekarang tersimpan ke SQLite lokal. Export CSV bila ingin snapshot hasil edit.</p>
                    </div>
                    <div className="master-entity-head-actions">
                      <button className="btn secondary" type="button" onClick={resetMasterForm}><X size={15}/> Reset Form</button>
                      <button className="btn" type="button" onClick={saveMasterEntity}><Save size={15}/>{editingMasterId ? 'Update Entity' : 'Tambah Entity'}</button>
                    </div>
                  </div>

                  <div className="master-form-grid">
                    <div className="filter-group">
                      <label>Area Kerja/Line</label>
                      <input value={masterForm.area_kerja_line} onChange={(e) => setMasterForm({ ...masterForm, area_kerja_line: e.target.value })} placeholder="THERMOFORMING" />
                    </div>
                    <div className="filter-group">
                      <label>Kode Asli (Sistem)</label>
                      <input value={masterForm.kode_asli_sistem} onChange={(e) => setMasterForm({ ...masterForm, kode_asli_sistem: e.target.value })} placeholder="THERMO ILLIG-1" />
                    </div>
                    <div className="filter-group">
                      <label>Display Laporan</label>
                      <input value={masterForm.display_laporan} onChange={(e) => setMasterForm({ ...masterForm, display_laporan: e.target.value })} placeholder="Illig 1" />
                    </div>
                    <div className="filter-group">
                      <label>Deskripsi</label>
                      <input value={masterForm.deskripsi_produk} onChange={(e) => setMasterForm({ ...masterForm, deskripsi_produk: e.target.value })} placeholder="Thermoforming Cup" />
                    </div>
                    <div className="filter-group">
                      <label>Jenis Target Aktif</label>
                      <select value={masterForm.active_target_type} onChange={(e) => setMasterForm({ ...masterForm, active_target_type: e.target.value })}>
                        <option value="target_botol_preform">Botol & Preform</option>
                        <option value="target_thermoforming">Thermoforming</option>
                        <option value="target_thermoforming_gw_gt_12">Thermoforming GW &gt; 12 gr</option>
                        <option value="target_printing_non_oz">Printing non OZ</option>
                        <option value="target_printing_oz_lt_20">Printing OZ &lt; 20 OZ</option>
                        <option value="target_printing_22_oz">Printing 22 OZ</option>
                      </select>
                    </div>
                    <div className="filter-group">
                      <label>Nilai Target Harian 24 Jam</label>
                      <input value={masterForm.active_target} onChange={(e) => setMasterForm({ ...masterForm, active_target: e.target.value })} placeholder="1620000 (target 24 jam)" />
                    </div>
                    <div className="filter-group">
                      <label>Target Achievement</label>
                      <input value={masterForm.target_achievement_rate} onChange={(e) => setMasterForm({ ...masterForm, target_achievement_rate: e.target.value })} placeholder="0.8 atau 80%" />
                    </div>
                    <div className="filter-group">
                      <label>Target Reject Rate</label>
                      <input value={masterForm.target_reject_rate} onChange={(e) => setMasterForm({ ...masterForm, target_reject_rate: e.target.value })} placeholder="0.03 atau 3%" />
                    </div>
                  </div>
                </section>

                <section className="card chart-card">
                  <div className="chart-head">
                    <div>
                      <h2>Daftar Master Entity</h2>
                      <p>Master entity saat ini: {numberFmt.format(masterTargets.length)} row.</p>
                    </div>
                    <button className="btn secondary" type="button" onClick={() => { resetMasterForm(); setActiveView('master-entity'); }}><Plus size={15}/> Entity Baru</button>
                  </div>
                  <div className="table-wrap">
                    {masterTargets.length ? (
                      <table>
                        <thead>
                          <tr>
                            <th>Area</th><th>Kode Sistem</th><th>Display</th><th>Deskripsi</th><th>Target Type</th><th>Target Harian 24 Jam</th><th>Target Ach</th><th>Reject</th><th>Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {masterTargets.map((row) => (
                            <tr key={row.ui_id}>
                              <td>{row.area_kerja_line}</td>
                              <td>{row.kode_asli_sistem}</td>
                              <td>{row.display_laporan}</td>
                              <td>{row.deskripsi_produk}</td>
                              <td>{row.active_target_type}</td>
                              <td>{row.active_target ? numberFmt.format(toNumber(row.active_target)) : '-'}</td>
                              <td>{row.target_achievement_rate ? `${decimalFmt.format(toNumber(row.target_achievement_rate) * 100)}%` : '-'}</td>
                              <td>{row.target_reject_rate ? `${decimalFmt.format(toNumber(row.target_reject_rate) * 100)}%` : '-'}</td>
                              <td>
                                <div className="table-action-row">
                                  <button className="btn secondary table-mini-btn" type="button" onClick={() => startEditMasterEntity(row)}><Pencil size={14}/> Edit</button>
                                  <button className="btn danger table-mini-btn" type="button" onClick={() => deleteMasterEntity(row.ui_id)}><Trash2 size={14}/> Hapus</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : <div className="empty guided-empty"><strong>Belum ada data mesin</strong><p>Tambahkan master mesin dulu supaya target, area, dan nama laporan bisa dipakai dashboard.</p></div>}
                  </div>
                </section>
              </>
            ) : null}

            {activeView === 'data-detail' ? (
              <section className="card chart-card" id="detail-table-section">
                <div className="chart-head">
                  <div>
                      <h2>Resume Harian per Item</h2>
                    <p>Menampilkan 20 data per halaman, urut terbaru dulu. Filter di area ini hanya berlaku untuk tabel detail, tidak mengubah global filter.</p>
                  </div>
                </div>
                <DataTableToolbar
                  compactMobile
                  left={(
                    <>
                      <TableFilterInput
                        value={detailTableFilters.search}
                        onChange={(value) => setDetailTableFilters((current) => ({ ...current, search: value }))}
                        placeholder="Cari item, dokumen, operator, mesin..."
                      />
                      <TableFilterSelect
                        value={detailTableFilters.machine}
                        onChange={(value) => setDetailTableFilters((current) => ({ ...current, machine: value }))}
                        options={[{ value: '', label: 'Semua mesin' }, ...detailTableMachineOptions.map((machine) => ({ value: machine, label: machine }))]}
                      />
                    </>
                  )}
                  totalCount={filteredDetailRows.length}
                  hasActiveFilters={Boolean(detailTableFilters.search || detailTableFilters.machine)}
                  onReset={() => setDetailTableFilters(emptyDetailTableFilters)}
                />
                <div className="table-wrap detail-table-wrap">
                  {filteredDetailRows.length ? (
                    <table>
                      <thead>
                        <tr>
                          <th>Tanggal</th><th>Mesin</th><th>Item</th><th>Kategori</th><th>No Dokumen</th><th>Operator</th><th>Jam Kerja</th><th>Target Prorata Transaksi</th><th>Output OK</th><th>UOM</th><th>Reject (kg)</th><th>Reject PCS Eq</th><th>% Ach</th><th>% Reject</th><th>Gross Weight</th><th>Input</th><th>Catatan Operator</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedDetailRows.map((row, index) => (
                          <tr key={`${row.document_no}-${row.item_no}-${index}`}>
                            <td>{row.posting_date || '-'}</td>
                            <td><SmartText value={row.display_laporan || cleanText(row.prod_line_description)} maxChars={20} /></td>
                            <td>
                              <div className="table-cell-strong"><SmartText value={row.description} maxChars={28} /></div>
                              <div className="table-cell-subtle"><SmartText value={row.item_no || '-'} maxChars={18} /></div>
                            </td>
                            <td><SmartText value={row.item_category_code} maxChars={16} /></td>
                            <td>
                              <HoverSummaryCell
                                value={<><div className="table-cell-strong"><SmartText value={row.document_no} maxChars={18} /></div><div className="table-cell-subtle">{row.document_count} dokumen</div></>}
                                title="Detail No Dokumen"
                                items={detailLinesFromDocuments(row.document_details)}
                              />
                            </td>
                            <td>
                              <HoverSummaryCell
                                value={<SmartText value={row.operator_summary || '-'} maxChars={22} />}
                                title="Detail Operator"
                                items={detailLinesFromOperators(row.operator_details)}
                              />
                            </td>
                            <td>{row.work_hours ? decimalFmt.format(row.work_hours) : '-'}</td>
                            <td>{row.transaction_prorata_target ? numberFmt.format(row.transaction_prorata_target) : '-'}</td>
                            <td>{numberFmt.format(row.quantity)}</td>
                            <td>{row.uom}</td>
                            <td>
                              <HoverSummaryCell
                                value={row.reject_details.length ? row.reject_kg.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '-'}
                                title="Detail Reject"
                                items={row.reject_details.map((detail) => (
                                  <>
                                    <div className="reject-popover-item">{detail.item}</div>
                                    <div className="reject-popover-meta">
                                      {detail.quantity.toLocaleString('en-US')} {detail.uom} · {detail.document_no}
                                    </div>
                                    <div className="reject-popover-meta">
                                      {detail.shift_code || '-'}{detail.operator_name ? ` · ${detail.operator_name}` : ''}
                                    </div>
                                  </>
                                ))}
                                align="right"
                              />
                            </td>
                            <td>{row.reject_pcs_eq ? numberFmt.format(row.reject_pcs_eq) : '-'}</td>
                            <td>
                              <HoverSummaryCell
                                value={row.transaction_prorata_target ? `${decimalFmt.format((row.achievement_pct || 0) * 100)}%` : '-'}
                                title="Detail % Achievement"
                                items={achievementCalculationLines(row)}
                                align="right"
                              />
                            </td>
                            <td>
                              <HoverSummaryCell
                                value={row.quantity || row.reject_pcs_eq ? `${decimalFmt.format((row.reject_pct || 0) * 100)}%` : '-'}
                                title="Detail % Reject"
                                items={rejectCalculationLines(row)}
                                align="right"
                              />
                            </td>
                            <td>{row.gross_weight ? decimalFmt.format(row.gross_weight) : '-'}</td>
                            <td>{numberFmt.format(row.input_count)}</td>
                            <td><SmartText value={row.external_document_no || '-'} maxChars={22} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <div className="empty guided-empty"><strong>Tidak ada data detail</strong><p>Reset filter tabel, perluas periode, atau cari dengan kata kunci mesin/item yang lebih umum.</p></div>}
                </div>
                {filteredDetailRows.length ? (
                  <DataTablePagination
                    page={detailTablePage}
                    totalPages={detailTableTotalPages}
                    visibleCount={pagedDetailRows.length}
                    totalCount={filteredDetailRows.length}
                    onPageChange={setDetailTablePage}
                  />
                ) : null}
              </section>
            ) : null}
          </section>
        </SidebarInset>
      </main>
    </SidebarProvider>
  );
}
