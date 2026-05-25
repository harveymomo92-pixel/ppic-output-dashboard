'use client';

import { CheckCircle2, Clock3, Database, Download, Loader2, Save, Settings2 } from 'lucide-react';
import { numberFmt } from '@/lib/dashboard';

export type SettingsPanel = 'ai' | 'odata' | 'logs' | 'system';
export type SettingsField = { value: string; set: boolean };
export type AiProviderKey = 'gemini' | 'openai' | 'groq' | 'mistral';
export type ApiKeyCheckResult = {
  ready: boolean;
  keyValid: boolean;
  modelValid: boolean | null;
  message: string;
  details: string;
  checkedAt: string;
  endpoint: string;
  source: 'draft' | 'saved';
  model: string;
  baseUrl: string;
};
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
  onCheckApiKey: (provider: AiProviderKey) => void;
  checkingApiKey: AiProviderKey | null;
  apiKeyCheckResults: Partial<Record<AiProviderKey, ApiKeyCheckResult>>;
  onSync: () => void;
  syncing: boolean;
  activeView: string;
  downtimeEventsCount: number;
  latestSyncStatus?: string | null;
};

function FieldList({
  title,
  items,
  settingsData,
  settingsDraft,
  setSettingsDraft,
  checkProvider,
  checkingApiKey,
  apiKeyCheckResult,
  onCheckApiKey,
}: {
  title: string;
  items: Array<[string, string, boolean]>;
  settingsData: SettingsData | null;
  settingsDraft: Record<string, string>;
  setSettingsDraft: Props['setSettingsDraft'];
  checkProvider?: AiProviderKey;
  checkingApiKey: AiProviderKey | null;
  apiKeyCheckResult?: ApiKeyCheckResult | null;
  onCheckApiKey?: Props['onCheckApiKey'];
}) {
  const isChecking = Boolean(checkProvider && checkingApiKey === checkProvider);
  return (
    <div className="settings-card">
      <div className="settings-card-head">
        <h3>{title}</h3>
        {checkProvider && onCheckApiKey ? (
          <button className="btn secondary table-mini-btn" type="button" onClick={() => onCheckApiKey(checkProvider)} disabled={isChecking}>
            {isChecking ? <><Loader2 size={14} /> Mengecek...</> : <><CheckCircle2 size={14} /> Cek API Key</>}
          </button>
        ) : null}
      </div>
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
      {apiKeyCheckResult ? (
        <div className={`settings-check-result ${apiKeyCheckResult.ready ? 'is-valid' : 'is-invalid'}`}>
          <div className="settings-check-result-head">
            <span className={`status-badge ${apiKeyCheckResult.ready ? 'closed' : 'open'}`}>{apiKeyCheckResult.ready ? 'VALID' : 'PERLU CEK'}</span>
            <strong>{apiKeyCheckResult.message}</strong>
          </div>
          <div className="settings-check-result-meta">{apiKeyCheckResult.details}</div>
          <div className="settings-check-result-meta">
            {apiKeyCheckResult.source === 'draft' ? 'Menggunakan nilai draft saat ini.' : 'Menggunakan nilai yang tersimpan di server.'}
          </div>
          {apiKeyCheckResult.model ? <div className="settings-check-result-meta">Model: {apiKeyCheckResult.model}</div> : null}
          {apiKeyCheckResult.baseUrl ? <div className="settings-check-result-meta">Base URL: {apiKeyCheckResult.baseUrl}</div> : null}
          <div className="settings-check-result-meta">Dicek: {apiKeyCheckResult.checkedAt}</div>
        </div>
      ) : null}
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
  onCheckApiKey,
  checkingApiKey,
  apiKeyCheckResults,
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
            <FieldList title="Gemini" checkProvider="gemini" checkingApiKey={checkingApiKey} apiKeyCheckResult={apiKeyCheckResults.gemini} onCheckApiKey={onCheckApiKey} settingsData={settingsData} settingsDraft={settingsDraft} setSettingsDraft={setSettingsDraft} items={[
              ['GEMINI_API_KEY', 'Gemini API Key', true],
              ['GEMINI_MODEL', 'Gemini Model', false],
            ]} />
            <FieldList title="OpenAI" checkProvider="openai" checkingApiKey={checkingApiKey} apiKeyCheckResult={apiKeyCheckResults.openai} onCheckApiKey={onCheckApiKey} settingsData={settingsData} settingsDraft={settingsDraft} setSettingsDraft={setSettingsDraft} items={[
              ['OPENAI_API_KEY', 'OpenAI API Key', true],
              ['OPENAI_BASE_URL', 'OpenAI Base URL', false],
              ['WA_PARSER_AI_MODEL', 'WA Parser AI Model', false],
            ]} />
            <FieldList title="Groq" checkProvider="groq" checkingApiKey={checkingApiKey} apiKeyCheckResult={apiKeyCheckResults.groq} onCheckApiKey={onCheckApiKey} settingsData={settingsData} settingsDraft={settingsDraft} setSettingsDraft={setSettingsDraft} items={[
              ['GROQ_API_KEY', 'Groq API Key', true],
              ['GROQ_MODEL', 'Groq Model', false],
            ]} />
            <FieldList title="Mistral" checkProvider="mistral" checkingApiKey={checkingApiKey} apiKeyCheckResult={apiKeyCheckResults.mistral} onCheckApiKey={onCheckApiKey} settingsData={settingsData} settingsDraft={settingsDraft} setSettingsDraft={setSettingsDraft} items={[
              ['MISTRAL_API_KEY', 'Mistral API Key', true],
              ['MISTRAL_MODEL', 'Mistral Model', false],
            ]} />
          </div>
        ) : null}

        {settingsPanel === 'odata' ? (
          <div className="settings-grid">
            <FieldList title="OData Produksi" checkingApiKey={checkingApiKey} settingsData={settingsData} settingsDraft={settingsDraft} setSettingsDraft={setSettingsDraft} items={[
              ['PPIC_ODATA_URL', 'OData URL', false],
              ['PPIC_ODATA_USER', 'OData User', false],
              ['PPIC_ODATA_PASSWORD', 'OData Password', true],
              ['PPIC_ODATA_TOKEN', 'OData Token', true],
            ]} />
            <FieldList title="Jadwal Sync" checkingApiKey={checkingApiKey} settingsData={settingsData} settingsDraft={settingsDraft} setSettingsDraft={setSettingsDraft} items={[
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
