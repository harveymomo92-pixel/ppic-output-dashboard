export type DowntimeWaCondition = 'downtime' | 'lancar' | 'off' | 'normal' | 'standby' | 'setup' | 'cleaning' | 'trial' | 'running' | 'changeover' | 'unknown';

export type DowntimeWaShiftWindow = { start: string; end: string };

export type DowntimeWaTimingArgs = {
  eventDate: string;
  shiftCode: string;
  condition?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number | null;
};

export type DowntimeWaTimingResolution = {
  startTime: string;
  endTime: string;
  durationMinutes: number;
  condition: DowntimeWaCondition | '';
};

const shiftWindows: Record<string, DowntimeWaShiftWindow> = {
  '1': { start: '07:00', end: '15:00' },
  '2': { start: '15:00', end: '23:00' },
  '3': { start: '23:00', end: '07:00' },
};

function cleanTimeText(value: string | null | undefined) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim();
}

export function resolveDowntimeWaShiftWindow(shiftCode: string): DowntimeWaShiftWindow {
  const normalized = cleanTimeText(shiftCode).match(/[123]/)?.[0] || '1';
  return shiftWindows[normalized] || shiftWindows['1'];
}

export function isPlaceholderDowntimeWaTime(value: string | null | undefined) {
  const normalized = cleanTimeText(value).toLowerCase();
  return !normalized || normalized === '00:00' || normalized === '0:00' || normalized === '00.00' || normalized === '0.00' || normalized === '-' || normalized === '--' || normalized === 'n/a' || normalized === 'na';
}

export function parseDowntimeWaTimeToMinutes(value: string) {
  const [hour = 0, minute = 0] = cleanTimeText(value).split(':').map((part) => Number(part) || 0);
  return hour * 60 + minute;
}

export function isDowntimeWaTimeWithinShiftWindow(time: string, shiftCode: string) {
  const normalizedTime = cleanTimeText(time);
  if (!normalizedTime) return false;
  const shiftWindow = resolveDowntimeWaShiftWindow(shiftCode);
  const start = parseDowntimeWaTimeToMinutes(shiftWindow.start);
  const end = parseDowntimeWaTimeToMinutes(shiftWindow.end);
  const target = parseDowntimeWaTimeToMinutes(normalizedTime);
  if (start < end) return target >= start && target < end;
  return target >= start || target < end;
}

export function normalizeDowntimeWaCondition(...values: Array<string | undefined | null>): DowntimeWaCondition | '' {
  for (const value of values) {
    const raw = cleanTimeText(value).toLowerCase();
    if (!raw) continue;
    if (/\bno\s*order\b|\bclose\s*order\b|\bsisa\s*order\b|\bwaiting\s*order\b|\btunggu\s*order\b/.test(raw)) return 'standby';
    if (/^(?:lancar|aman|normal|ok|all ok|steady)$/i.test(raw)) return 'lancar';
    if (/\boff\b/.test(raw)) return 'off';
    if (/\bstandby\b|\bwaiting\b|\btunggu\b/.test(raw)) return 'standby';
    if (/\bsetup\b/.test(raw)) return 'setup';
    if (/\bcleaning\b/.test(raw)) return 'cleaning';
    if (/\btrial\b/.test(raw)) return 'trial';
    if (/\brunning\b/.test(raw)) return 'running';
    if (/\bchangeover\b/.test(raw)) return 'changeover';
  }
  return '';
}

export function addDowntimeWaMinutes(time: string, minutes: number) {
  const [hour = 0, minute = 0] = cleanTimeText(time).split(':').map((part) => Number(part) || 0);
  const total = ((hour * 60 + minute + minutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function deriveDowntimeWaDurationMinutes(start: string, end: string) {
  if (!start || !end) return 0;
  const startMinutes = parseDowntimeWaTimeToMinutes(start);
  let endMinutes = parseDowntimeWaTimeToMinutes(end);
  if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes)) return 0;
  if (endMinutes <= startMinutes) endMinutes += 1440;
  return Math.max(0, endMinutes - startMinutes);
}

export function resolveDowntimeWaTiming(args: DowntimeWaTimingArgs): DowntimeWaTimingResolution {
  const shiftWindow = resolveDowntimeWaShiftWindow(args.shiftCode);
  const condition = normalizeDowntimeWaCondition(args.condition);
  const startProvided = !isPlaceholderDowntimeWaTime(args.startTime);
  const endProvided = !isPlaceholderDowntimeWaTime(args.endTime);
  const hasDuration = typeof args.durationMinutes === 'number' && args.durationMinutes > 0;
  let startTime = startProvided ? cleanTimeText(args.startTime) : shiftWindow.start;
  let endTime = endProvided ? cleanTimeText(args.endTime) : shiftWindow.end;
  let durationMinutes = hasDuration ? Number(args.durationMinutes) : deriveDowntimeWaDurationMinutes(startTime, endTime);

  if (condition === 'lancar') {
    startTime = shiftWindow.start;
    endTime = shiftWindow.start;
    durationMinutes = 0;
  } else if (hasDuration) {
    if (!startProvided && !endProvided) {
      startTime = shiftWindow.start;
      endTime = addDowntimeWaMinutes(startTime, durationMinutes);
    } else if (startProvided && !endProvided) {
      endTime = addDowntimeWaMinutes(startTime, durationMinutes);
    } else if (!startProvided && endProvided) {
      startTime = addDowntimeWaMinutes(endTime, -durationMinutes);
    }
  } else {
    if (!startProvided && !endProvided) {
      startTime = shiftWindow.start;
      endTime = shiftWindow.end;
      durationMinutes = deriveDowntimeWaDurationMinutes(startTime, endTime);
    } else if (startProvided && !endProvided) {
      endTime = shiftWindow.end;
      durationMinutes = deriveDowntimeWaDurationMinutes(startTime, endTime);
    } else if (!startProvided && endProvided) {
      startTime = shiftWindow.start;
      durationMinutes = deriveDowntimeWaDurationMinutes(startTime, endTime);
    }
  }

  return { startTime, endTime, durationMinutes, condition };
}
