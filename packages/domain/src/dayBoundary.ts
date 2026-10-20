// Section 3.3: the logical day. Built on Intl so it runs unchanged in browsers and Deno.
import type { LogicalDate } from './types.ts';

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function wallClock(instant: Date, timeZone: string): WallClock {
  const parts: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(instant)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour!,
    minute: parts.minute!,
  };
}

function toDate(instant: Date | string): Date {
  return instant instanceof Date ? instant : new Date(instant);
}

function isoDate(year: number, month: number, day: number): LogicalDate {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

function parseDate(date: LogicalDate): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y!, m!, d!];
}

export function addDays(date: LogicalDate, days: number): LogicalDate {
  const [y, m, d] = parseDate(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return isoDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** ISO weekday of a calendar date: Monday = 1 … Sunday = 7. */
export function weekdayOf(date: LogicalDate): number {
  const [y, m, d] = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
}

/**
 * The logical day an instant belongs to: its local date in `timeZone`, minus one day when the
 * local time is before `boundaryHour`. With a 04:00 boundary, 01:30 counts for the previous day.
 */
export function logicalDate(
  instant: Date | string,
  timeZone: string,
  boundaryHour: number,
): LogicalDate {
  const w = wallClock(toDate(instant), timeZone);
  const date = isoDate(w.year, w.month, w.day);
  return w.hour < boundaryHour ? addDays(date, -1) : date;
}

/** The instant a logical day begins: `boundaryHour`:00 local time on that date. */
export function dayStart(date: LogicalDate, timeZone: string, boundaryHour: number): Date {
  const [y, m, d] = parseDate(date);
  const target = Date.UTC(y, m - 1, d, boundaryHour);
  const offsetAt = (t: number) => {
    const w = wallClock(new Date(t), timeZone);
    return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) - t;
  };
  const matches = (t: number) => {
    const w = wallClock(new Date(t), timeZone);
    return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) === target;
  };
  // Two candidates cover both offsets around a DST change.
  const first = target - offsetAt(target);
  const second = target - offsetAt(first);
  const exact = [first, second].filter(matches);
  // Repeated hour: the earlier instant. Skipped hour: the first instant after the gap.
  return new Date(exact.length ? Math.min(...exact) : Math.max(first, second));
}
