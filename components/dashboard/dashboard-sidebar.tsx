'use client';

import * as Collapsible from '@radix-ui/react-collapsible';
import { BarChart3, ChevronDown, Clock3, Database, Download, Factory, FileText, Filter, Gauge, HardDrive, RefreshCw, RotateCcw, Search, Settings2, SplitSquareVertical, Upload, Workflow, Table2 } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';

export type DashboardFilters = {
  month: string;
  dateFrom: string;
  dateTo: string;
  area: string;
  machine: string;
  line: string;
  category: string;
  outputType: '' | 'ok' | 'reject';
  search: string;
};

type Props = {
  activeView: 'overview' | 'compare-period' | 'master-entity' | 'data-detail' | 'downtime' | 'settings';
  onChangeView: (view: 'overview' | 'compare-period' | 'master-entity' | 'data-detail' | 'downtime' | 'settings') => void;
  downtimePanel: 'workflow' | 'import' | 'input' | 'followup' | 'table' | 'analysis';
  onChangeDowntimePanel: (panel: 'workflow' | 'import' | 'input' | 'followup' | 'table' | 'analysis') => void;
  settingsPanel: 'ai' | 'odata' | 'logs' | 'system';
  onChangeSettingsPanel: (panel: 'ai' | 'odata' | 'logs' | 'system') => void;
  filters: DashboardFilters;
  onFiltersChange: (filters: DashboardFilters) => void;
  onReset: () => void;
  onExport: () => void;
  options: {
    areas: string[];
    machines: string[];
    lines: string[];
    categories: string[];
  };
  dateRange: { min: string; max: string };
  syncStatus: {
    source: string;
    sourceKind: 'odata-live' | 'csv-cache';
    status: string;
    finishedAt: string | null;
    rowCount: number;
    message: string;
  } | null;
  syncing: boolean;
  onSync: () => void;
  rowsCount: number;
  totalRowsCount: number;
  showFilters: boolean;
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

function getTodayJakarta() {
  return getJakartaToday();
}

function getCurrentMonth() {
  return getTodayJakarta().slice(0, 7);
}

function getPreviousMonth(month: string) {
  const [year, mon] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, mon - 1, 1));
  date.setUTCMonth(date.getUTCMonth() - 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getWeekStart(date: Date) {
  const day = date.getUTCDay() || 7;
  const start = new Date(date);
  start.setUTCDate(start.getUTCDate() - day + 1);
  return start;
}

function fmt(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildPresetRange(preset: string, min: string, max: string) {
  const today = getTodayJakarta();
  const todayDate = new Date(`${today}T00:00:00Z`);

  if (preset === 'this-month') {
    const month = getCurrentMonth();
    return { month, ...getMonthRange(month, min, max) };
  }

  if (preset === 'last-month') {
    const month = getPreviousMonth(getCurrentMonth());
    return { month, ...getMonthRange(month, min, max) };
  }

  if (preset === 'today') {
    const date = clampDate(today, min, max);
    return { month: date.slice(0, 7), dateFrom: date, dateTo: date };
  }

  if (preset === 'yesterday') {
    const yesterdayDate = new Date(todayDate);
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const date = clampDate(fmt(yesterdayDate), min, max);
    return { month: date.slice(0, 7), dateFrom: date, dateTo: date };
  }

  if (preset === 'last-7-days') {
    const start = new Date(todayDate);
    start.setUTCDate(start.getUTCDate() - 6);
    const dateFrom = clampDate(fmt(start), min, max);
    const dateTo = clampDate(today, min, max);
    return { month: dateTo.slice(0, 7), dateFrom, dateTo };
  }

  if (preset === 'this-week') {
    const start = getWeekStart(todayDate);
    const dateFrom = clampDate(fmt(start), min, max);
    const dateTo = clampDate(today, min, max);
    return { month: dateTo.slice(0, 7), dateFrom, dateTo };
  }

  return { month: getCurrentMonth(), dateFrom: min, dateTo: max };
}

function isPresetActive(preset: string, filters: DashboardFilters, min: string, max: string) {
  const range = buildPresetRange(preset, min, max);
  return range.month === filters.month && range.dateFrom === filters.dateFrom && range.dateTo === filters.dateTo;
}

function SelectField({ label, value, options, allLabel, onChange }: { label: string; value: string; options: string[]; allLabel: string; onChange: (value: string) => void }) {
  return (
    <div className="filter-group">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </div>
  );
}

export function DashboardSidebar({ activeView, onChangeView, downtimePanel, onChangeDowntimePanel, settingsPanel, onChangeSettingsPanel, filters, onFiltersChange, onReset, onExport, options, dateRange, syncStatus, syncing, onSync, rowsCount, totalRowsCount, showFilters }: Props) {
  const quickPresets = [
    { id: 'this-month', label: 'Bulan Ini' },
    { id: 'last-month', label: 'Bulan Lalu' },
    { id: 'this-week', label: 'Minggu Ini' },
    { id: 'last-7-days', label: '7 Hari' },
    { id: 'today', label: 'Hari Ini' },
    { id: 'yesterday', label: 'Kemarin' },
  ];

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="brand-mark"><Factory size={18} /></div>
        <div className="brand-copy">
          <strong>PPIC Output</strong>
          <span>Dashboard Prototype</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu Utama</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton active={activeView === 'overview'} onClick={() => onChangeView('overview')}><Gauge size={17} /><span>Ringkasan</span></SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton active={activeView === 'data-detail'} onClick={() => onChangeView('data-detail')}><Database size={17} /><span>Detail Data</span></SidebarMenuButton>
              </SidebarMenuItem>
              <Collapsible.Root defaultOpen={false} className="group/collapsible downtime-section">
                <SidebarMenuItem>
                  <Collapsible.Trigger asChild>
                    <SidebarMenuButton active={activeView === 'downtime'} onClick={() => onChangeView('downtime')}>
                      <Clock3 size={17} />
                      <span>Gangguan Produksi</span>
                      <ChevronDown className="chevron downtime-chevron" size={15} />
                    </SidebarMenuButton>
                  </Collapsible.Trigger>
                </SidebarMenuItem>
                <Collapsible.Content>
                  <SidebarMenuItem>
                    <div className="downtime-submenu">
                      {([
                        ['workflow', 'Alur', Workflow],
                        ['input', 'Input', FileText],
                        ['table', 'Daftar', Table2],
                        ['followup', 'Tindak Lanjut', RotateCcw],
                        ['analysis', 'Analisis', BarChart3],
                      ] as const).map(([panel, label, Icon]) => (
                        <div key={panel} className="downtime-submenu-item">
                          <SidebarMenuButton active={activeView === 'downtime' && downtimePanel === panel} onClick={() => { onChangeView('downtime'); onChangeDowntimePanel(panel); }}>
                            <Icon size={17} />
                            <span>{label}</span>
                          </SidebarMenuButton>
                        </div>
                      ))}
                    </div>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <div className="downtime-submenu downtime-submenu-import">
                      <div className="downtime-submenu-item">
                        <SidebarMenuButton active={activeView === 'downtime' && downtimePanel === 'import'} onClick={() => { onChangeView('downtime'); onChangeDowntimePanel('import'); }}>
                          <Upload size={17} />
                          <span>Import Backfill</span>
                        </SidebarMenuButton>
                      </div>
                    </div>
                  </SidebarMenuItem>
                </Collapsible.Content>
              </Collapsible.Root>

              <Collapsible.Root defaultOpen={false} className="group/collapsible settings-section">
                <SidebarMenuItem>
                  <Collapsible.Trigger asChild>
                    <SidebarMenuButton active={activeView === 'compare-period' || activeView === 'master-entity' || activeView === 'settings'}>
                      <Settings2 size={17} />
                      <span>Lainnya</span>
                      <ChevronDown className="chevron settings-chevron" size={15} />
                    </SidebarMenuButton>
                  </Collapsible.Trigger>
                </SidebarMenuItem>
                <Collapsible.Content>
                  <SidebarMenuItem>
                    <div className="downtime-submenu settings-submenu">
                      {([
                        ['compare-period', 'Bandingkan', SplitSquareVertical],
                        ['master-entity', 'Data Mesin', BarChart3],
                        ['settings', 'Pengaturan', Settings2],
                      ] as const).map(([view, label, Icon]) => (
                        <div key={view} className="downtime-submenu-item">
                          <SidebarMenuButton active={activeView === view} onClick={() => onChangeView(view)}>
                            <Icon size={17} />
                            <span>{label}</span>
                          </SidebarMenuButton>
                        </div>
                      ))}
                    </div>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <div className="downtime-submenu settings-submenu">
                      {([
                        ['ai', 'AI', Settings2],
                        ['odata', 'Data Sync', Database],
                        ['logs', 'Riwayat', Clock3],
                        ['system', 'Sistem', HardDrive],
                      ] as const).map(([panel, label, Icon]) => (
                        <div key={panel} className="downtime-submenu-item">
                          <SidebarMenuButton active={activeView === 'settings' && settingsPanel === panel} onClick={() => { onChangeView('settings'); onChangeSettingsPanel(panel); }}>
                            <Icon size={17} />
                            <span>{label}</span>
                          </SidebarMenuButton>
                        </div>
                      ))}
                    </div>
                  </SidebarMenuItem>
                </Collapsible.Content>
              </Collapsible.Root>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {showFilters ? (
          <Collapsible.Root defaultOpen className="group/collapsible filter-section">
            <SidebarGroup>
              <SidebarGroupLabel asChild>
                <Collapsible.Trigger className="sh-collapsible-trigger">
                  <span><Filter size={14} /> Filter Data</span>
                  <ChevronDown className="chevron" size={15} />
                </Collapsible.Trigger>
              </SidebarGroupLabel>
              <Collapsible.Content>
                <SidebarGroupContent>
                  <div className="filter-subsection">
                    <div className="filter-group filter-group-compact">
                      <label>Preset Cepat</label>
                      <div className="preset-grid">
                        {quickPresets.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            aria-pressed={isPresetActive(preset.id, filters, dateRange.min, dateRange.max)}
                            className={`preset-chip ${isPresetActive(preset.id, filters, dateRange.min, dateRange.max) ? 'is-active' : ''}`}
                            onClick={() => onFiltersChange({ ...filters, ...buildPresetRange(preset.id, dateRange.min, dateRange.max) })}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="filter-group filter-group-compact">
                      <label>Bulan</label>
                      <input
                        type="month"
                        min={dateRange.min ? dateRange.min.slice(0, 7) : undefined}
                        max={dateRange.max ? dateRange.max.slice(0, 7) : undefined}
                        value={filters.month}
                        onChange={(e) => {
                          const month = e.target.value;
                          const range = getMonthRange(month, dateRange.min, dateRange.max);
                          onFiltersChange({ ...filters, month, ...range });
                        }}
                      />
                    </div>
                    <div className="filter-date-grid">
                      <div className="filter-group filter-group-compact">
                        <label>Dari tanggal</label>
                        <input type="date" value={filters.dateFrom} onChange={(e) => onFiltersChange({ ...filters, month: e.target.value.slice(0, 7), dateFrom: e.target.value })} />
                      </div>
                      <div className="filter-group filter-group-compact">
                        <label>Sampai tanggal</label>
                        <input type="date" value={filters.dateTo} onChange={(e) => onFiltersChange({ ...filters, month: e.target.value.slice(0, 7), dateTo: e.target.value })} />
                      </div>
                    </div>
                  </div>
                  <SelectField label="Area" value={filters.area} options={options.areas} allLabel="Semua area" onChange={(area) => onFiltersChange({ ...filters, area, machine: '', line: '' })} />
                  <SelectField label="Mesin" value={filters.machine} options={options.machines} allLabel="Semua mesin" onChange={(machine) => onFiltersChange({ ...filters, machine, line: '' })} />
                  <SelectField label="Kategori Item" value={filters.category} options={options.categories} allLabel="Semua kategori" onChange={(category) => onFiltersChange({ ...filters, category })} />
                  <div className="filter-group">
                    <label>Type Output</label>
                    <select value={filters.outputType} onChange={(e) => onFiltersChange({ ...filters, outputType: e.target.value as '' | 'ok' | 'reject' })}>
                      <option value="">Semua data</option>
                      <option value="ok">Output OK</option>
                      <option value="reject">Reject</option>
                    </select>
                  </div>
                  <div className="filter-group">
                    <label><Search size={13} /> Cari dokumen / item / operator</label>
                    <input placeholder="Dokumen, nama item, operator..." value={filters.search} onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })} />
                  </div>
                </SidebarGroupContent>
              </Collapsible.Content>
            </SidebarGroup>
          </Collapsible.Root>
        ) : null}

      </SidebarContent>

      <SidebarFooter>
        <div className="sidebar-footer-stats">
          <div className="sidebar-stats">
            <span>Rows aktif</span>
            <strong>{rowsCount.toLocaleString('id-ID')} / {totalRowsCount.toLocaleString('id-ID')}</strong>
          </div>
          <div className="sidebar-stats">
            <span>Data Sync</span>
            <strong>{syncStatus ? syncStatus.status : 'Belum ada'}</strong>
          </div>
        </div>
        <div className="sidebar-actions">
          <button className="btn secondary" type="button" onClick={onReset} aria-label="Reset filter" title="Reset filter">
            <RotateCcw size={15}/><span className="btn-label">Reset</span>
          </button>
          <button className="btn secondary" type="button" onClick={onSync} disabled={syncing} aria-label={syncing ? 'Sedang sync data' : 'Sync data'} title={syncing ? 'Sedang sync data' : 'Sync data'}>
            <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} /><span className="btn-label">{syncing ? 'Sync...' : 'Sync'}</span>
          </button>
          <button className="btn" type="button" onClick={onExport} aria-label="Export CSV" title="Export CSV">
            <Download size={15}/><span className="btn-label">Export</span>
          </button>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
