// Free-slot suggestions when rescheduling a missed task (section 5, added feature).
import { wallClock } from './dayBoundary.ts';

export interface Interval {
  start: string;
  end: string;
}

export interface FreeSlotOptions {
  /** Blocks already taken, as ISO instants. Order does not matter. */
  busy: readonly Interval[];
  minutes: number;
  from: Date;
  timeZone: string;
  /** Local hours a suggestion may use: [start, end). 24 means midnight. */
  windowStartHour: number;
  windowEndHour: number;
  /** Suggestions start on this local grid, in minutes. */
  stepMinutes: number;
  limit: number;
  horizonDays?: number;
}

const MINUTE = 60_000;

function minuteOfDay(t: number, timeZone: string): number {
  const w = wallClock(new Date(t), timeZone);
  return w.hour * 60 + w.minute;
}

function ceilToStep(t: number, timeZone: string, step: number): number {
  const exact = t % MINUTE === 0;
  const base = exact ? t : t - (t % MINUTE) + MINUTE;
  const rem = minuteOfDay(base, timeZone) % step;
  return rem === 0 ? base : base + (step - rem) * MINUTE;
}

/** The next non-overlapping free slots that fit `minutes`, inside the daily window. */
export function freeSlots(o: FreeSlotOptions): Interval[] {
  const busy = o.busy
    .map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }))
    .sort((a, b) => a.start - b.start);
  const length = o.minutes * MINUTE;
  const windowStart = o.windowStartHour * 60;
  const windowEnd = o.windowEndHour * 60;
  const stopAt = o.from.getTime() + (o.horizonDays ?? 14) * 24 * 60 * MINUTE;
  const slots: Interval[] = [];

  let t = ceilToStep(o.from.getTime(), o.timeZone, o.stepMinutes);
  while (slots.length < o.limit && t < stopAt) {
    const m = minuteOfDay(t, o.timeZone);
    if (m < windowStart) {
      t += (windowStart - m) * MINUTE;
      continue;
    }
    if (m + o.minutes > windowEnd) {
      t += (24 * 60 - m + windowStart) * MINUTE;
      continue;
    }
    const end = t + length;
    const clash = busy.find((b) => b.start < end && b.end > t);
    if (clash) {
      t = ceilToStep(clash.end, o.timeZone, o.stepMinutes);
      continue;
    }
    slots.push({ start: new Date(t).toISOString(), end: new Date(end).toISOString() });
    t = ceilToStep(end, o.timeZone, o.stepMinutes);
  }
  return slots;
}
