import { getDb } from '@/lib/server/db';
import { loadRuntimeEnv } from '@/lib/server/runtime-env';

export const APP_SETTING_KEYS = [
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'GEMINI_MODEL',
  'WA_PARSER_AI_MODEL',
  'PPIC_ODATA_URL',
  'PPIC_ODATA_USER',
  'PPIC_ODATA_PASSWORD',
  'PPIC_ODATA_TOKEN',
  'PPIC_ODATA_DATE_FROM',
  'PPIC_ODATA_DATE_TO',
  'PPIC_ODATA_PAGE_SIZE',
  'PPIC_ODATA_BACKFILL_DAYS',
] as const;

export type AppSettingKey = typeof APP_SETTING_KEYS[number];

const secretKeys = new Set<AppSettingKey>(['GEMINI_API_KEY', 'OPENAI_API_KEY', 'PPIC_ODATA_PASSWORD', 'PPIC_ODATA_TOKEN']);

export function loadAppSettings() {
  const db = getDb();
  const rows = db.prepare(`SELECT key, value FROM app_settings WHERE key IN (${APP_SETTING_KEYS.map(() => '?').join(',')})`).all(...APP_SETTING_KEYS) as Array<{ key: AppSettingKey; value: string }>;
  const map = new Map(rows.map((row) => [row.key, row.value] as const));
  const runtimeEnv = loadRuntimeEnv();
  return Object.fromEntries(APP_SETTING_KEYS.map((key) => [key, map.get(key) || runtimeEnv[key] || process.env[key] || ''])) as Record<AppSettingKey, string>;
}

export function saveAppSettings(updates: Partial<Record<AppSettingKey, string | undefined | null>>) {
  const db = getDb();
  const stmt = db.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`);
  for (const [key, value] of Object.entries(updates) as Array<[AppSettingKey, string | undefined | null]>) {
    if (value === undefined || value === null || value === '') {
      db.prepare(`DELETE FROM app_settings WHERE key = ?`).run(key);
      continue;
    }
    stmt.run(key, value);
  }
  return loadAppSettings();
}

export function maskSecret(value: string | undefined | null) {
  if (!value) return '';
  const text = String(value);
  if (text.length <= 4) return '••••';
  return `${text.slice(0, 2)}••••${text.slice(-2)}`;
}

export function isSecretSetting(key: AppSettingKey) {
  return secretKeys.has(key);
}
