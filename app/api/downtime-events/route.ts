import { NextRequest, NextResponse } from 'next/server';
import { clean, getDb, numberOrNull } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DowntimeDbRow = Record<string, string | number | null>;

const allowedStatuses = new Set(['open', 'monitoring', 'closed']);
const allowedCategories = new Set(['setup', 'machine-trouble', 'material', 'mould', 'electrical', 'qc-hold', 'waiting-order', 'cleaning', 'minor-stop', 'other']);

function value(value: unknown) {
  return value === null || value === undefined ? '' : String(value);
}

function rowToClient(row: DowntimeDbRow) {
  return {
    id: String(row.id),
    ui_id: String(row.id),
    event_date: value(row.event_date),
    shift_code: value(row.shift_code),
    area: value(row.area),
    machine: value(row.machine),
    line: value(row.line),
    category: value(row.category),
    start_time: value(row.start_time),
    end_time: value(row.end_time),
    duration_minutes: Number(row.duration_minutes ?? 0),
    status: value(row.status),
    pic: value(row.pic),
    root_cause: value(row.root_cause),
    action_taken: value(row.action_taken),
    estimated_loss_output: Number(row.estimated_loss_output ?? 0),
    linked_signal_type: value(row.linked_signal_type),
    created_at: value(row.created_at),
    updated_at: value(row.updated_at),
  };
}

function minutesBetween(eventDate: string, startTime: string, endTime: string) {
  if (!eventDate || !startTime || !endTime) return 0;
  const start = new Date(`${eventDate}T${startTime}:00+07:00`);
  let end = new Date(`${eventDate}T${endTime}:00+07:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  if (end < start) end = new Date(end.getTime() + 86400000);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function normalizeBody(body: Record<string, unknown>) {
  const eventDate = clean(body.event_date);
  const machine = clean(body.machine);
  const startTime = clean(body.start_time);
  const endTime = clean(body.end_time);
  const rawStatus = clean(body.status || 'open');
  const rawCategory = clean(body.category || 'other');
  const durationFromBody = numberOrNull(body.duration_minutes);
  const calculatedDuration = minutesBetween(eventDate, startTime, endTime);
  return {
    event_date: eventDate,
    shift_code: clean(body.shift_code),
    area: clean(body.area),
    machine,
    line: clean(body.line),
    category: allowedCategories.has(rawCategory) ? rawCategory : 'other',
    start_time: startTime,
    end_time: endTime,
    duration_minutes: durationFromBody && durationFromBody > 0 ? durationFromBody : calculatedDuration,
    status: allowedStatuses.has(rawStatus) ? rawStatus : 'open',
    pic: clean(body.pic),
    root_cause: clean(body.root_cause),
    action_taken: clean(body.action_taken),
    estimated_loss_output: numberOrNull(body.estimated_loss_output) ?? 0,
    linked_signal_type: clean(body.linked_signal_type),
  };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const dateFrom = params.get('dateFrom') || '';
  const dateTo = params.get('dateTo') || '';
  const category = params.get('category') || '';
  const shift = params.get('shift') || '';
  const status = params.get('status') || '';
  const machine = params.get('machine') || '';

  const where: string[] = [];
  const bind: string[] = [];
  if (dateFrom) { where.push('event_date >= ?'); bind.push(dateFrom); }
  if (dateTo) { where.push('event_date <= ?'); bind.push(dateTo); }
  if (category) { where.push('category = ?'); bind.push(category); }
  if (shift) { where.push('shift_code = ?'); bind.push(shift); }
  if (status) { where.push('status = ?'); bind.push(status); }
  if (machine) { where.push('machine = ?'); bind.push(machine); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const db = getDb();
  try {
    const rows = db.prepare(`
      SELECT * FROM downtime_events
      ${whereSql}
      ORDER BY event_date DESC, start_time DESC, id DESC
    `).all(...bind) as DowntimeDbRow[];
    return NextResponse.json({ data: rows.map(rowToClient) });
  } finally {
    db.close();
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>;
  const row = normalizeBody(body);
  if (!row.event_date || !row.machine || !row.category || !row.start_time || !row.end_time) {
    return NextResponse.json({ error: 'event_date, machine, category, start_time, and end_time are required' }, { status: 400 });
  }

  const db = getDb();
  try {
    const result = db.prepare(`
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
    `).run(
      row.event_date, row.shift_code, row.area, row.machine, row.line, row.category, row.start_time, row.end_time,
      row.duration_minutes, row.status, row.pic, row.root_cause, row.action_taken, row.estimated_loss_output, row.linked_signal_type,
    );
    const saved = db.prepare(`
      SELECT * FROM downtime_events
      WHERE event_date = ? AND shift_code = ? AND area = ? AND machine = ? AND line = ? AND category = ? AND start_time = ? AND end_time = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(row.event_date, row.shift_code, row.area, row.machine, row.line, row.category, row.start_time, row.end_time) as DowntimeDbRow;
    return NextResponse.json({ data: rowToClient(saved) }, { status: 201 });
  } finally {
    db.close();
  }
}
