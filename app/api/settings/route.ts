import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/server/db';
import { APP_SETTING_KEYS, isSecretSetting, loadAppSettings, maskSecret, saveAppSettings } from '@/lib/server/app-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSettings() {
  const settings = loadAppSettings();
  return Object.fromEntries(APP_SETTING_KEYS.map((key) => [key, {
    value: isSecretSetting(key) ? maskSecret(settings[key]) : (settings[key] || ''),
    set: Boolean(settings[key]),
  }]));
}

export async function GET() {
  const db = getDb();
  const syncHistory = db.prepare(`
    SELECT id, source, started_at, finished_at, row_count, status, message
    FROM sync_runs
    ORDER BY id DESC
    LIMIT 20
  `).all();
  const importHistory = db.prepare(`
    SELECT id, source, import_kind, mode, parser_mode, ai_provider, created_at, status, processed_rows, saved_rows, inserted_rows, updated_rows, existing_rows, skipped_rows, total_rows, message
    FROM downtime_import_runs
    ORDER BY id DESC
    LIMIT 20
  `).all();
  return NextResponse.json({ ok: true, settings: getSettings(), syncHistory, importHistory });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { values?: Partial<Record<(typeof APP_SETTING_KEYS)[number], string>> };
  const values = body.values || {};
  const updates: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!APP_SETTING_KEYS.includes(key as (typeof APP_SETTING_KEYS)[number])) continue;
    updates[key] = typeof value === 'string' ? value.trim() : '';
  }
  saveAppSettings(updates);
  return NextResponse.json({
    ok: true,
    settings: getSettings(),
    updated: Object.fromEntries(Object.keys(updates).map((key) => [key, Boolean(updates[key])])),
  });
}
