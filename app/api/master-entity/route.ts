import { NextRequest, NextResponse } from 'next/server';
import { clean, getDb, normalizeCode, numberOrNull, rejectRateOrNull } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DbRow = Record<string, string | number | null>;

function value(value: unknown) {
  return value === null || value === undefined ? '' : String(value);
}

function rowToClient(row: DbRow) {
  return {
    ui_id: String(row.id),
    id: String(row.id),
    area_kerja_line: value(row.area_kerja_line),
    kode_asli_sistem: value(row.kode_asli_sistem),
    kode_asli_normalized: value(row.kode_asli_normalized),
    display_laporan: value(row.display_laporan),
    deskripsi_produk: value(row.deskripsi_produk),
    target_botol_preform: value(row.target_botol_preform),
    target_thermoforming: value(row.target_thermoforming),
    target_thermoforming_gw_gt_12: value(row.target_thermoforming_gw_gt_12),
    target_printing_non_oz: value(row.target_printing_non_oz),
    target_printing_oz_lt_20: value(row.target_printing_oz_lt_20),
    target_printing_22_oz: value(row.target_printing_22_oz),
    active_target_type: value(row.active_target_type),
    active_target: value(row.active_target),
    target_achievement_rate: value(row.target_achievement_rate),
    target_reject_rate: value(row.target_reject_rate),
  };
}

function achievementRateOrNull(value: unknown) {
  const parsed = rejectRateOrNull(value);
  return parsed && parsed > 1 ? parsed / 100 : parsed;
}

function defaultAchievementRate(area: string) {
  const normalized = normalizeCode(area);
  if (normalized === 'INJECTION' || normalized === 'PREFORM') return 0.9;
  if (normalized === 'PRINTING') return 0.85;
  if (normalized === 'BLOWING' || normalized === 'THERMOFORMING') return 0.8;
  return null;
}

function targetsFromBody(body: Record<string, unknown>) {
  const targetType = clean(body.active_target_type);
  const targetValue = numberOrNull(body.active_target);
  return {
    target_botol_preform: targetType === 'target_botol_preform' ? targetValue : numberOrNull(body.target_botol_preform),
    target_thermoforming: targetType === 'target_thermoforming' ? targetValue : numberOrNull(body.target_thermoforming),
    target_thermoforming_gw_gt_12: targetType === 'target_thermoforming_gw_gt_12' ? targetValue : numberOrNull(body.target_thermoforming_gw_gt_12),
    target_printing_non_oz: targetType === 'target_printing_non_oz' ? targetValue : numberOrNull(body.target_printing_non_oz),
    target_printing_oz_lt_20: targetType === 'target_printing_oz_lt_20' ? targetValue : numberOrNull(body.target_printing_oz_lt_20),
    target_printing_22_oz: targetType === 'target_printing_22_oz' ? targetValue : numberOrNull(body.target_printing_22_oz),
  };
}

export async function GET() {
  const db = getDb();
  try {
    const rows = db.prepare('SELECT * FROM master_entity_target ORDER BY area_kerja_line, kode_asli_sistem, id').all() as DbRow[];
    return NextResponse.json({ data: rows.map(rowToClient) });
  } finally {
    db.close();
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>;
  const area = clean(body.area_kerja_line);
  const code = clean(body.kode_asli_sistem);
  if (!area || !code) {
    return NextResponse.json({ error: 'area_kerja_line and kode_asli_sistem are required' }, { status: 400 });
  }

  const targets = targetsFromBody(body);
  const db = getDb();
  try {
    const result = db.prepare(`
      INSERT INTO master_entity_target (
        area_kerja_line, kode_asli_sistem, kode_asli_normalized, display_laporan, deskripsi_produk,
        target_botol_preform, target_thermoforming, target_thermoforming_gw_gt_12,
        target_printing_non_oz, target_printing_oz_lt_20, target_printing_22_oz,
        active_target_type, active_target, target_achievement_rate, target_reject_rate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      area,
      code,
      normalizeCode(code),
      clean(body.display_laporan),
      clean(body.deskripsi_produk),
      targets.target_botol_preform,
      targets.target_thermoforming,
      targets.target_thermoforming_gw_gt_12,
      targets.target_printing_non_oz,
      targets.target_printing_oz_lt_20,
      targets.target_printing_22_oz,
      clean(body.active_target_type),
      numberOrNull(body.active_target),
      achievementRateOrNull(body.target_achievement_rate) ?? defaultAchievementRate(area),
      rejectRateOrNull(body.target_reject_rate),
    );
    const row = db.prepare('SELECT * FROM master_entity_target WHERE id = ?').get(result.lastInsertRowid) as DbRow;
    return NextResponse.json({ data: rowToClient(row) }, { status: 201 });
  } finally {
    db.close();
  }
}
