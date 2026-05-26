import { NextRequest, NextResponse } from 'next/server';
import { clean, getDb, numberOrNull } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DowntimeDbRow = Record<string, string | number | null>;

type RouteContext = { params: Promise<{ id: string }> };

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
  const startTime = clean(body.start_time);
  const endTime = clean(body.end_time);
  const rawStatus = clean(body.status || 'open');
  const rawCategory = clean(body.category || 'other');
  const hasDurationBody = body.duration_minutes !== null && body.duration_minutes !== undefined && body.duration_minutes !== '';
  const durationFromBody = hasDurationBody ? numberOrNull(body.duration_minutes) : null;
  const calculatedDuration = minutesBetween(eventDate, startTime, endTime);
  const hasTimePair = Boolean(startTime && endTime);
  return {
    event_date: eventDate,
    shift_code: clean(body.shift_code),
    area: clean(body.area),
    machine: clean(body.machine),
    line: clean(body.line),
    category: allowedCategories.has(rawCategory) ? rawCategory : 'other',
    start_time: startTime,
    end_time: endTime,
    duration_minutes: durationFromBody !== null ? durationFromBody : calculatedDuration,
    status: allowedStatuses.has(rawStatus) ? rawStatus : 'open',
    pic: clean(body.pic),
    root_cause: clean(body.root_cause),
    action_taken: clean(body.action_taken),
    estimated_loss_output: numberOrNull(body.estimated_loss_output) ?? 0,
    linked_signal_type: clean(body.linked_signal_type),
    has_duration_body: hasDurationBody,
    has_time_pair: hasTimePair,
  };
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json() as Record<string, unknown>;
  const row = normalizeBody(body);
  const db = getDb();
  try {
    if (!row.event_date || !row.machine || !row.category || (!row.has_time_pair && !row.has_duration_body)) {
      return NextResponse.json({ error: 'event_date, machine, category, dan start/end atau duration_minutes wajib diisi' }, { status: 400 });
    }
    const result = db.prepare(`
      UPDATE downtime_events SET
        event_date = ?, shift_code = ?, area = ?, machine = ?, line = ?, category = ?,
        start_time = ?, end_time = ?, duration_minutes = ?, status = ?, pic = ?,
        root_cause = ?, action_taken = ?, estimated_loss_output = ?, linked_signal_type = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      row.event_date, row.shift_code, row.area, row.machine, row.line, row.category,
      row.start_time, row.end_time, row.duration_minutes, row.status, row.pic,
      row.root_cause, row.action_taken, row.estimated_loss_output, row.linked_signal_type, id,
    );
    if (!result.changes) return NextResponse.json({ error: 'Downtime event not found' }, { status: 404 });
    const saved = db.prepare('SELECT * FROM downtime_events WHERE id = ?').get(id) as DowntimeDbRow;
    return NextResponse.json({ data: rowToClient(saved) });
  } finally {
    db.close();
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const db = getDb();
  try {
    const result = db.prepare('DELETE FROM downtime_events WHERE id = ?').run(id);
    if (!result.changes) return NextResponse.json({ error: 'Downtime event not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } finally {
    db.close();
  }
}
