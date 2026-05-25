'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, FileText, PackageSearch } from 'lucide-react';
import { decimalFmt, numberFmt } from '@/lib/dashboard';
import type { DashboardFilters } from '@/components/dashboard/dashboard-sidebar';

function formatPercent(value: number) {
  return `${decimalFmt.format(value)}%`;
}

function formatCompactNumber(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${decimalFmt.format(value / 1_000_000)} jt`;
  if (abs >= 1_000) return `${decimalFmt.format(value / 1_000)} rb`;
  return numberFmt.format(value);
}

function ChartTooltip({ active, payload, label, formatter, labelFormatter }: any) {
  if (!active || !payload?.length) return null;
  const title = labelFormatter ? labelFormatter(label) : label;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{title}</div>
      {payload.map((entry: any) => (
        <div key={entry.dataKey || entry.name} className="chart-tooltip-row">
          <span className="dot" style={{ background: entry.color || entry.fill }} />
          <span>{entry.name}</span>
          <strong>{formatter ? formatter(entry.value, entry.name) : String(entry.value)}</strong>
        </div>
      ))}
    </div>
  );
}

function MetricPill({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="metric-pill">
      <strong>{value}</strong>
      <span>{label}</span>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card chart-card">
      <div className="chart-head">
        <div>
          <h2>{title}</h2>
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

function renderYAxisTick(maxChars: number) {
  return function YAxisTick({ x = 0, y = 0, payload }: any) {
    const value = String(payload?.value ?? '');
    const text = value.length > maxChars ? `${value.slice(0, maxChars - 1)}…` : value;
    return (
      <g transform={`translate(${x},${y})`}>
        <title>{value}</title>
        <text x={0} y={0} dy={5} textAnchor="end" fill="var(--muted)" fontSize={11}>{text}</text>
      </g>
    );
  };
}

function renderXAxisTick(maxChars: number) {
  return function XAxisTick({ x = 0, y = 0, payload }: any) {
    const value = String(payload?.value ?? '');
    const text = value.length > maxChars ? `${value.slice(0, maxChars - 1)}…` : value;
    return <text x={x} y={y + 12} textAnchor="middle" fill="var(--muted)" fontSize={11}>{text}</text>;
  };
}

function BarValueLabel(props: any) {
  const { x = 0, y = 0, width = 0, height = 0, value } = props;
  if (!Number(value)) return null;
  return <text x={Number(x) + Number(width) + 6} y={Number(y) + Number(height) / 2 + 4} fill="var(--muted)" fontSize={11} textAnchor="start">{formatCompactNumber(Number(value))}</text>;
}

function PercentBarLabel(props: any) {
  const { x = 0, y = 0, width = 0, height = 0, value } = props;
  if (!Number(value)) return null;
  return <text x={Number(x) + Number(width) + 6} y={Number(y) + Number(height) / 2 + 4} fill="var(--muted)" fontSize={11} textAnchor="start">{formatPercent(Number(value))}</text>;
}

function getChartDatumName(data: any) {
  return String(data?.payload?.name ?? data?.name ?? '').trim();
}

function makeSparsePercentLabel(totalPoints: number, fill: string) {
  return function SparsePercentLabel(props: any) {
    const { x = 0, y = 0, value, index = 0 } = props;
    if (!Number(value)) return null;
    const shouldShow = index === 0 || index === totalPoints - 1 || index % Math.max(3, Math.ceil(totalPoints / 8)) === 0;
    if (!shouldShow) return null;
    return <text x={Number(x)} y={Number(y) - 8} fill={fill} fontSize={11} textAnchor="middle">{formatPercent(Number(value))}</text>;
  };
}

type TrendLocalFilters = { area: string; machine: string };

export function OverviewSection({
  activeView,
  downtimePanel,
  loading,
  kpis,
  totalTargetPcs,
  overallAchievementPct,
  trend,
  trendSummary,
  trendLocalFilters,
  setTrendLocalFilters,
  trendAreaOptions,
  trendMachineOptions,
  byMachine,
  byItem,
  byCategory,
  rejectRateByLine,
  rejectRateAxisMax,
  targetSummary,
  targetAlertCount,
  targetRows,
  targetTableFilters,
  setTargetTableFilters,
  targetTableAreaOptions,
  targetStatusOptions,
  pagedTargetRows,
  targetTablePage,
  targetTableTotalPages,
  setTargetTablePage,
  targetPriorityAxisMax,
  targetPriorityChartHeight,
  targetBarColor,
  openDetailDrilldown,
  openTargetDrilldown,
  downtimeLossChartRows,
  downtimeLossChartHeight,
  downtimeCauseSummary,
  downtimeSignalColor,
  downtimeSignalLabel,
}: {
  activeView: string;
  downtimePanel: string;
  loading: boolean;
  kpis: { totalOkQty: number; rejectKg: number; rejectPcsEq: number; rejectRate: number };
  totalTargetPcs: number;
  overallAchievementPct: number;
  trend: Array<{ name: string; okQty: number; achievementPct: number; rejectPct: number }>;
  trendSummary: any;
  trendLocalFilters: TrendLocalFilters;
  setTrendLocalFilters: (value: TrendLocalFilters | ((current: TrendLocalFilters) => TrendLocalFilters)) => void;
  trendAreaOptions: string[];
  trendMachineOptions: string[];
  byMachine: Array<{ name: string; value: number }>;
  byItem: Array<{ name: string; value: number }>;
  byCategory: Array<{ name: string; value: number }>;
  rejectRateByLine: Array<{ name: string; value: number }>;
  rejectRateAxisMax: number;
  targetSummary: any;
  targetAlertCount: number;
  targetRows: any[];
  targetTableFilters: { search: string; area: string; status: string };
  setTargetTableFilters: (value: any) => void;
  targetTableAreaOptions: string[];
  targetStatusOptions: Array<{ value: string; label: string }>;
  pagedTargetRows: any[];
  targetTablePage: number;
  targetTableTotalPages: number;
  setTargetTablePage: (value: number) => void;
  targetPriorityAxisMax?: number;
  targetPriorityChartHeight?: number;
  targetBarColor?: (status: any) => string;
  openDetailDrilldown: (patch: any) => void;
  openTargetDrilldown?: (patch: any) => void;
  downtimeLossChartRows?: Array<{ name: string; value: number; signalType: string; area?: string }>;
  downtimeLossChartHeight?: number;
  downtimeCauseSummary?: Array<{ type: string; count: number; estimatedLossQty: number; estimatedDowntimeHours: number }>;
  downtimeSignalColor?: (type: any) => string;
  downtimeSignalLabel?: (type: any) => string;
}) {
  const trendAchievementLabel = useMemo(() => makeSparsePercentLabel(trend.length, '#5B7FC2'), [trend.length]);
  const trendRejectLabel = useMemo(() => makeSparsePercentLabel(trend.length, '#C26B5B'), [trend.length]);

  return (
    <>
      {activeView === 'overview' ? (
      <>
      <div className="kpis">
        <div className="card kpi"><div className="label"><PackageSearch size={16}/>Target</div><div className="value">{numberFmt.format(totalTargetPcs)}</div><div className="hint">Target sesuai filter aktif</div></div>
        <div className="card kpi"><div className="label"><PackageSearch size={16}/>Output OK (PCS)</div><div className="value">{numberFmt.format(kpis.totalOkQty)}</div><div className="hint">Output OK saja</div></div>
        <div className="card kpi"><div className="label"><Activity size={16}/>Pencapaian</div><div className="value">{`${decimalFmt.format(overallAchievementPct)}%`}</div><div className="hint">Output OK dibanding target</div></div>
        <div className="card kpi kpi-reject"><div className="label"><FileText size={16}/>Reject</div><div className="value"><div className="kpi-reject-value"><span className="kpi-reject-main">{decimalFmt.format(kpis.rejectPcsEq)} PCS</span><span className="kpi-reject-sub">/ {decimalFmt.format(kpis.rejectKg)} kg</span></div></div><div className="hint">Produk tidak lolos</div></div>
        <div className="card kpi"><div className="label"><PackageSearch size={16}/>Persentase Reject</div><div className="value">{`${decimalFmt.format(kpis.rejectRate * 100)}%`}</div><div className="hint">Reject dibanding total output</div></div>
      </div>

      {loading ? <div className="card pad">Loading data...</div> : null}

      <div className="overview-trend-wide">
        <ChartCard title="Trend Harian">
          <div className="detail-table-toolbar trend-local-toolbar">
            <div className="detail-table-toolbar-group trend-local-toolbar-main">
              <select className="local-filter-select" value={trendLocalFilters.area} onChange={(e) => setTrendLocalFilters((current) => ({ ...current, area: e.target.value, machine: '' }))}>
                <option value="">Semua area</option>
                {trendAreaOptions.map((area) => <option key={area} value={area}>{area}</option>)}
              </select>
              {trendLocalFilters.area ? (
                <select className="local-filter-select" value={trendLocalFilters.machine} onChange={(e) => setTrendLocalFilters((current) => ({ ...current, machine: e.target.value }))}>
                  <option value="">Semua mesin area ini</option>
                  {trendMachineOptions.map((machineName) => <option key={machineName} value={machineName}>{machineName}</option>)}
                </select>
              ) : null}
              {(trendLocalFilters.area || trendLocalFilters.machine) ? <button className="btn secondary table-mini-btn local-filter-reset" type="button" onClick={() => setTrendLocalFilters({ area: '', machine: '' })}>Reset Trend</button> : null}
            </div>
            <div className="detail-table-toolbar-group detail-table-toolbar-meta">
              <span className="local-filter-count">{trendLocalFilters.area || 'Semua area'}{trendLocalFilters.machine ? ` · ${trendLocalFilters.machine}` : ''}</span>
            </div>
          </div>
          <ChartFrame variant="tall">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend} margin={{ left: 8, right: 18, top: 16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" minTickGap={22} tick={renderXAxisTick(8)} interval="preserveStartEnd" />
                <YAxis yAxisId="pct" tickFormatter={(v) => `${decimalFmt.format(Number(v))}%`} width={56} />
                <YAxis yAxisId="qty" orientation="right" tickFormatter={(v) => numberFmt.format(Number(v) / 1_000_000) + ' jt'} width={58} />
                <Tooltip content={(props) => <ChartTooltip {...props} formatter={(value: any, name: any) => String(name).includes('Output') ? numberFmt.format(Number(value)) : `${decimalFmt.format(Number(value))}%`} labelFormatter={(label: any) => `Hari ${label}`} />} />
                <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine yAxisId="pct" y={100} stroke="#5E8C61" strokeDasharray="4 4" />
                <Bar yAxisId="qty" dataKey="okQty" name="Output OK" fill="#D8CBB5" radius={[4, 4, 0, 0]} />
                <Line yAxisId="pct" type="monotone" dataKey="achievementPct" name="Achievement %" stroke="#5B7FC2" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }}><LabelList content={trendAchievementLabel} /></Line>
                <Line yAxisId="pct" type="monotone" dataKey="rejectPct" name="Reject %" stroke="#C26B5B" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }}><LabelList content={trendRejectLabel} /></Line>
              </ComposedChart>
            </ResponsiveContainer>
          </ChartFrame>
          {trendSummary ? (
            <div className="metric-row">
              <MetricPill label="Total output OK" value={numberFmt.format(trendSummary.totalOkQty)} hint={`Target prorata total ${numberFmt.format(trendSummary.totalTarget)}`} />
              <MetricPill label="Rata-rata achievement" value={formatPercent(trendSummary.avgAchievementPct)} hint={`Terbaik ${trendSummary.peakAchievement.date}`} />
              <MetricPill label="Rata-rata reject" value={formatPercent(trendSummary.avgRejectPct)} hint={`Reject eq ${numberFmt.format(trendSummary.totalRejectPcsEq)}`} />
              <MetricPill label="Hari paling reject" value={formatPercent(trendSummary.peakReject.rejectPct)} hint={trendSummary.peakReject.date} />
            </div>
          ) : null}
        </ChartCard>
      </div>

      <div className="overview-chart-grid">
        <ChartCard title="Top Mesin">
          <ChartFrame>
            <ResponsiveContainer width="100%" height="100%"><BarChart data={byMachine} layout="vertical" margin={{ left: 18, right: 18, top: 12, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" tickFormatter={(v) => numberFmt.format(Number(v) / 1_000_000) + ' jt'} /><YAxis type="category" dataKey="name" width={120} tick={renderYAxisTick(18)} /><Tooltip content={(props) => <ChartTooltip {...props} formatter={(value: any) => numberFmt.format(Number(value))} />} /><Bar dataKey="value" fill="#8C877D" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(data: any) => data?.name && openDetailDrilldown({ machine: String(data.name), search: '' })}><LabelList content={BarValueLabel} /></Bar></BarChart></ResponsiveContainer>
          </ChartFrame>
        </ChartCard>
        <ChartCard title="Top Item">
          <ChartFrame>
            <ResponsiveContainer width="100%" height="100%"><BarChart data={byItem} layout="vertical" margin={{ left: 18, right: 18, top: 12, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" tickFormatter={(v) => numberFmt.format(Number(v) / 1_000_000) + ' jt'} /><YAxis type="category" dataKey="name" width={132} tick={renderYAxisTick(20)} /><Tooltip content={(props) => <ChartTooltip {...props} formatter={(value: any) => numberFmt.format(Number(value))} />} labelFormatter={(label: any) => String(label ?? '')} /><Bar dataKey="value" fill="#8C877D" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(data: any) => data?.name && openDetailDrilldown({ search: String(data.name), machine: '' })}><LabelList content={BarValueLabel} /></Bar></BarChart></ResponsiveContainer>
          </ChartFrame>
        </ChartCard>
        <ChartCard title="Kategori Item">
          <ChartFrame>
            <ResponsiveContainer width="100%" height="100%"><BarChart data={byCategory} layout="vertical" margin={{ left: 18, right: 18, top: 12, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" tickFormatter={(v) => numberFmt.format(Number(v) / 1_000_000) + ' jt'} width={56} /><YAxis type="category" dataKey="name" width={132} tick={renderYAxisTick(18)} /><Tooltip content={(props) => <ChartTooltip {...props} formatter={(value: any) => numberFmt.format(Number(value))} />} /><Bar dataKey="value" fill="#8C877D" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(data: any) => data?.name && openDetailDrilldown({ search: String(data.name), machine: '' })}><LabelList content={BarValueLabel} /></Bar></BarChart></ResponsiveContainer>
          </ChartFrame>
        </ChartCard>
        <ChartCard title="Reject per Mesin">
          <ChartFrame>
            <ResponsiveContainer width="100%" height="100%"><BarChart data={rejectRateByLine} layout="vertical" margin={{ left: 18, right: 38, top: 12, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" tickFormatter={(v) => `${decimalFmt.format(Number(v))}%`} domain={[0, rejectRateAxisMax]} /><YAxis type="category" dataKey="name" width={140} tick={renderYAxisTick(20)} /><Tooltip content={(props) => <ChartTooltip {...props} formatter={(value: any) => formatPercent(Number(value))} />} /><Bar dataKey="value" fill="#C26B5B" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(data: any) => data?.name && openDetailDrilldown({ machine: String(data.name), search: '' })}><LabelList content={PercentBarLabel} /></Bar></BarChart></ResponsiveContainer>
          </ChartFrame>
        </ChartCard>
      </div>

      <section className="card chart-card" id="target-production-section">
        <div className="metric-row">
          <MetricPill label="No record" value={numberFmt.format(targetSummary.noRecord.length)} hint="Belum ada output/jam kerja" />
          <MetricPill label="Under target" value={numberFmt.format(targetSummary.underTarget.length)} hint="Di bawah target achievement" />
          <MetricPill label="On / above track" value={numberFmt.format(targetSummary.onTrack.length + targetSummary.aboveTarget.length)} hint={`${targetSummary.aboveTarget.length} mesin above target`} />
          <MetricPill label="Alert" value={numberFmt.format(targetAlertCount)} hint="No record + under target + reject tinggi" />
          <MetricPill label="Paling perlu perhatian" value={targetSummary.worstProrata?.display_laporan ?? '-'} hint={targetSummary.worstProrata ? `${decimalFmt.format(targetSummary.worstProrata.prorataAchievement * 100)}% vs prorata` : '-'} />
        </div>
        <ChartFrame variant="tall" height={targetPriorityChartHeight}>
          {targetRows.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={targetRows} layout="vertical" margin={{ left: 18, right: 46, top: 12, bottom: 4 }} barCategoryGap={8}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v) => `${decimalFmt.format(Number(v))}%`} domain={[0, targetPriorityAxisMax || 120]} />
                <YAxis type="category" dataKey="name" width={150} tick={renderYAxisTick(22)} />
                <Tooltip content={(props) => <ChartTooltip {...props} formatter={(value: any) => formatPercent(Number(value))} />} />
                <ReferenceLine x={100} stroke="#5E8C61" strokeDasharray="4 4" label={{ value: 'Target 100%', position: 'top', fill: '#5E8C61', fontSize: 11 }} />
                <Bar
                  dataKey="prorataPct"
                  name="Progress vs Prorata"
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                  onClick={(data: any) => {
                    const name = getChartDatumName(data);
                    if (name) (openTargetDrilldown || openDetailDrilldown)({ search: name });
                  }}
                >
                  {targetRows.map((row: any, index: number) => (
                    <Cell
                      key={`${row.name}-${index}`}
                      fill={targetBarColor ? targetBarColor(row.status) : '#5B7FC2'}
                      onClick={() => row?.name && (openTargetDrilldown || openDetailDrilldown)({ search: String(row.name) })}
                    />
                  ))}
                  <LabelList content={PercentBarLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
           ) : <div className="empty guided-empty"><strong>Target belum tampil</strong><p>Coba longgarkan filter area/mesin, atau cek apakah master target dan data output sudah tersinkron.</p></div>}
        </ChartFrame>
        <div className="detail-table-toolbar trend-local-toolbar">
          <div className="detail-table-toolbar-group">
            <input className="detail-table-input" value={targetTableFilters.search} onChange={(e) => setTargetTableFilters((current: any) => ({ ...current, search: e.target.value }))} placeholder="Cari mesin / produk..." />
            <select className="detail-table-select" value={targetTableFilters.area} onChange={(e) => setTargetTableFilters((current: any) => ({ ...current, area: e.target.value }))}>
              <option value="">Semua area</option>
              {targetTableAreaOptions.map((area) => <option key={area} value={area}>{area}</option>)}
            </select>
            <select className="detail-table-select" value={targetTableFilters.status} onChange={(e) => setTargetTableFilters((current: any) => ({ ...current, status: e.target.value }))}>
              {targetStatusOptions.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
            </select>
            {(targetTableFilters.search || targetTableFilters.area || targetTableFilters.status) ? <button className="btn secondary table-mini-btn" type="button" onClick={() => setTargetTableFilters({ search: '', area: '', status: '' })}>Reset</button> : null}
          </div>
        </div>
        <div className="detail-table-scroll">
          <table className="detail-table target-table">
            <thead>
              <tr>
                <th>Mesin & Produk</th>
                <th>Status</th>
                <th className="num">Target</th>
                <th className="num">Output OK</th>
                <th className="num">Target Mesin</th>
                <th className="num">Jam</th>
                <th className="num">Target Harian</th>
                <th className="num">Pencapaian</th>
                <th className="num">Target Pencapaian</th>
                <th className="num">Reject</th>
                <th className="num">Target Reject</th>
              </tr>
            </thead>
            <tbody>
              {pagedTargetRows.length ? pagedTargetRows.map((row) => (
                <tr key={row.ui_id || row.display_laporan} className={row.status === 'no-record' ? 'target-alert-row' : ''}>
                  <td><div className="machine-product-cell"><strong>{row.display_laporan || '-'}</strong><span>{row.area_kerja_line || '-'} · {row.productCount} produk</span></div></td>
                  <td><span className={`status-badge ${row.status}`}>{row.status}</span></td>
                  <td className="num">{row.prorataTarget ? `${decimalFmt.format(row.prorataAchievement * 100)}%` : '-'}</td>
                  <td className="num">{numberFmt.format(row.output)}</td>
                  <td className="num">{row.prorataTarget ? numberFmt.format(row.prorataTarget) : '-'}</td>
                  <td className="num">{row.workHours ? decimalFmt.format(row.workHours) : '-'}</td>
                  <td className="num">{row.dailyTarget ? numberFmt.format(row.dailyTarget) : '-'}</td>
                  <td className="num">{row.dailyTarget ? `${decimalFmt.format(row.achievement * 100)}%` : '-'}</td>
                  <td className="num">{decimalFmt.format(row.targetAchievementRate * 100)}%</td>
                  <td className="num">{row.output || row.rejectPcsEq ? `${decimalFmt.format(row.rejectRate * 100)}%` : '-'}</td>
                  <td className="num">{row.rejectTargetLabel}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={11}>
                    <div className="empty guided-empty table-empty"><strong>Tidak ada baris target</strong><p>Reset pencarian/status, atau pilih area yang masih punya data target.</p></div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="detail-table-pagination">
          <button className="btn secondary table-mini-btn" type="button" onClick={() => setTargetTablePage(Math.max(1, targetTablePage - 1))} disabled={targetTablePage <= 1}>Prev</button>
          <span className="muted">{targetTablePage} / {targetTableTotalPages}</span>
          <button className="btn secondary table-mini-btn" type="button" onClick={() => setTargetTablePage(Math.min(targetTableTotalPages, targetTablePage + 1))} disabled={targetTablePage >= targetTableTotalPages}>Next</button>
        </div>
      </section>
      </>
      ) : null}

      {activeView === 'downtime' && downtimePanel === 'analysis' ? (
        <div className="overview-chart-grid downtime-chart-grid">
        <ChartCard title="Estimasi Loss Output per Mesin">
            <ChartFrame variant="tall" >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={downtimeLossChartRows || []} layout="vertical" margin={{ left: 18, right: 42, top: 12, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => formatCompactNumber(Number(v))} />
                  <YAxis type="category" dataKey="name" width={132} tick={renderYAxisTick(20)} />
                  <Tooltip content={(props) => <ChartTooltip {...props} formatter={(value: any) => numberFmt.format(Number(value))} labelFormatter={(label: any) => String(label ?? '')} />} />
                  <Bar dataKey="value" name="Estimated loss output" radius={[0, 5, 5, 0]}>
                    {(downtimeLossChartRows || []).map((row) => (
                      <Cell key={`${row.name}-${row.signalType}`} fill={downtimeSignalColor ? downtimeSignalColor(row.signalType) : '#8C877D'} />
                    ))}
                    <LabelList content={BarValueLabel} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          </ChartCard>

          <section className="card chart-card">
            <div className="chart-head">
              <div>
                <h2>Komposisi Dugaan Gangguan</h2>
                <p>Dikelompokkan dari pola performa saat ini, supaya nanti kategori downtime asli tinggal mengikuti kerangka ini.</p>
              </div>
            </div>
            <div className="downtime-cause-grid">
              {(downtimeCauseSummary || []).map((item) => (
                <div key={item.type} className="downtime-cause-card">
                  <div className="downtime-cause-dot" style={{ backgroundColor: downtimeSignalColor ? downtimeSignalColor(item.type) : '#8C877D' }} />
                  <strong>{downtimeSignalLabel ? downtimeSignalLabel(item.type) : item.type}</strong>
                  <span>{numberFmt.format(item.count)} mesin</span>
                  <em>{numberFmt.format(item.estimatedLossQty)} pcs loss · {decimalFmt.format(item.estimatedDowntimeHours)} jam</em>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
