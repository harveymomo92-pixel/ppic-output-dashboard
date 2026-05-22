'use client';

import { Clock3, Database, Download, Save, Settings2 } from 'lucide-react';
import { numberFmt } from '@/lib/dashboard';

export type SettingsPanel = 'ai' | 'odata' | 'logs' | 'system';
export type SettingsField = { value: string; set: boolean };
export type SettingsData = {
  settings: Record<string, SettingsField>;
  syncHistory: Array<{ id: number; source: string; started_at: string; finished_at: string | null; row_count: number; status: string; message: string | null }>;
};

type Props = {
  settingsPanel: SettingsPanel;
  onChangePanel: (panel: SettingsPanel) => void;
  settingsLoading: boolean;
  settingsSaving: boolean;
  settingsError: string | null;
  syncError: string | null;
  settingsData: SettingsData | null;
  settingsDraft: Record<string, string>;
  setSettingsDraft: (updater: (current: Record<string, string>) => Record<string, string>) => void;
  onSave: () => void;
  onSync: () => void;
  syncing: boolean;
  activeView: string;
  downtimeEventsCount: number;
  latestSyncStatus?: string | null;
};

const secretLike = new Set(['GEMINI_API_KEY', 'OPENAI_API_KEY', 'PPIC_ODATA_PASSWORD', 'PPIC_ODATA_TOKEN']);

function FieldList({ items, settingsData, settingsDraft, setSettingsDraft }: { items: Array<[string, string, boolean]>; settingsData: SettingsData | null; settingsDraft: Record<string, string>; setSettingsDraft: Props['setSettingsDraft']; }) {
  return (
    <div className="settings-card">
      {items.map(([key, label, secret]) => (
        <div className="filter-group" key={key}>
          <label>{label} {settingsData?.settings?.[key]?.set ? '(terisi)' : '(kosong)'}</label>
          <input
            type={secret ? 'password' : 'text'}
            value={settingsDraft[key] ?? (secret ? '' : (settingsData?.settings?.[key]?.value ?? ''))}
            placeholder={secret ? '••••••••' : 'Masukkan nilai'}
            onChange={(e) => setSettingsDraft((current) => ({ ...current, [key]: e.target.value }))}
          />
        </div>
      ))}
    </div>
  );
}

export function SettingsSection({
  settingsPanel,
  onChangePanel,
  settingsLoading,
  settingsSaving,
  settingsError,
  syncError,
  settingsData,
  settingsDraft,
  setSettingsDraft,
  onSave,
  onSync,
  syncing,
  activeView,
  downtimeEventsCount,
  latestSyncStatus,
}: Props) {
  return (
    <>
      {settingsError ? <div className="card pad error-banner">{settingsError}</div> : null}
      <section className="card chart-card">
        <div className="chart-head">
          <div>
            <h2>Pengaturan</h2>
            <p>Pilih bagian yang ingin dicek atau diubah.</p>
          </div>
          <div className="master-entity-head-actions settings-action-strip">
            <button className="btn secondary" type="button" onClick={() => onChangePanel('logs')}><Clock3 size={15}/> Riwayat</button>
            <details className="advanced-disclosure settings-advanced-disclosure">
              <summary>Lanjutan</summary>
              <div className="advanced-disclosure-menu">
                <button className="btn secondary" type="button" onClick={() => onChangePanel('odata')}><Database size={15}/> Data Sync</button>
                <button className="btn secondary" type="button" onClick={() => onChangePanel('ai')}><Settings2 size={15}/> AI</button>
                <button className="btn secondary" type="button" onClick={() => onChangePanel('system')}><Download size={15}/> Sistem</button>
              </div>
            </details>
            <button className="btn" type="button" onClick={onSave} disabled={settingsSaving}>{settingsSaving ? 'Menyimpan...' : <><Save size={15}/> Simpan</>}</button>
          </div>
        </div>

        {settingsLoading ? <div className="empty guided-empty"><strong>Memuat pengaturan...</strong><p>Sedang mengambil status sync dan konfigurasi aktif.</p></div> : null}

        {settingsPanel === 'ai' ? (
          <div className="settings-grid">
            <FieldList settingsData={settingsData} settingsDraft={settingsDraft} setSettingsDraft={setSettingsDraft} items={[
              ['GEMINI_API_KEY', 'Gemini API Key', true],
              ['GEMINI_MODEL', 'Gemini Model', false],
            ]} />
            <FieldList settingsData={settingsData} settingsDraft={settingsDraft} setSettingsDraft={setSettingsDraft} items={[
              ['OPENAI_API_KEY', 'OpenAI API Key', true],
              ['OPENAI_BASE_URL', 'OpenAI Base URL', false],
              ['WA_PARSER_AI_MODEL', 'WA Parser AI Model', false],
            ]} />
          </div>
        ) : null}

        {settingsPanel === 'odata' ? (
          <div className="settings-grid">
            <FieldList settingsData={settingsData} settingsDraft={settingsDraft} setSettingsDraft={setSettingsDraft} items={[
              ['PPIC_ODATA_URL', 'OData URL', false],
              ['PPIC_ODATA_USER', 'OData User', false],
              ['PPIC_ODATA_PASSWORD', 'OData Password', true],
              ['PPIC_ODATA_TOKEN', 'OData Token', true],
            ]} />
            <FieldList settingsData={settingsData} settingsDraft={settingsDraft} setSettingsDraft={setSettingsDraft} items={[
              ['PPIC_ODATA_DATE_FROM', 'Date From', false],
              ['PPIC_ODATA_DATE_TO', 'Date To', false],
              ['PPIC_ODATA_PAGE_SIZE', 'Page Size', false],
              ['PPIC_ODATA_BACKFILL_DAYS', 'Backfill Days', false],
            ]} />
          </div>
        ) : null}

        {settingsPanel === 'logs' ? (
          <div className="table-wrap">
            <div className="master-entity-head-actions" style={{ marginBottom: 12 }}>
              <button className="btn secondary" type="button" onClick={onSync} disabled={syncing}>{syncing ? 'Sinkronisasi...' : 'Jalankan Sync'}</button>
            </div>
            {syncError ? <div className="card pad error-banner" style={{ marginBottom: 12, whiteSpace: 'pre-wrap' }}>{syncError}</div> : null}
            {settingsData?.syncHistory?.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Started</th><th>Finished</th><th>Source</th><th>Status</th><th>Rows</th><th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {settingsData.syncHistory.map((row) => (
                    <tr key={row.id}>
                      <td>{row.started_at || '-'}</td>
                      <td>{row.finished_at || '-'}</td>
                      <td>{row.source}</td>
                      <td>{row.status}</td>
                      <td>{numberFmt.format(row.row_count || 0)}</td>
                      <td>{row.message || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="empty guided-empty"><strong>Belum ada riwayat sync</strong><p>Klik Jalankan Sync untuk mengambil data terbaru, lalu hasilnya akan muncul di sini.</p></div>}
          </div>
        ) : null}

        {settingsPanel === 'system' ? (
          <div className="settings-grid">
            <div className="settings-card">
              <h3>Sistem</h3>
              <div className="filter-group"><label>Mode aplikasi</label><input value="Next.js app router" readOnly /></div>
              <div className="filter-group"><label>Halaman aktif</label><input value={activeView} readOnly /></div>
              <div className="filter-group"><label>Total data gangguan</label><input value={numberFmt.format(downtimeEventsCount)} readOnly /></div>
            </div>
            <div className="settings-card">
              <h3>Status Konfigurasi</h3>
              <div className="filter-group"><label>Status sync terakhir</label><input value={latestSyncStatus || '-'} readOnly /></div>
              <div className="filter-group"><label>Pengaturan aktif</label><input value={settingsData ? numberFmt.format(Object.values(settingsData.settings).filter((field) => field.set).length) : '0'} readOnly /></div>
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}
