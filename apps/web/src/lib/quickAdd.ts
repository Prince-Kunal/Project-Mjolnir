// Quick add (section 5): one line such as `PR review tomorrow 6pm 2h #lfx !2` becomes a calendar
// event (when it has a time) or a manual task (a date, or nothing: today).
import { logicalDate, parseTitle, wallClock, zonedInstant } from '@mjolnir/domain';
import * as chrono from 'chrono-node';

export interface QuickAddResult {
  kind: 'event' | 'task';
  /** Display title: tags, points, time and duration removed. */
  title: string;
  /** Title as written to Google: the display title with its #tags. */
  rawTitle: string;
  tags: string[];
  /** 0 is a schedule-only event (`!0`): on the calendar, never a task. */
  points: 0 | 1 | 2 | 3;
  /** Whether the text set the points (`!2`) or the day/time, rather than the defaults. */
  hasPoints: boolean;
  hasDate: boolean;
  /** Logical date: of the event's start, or the task's day. */
  date: string;
  start: string | null;
  end: string | null;
  minutes: number | null;
}

export interface QuickAddContext {
  now: Date;
  timeZone: string;
  boundaryHour: number;
  defaultMinutes?: number;
}

const POINTS = /(^|\s)!([0-3])(?=\s|$)/;
const HOURS =
  /(^|\s)(?:for\s+)?(\d+(?:\.\d+)?)\s*(?:h|hrs?|hours?)(?:\s*(\d+)\s*(?:m|mins?|minutes?))?(?=\s|$)/i;
const MINUTES = /(^|\s)(?:for\s+)?(\d+)\s*(?:m|mins?|minutes?)(?=\s|$)/i;

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function takeDuration(text: string): { text: string; minutes: number | null } {
  const h = HOURS.exec(text);
  if (h) {
    const minutes = Math.round(Number(h[2]) * 60 + Number(h[3] ?? 0));
    return { text: text.replace(h[0], h[1]!), minutes };
  }
  const m = MINUTES.exec(text);
  if (m) return { text: text.replace(m[0], m[1]!), minutes: Number(m[2]) };
  return { text, minutes: null };
}

export function parseQuickAdd(input: string, ctx: QuickAddContext): QuickAddResult {
  let text = input.trim();
  let points: 0 | 1 | 2 | 3 = 1;
  const p = POINTS.exec(text);
  if (p) {
    points = Number(p[2]) as 0 | 1 | 2 | 3;
    text = text.replace(p[0], p[1]!);
  }
  const duration = takeDuration(text);
  text = duration.text;

  // chrono reads dates in the machine's timezone; give it the user's wall clock as that local
  // time, then turn its answer back into an instant in the user's timezone.
  const w = wallClock(ctx.now, ctx.timeZone);
  const ref = new Date(w.year, w.month - 1, w.day, w.hour, w.minute);
  const found = chrono.parse(text, ref, { forwardDate: true })[0];

  let start: string | null = null;
  let end: string | null = null;
  let minutes = duration.minutes;
  let day: string | null = null;

  if (found) {
    const s = found.start;
    day = isoDate(s.get('year')!, s.get('month')!, s.get('day')!);
    if (s.isCertain('hour')) {
      const startAt = zonedInstant(day, s.get('hour')!, s.get('minute') ?? 0, ctx.timeZone);
      let endAt: Date;
      const e = found.end;
      if (e && e.isCertain('hour')) {
        const endDay = isoDate(e.get('year')!, e.get('month')!, e.get('day')!);
        endAt = zonedInstant(endDay, e.get('hour')!, e.get('minute') ?? 0, ctx.timeZone);
        if (endAt <= startAt) endAt = new Date(endAt.getTime() + 86_400_000);
        minutes = Math.round((endAt.getTime() - startAt.getTime()) / 60_000);
      } else {
        minutes = minutes ?? ctx.defaultMinutes ?? 60;
        endAt = new Date(startAt.getTime() + minutes * 60_000);
      }
      start = startAt.toISOString();
      end = endAt.toISOString();
    }
    text = text.slice(0, found.index) + text.slice(found.index + found.text.length);
  }

  const cleaned = text
    .replace(/\s+(at|on|from)\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const { title, tags } = parseTitle(cleaned);
  const rawTitle = [title, ...tags.map((t) => `#${t}`)].join(' ').trim();
  const today = logicalDate(ctx.now, ctx.timeZone, ctx.boundaryHour);

  if (start) {
    return {
      kind: 'event',
      title,
      rawTitle,
      tags,
      points,
      hasPoints: p !== null,
      hasDate: true,
      date: logicalDate(start, ctx.timeZone, ctx.boundaryHour),
      start,
      end,
      minutes,
    };
  }
  return {
    kind: 'task',
    title,
    rawTitle,
    tags,
    points,
    hasPoints: p !== null,
    hasDate: day !== null,
    date: day ?? today,
    start: null,
    end: null,
    minutes,
  };
}
