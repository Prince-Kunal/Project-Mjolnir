// Section 3.6: daily score and bands. The same maths runs in SQL (supabase migrations), checked
// against the shared cases in scoring.cases.json.
import { STREAK_THRESHOLD } from './constants.ts';
import type { Band, ItemStatus } from './types.ts';

export interface ScoredItem {
  points: number;
  status: ItemStatus;
}

export interface DayScore {
  planned: number;
  done: number;
  missed: number;
  /** done ÷ planned × 100, one decimal; 0 when nothing is planned. */
  rate: number;
  band: Band;
}

const PLANNED: ReadonlySet<ItemStatus> = new Set(['pending', 'done', 'missed']);

/** Inclusive lower edges (decision 10): 85 Excellent, 75 Good, 50 Fair. */
export function bandFor(rate: number): Band {
  if (rate >= 85) return 'excellent';
  if (rate >= 75) return 'good';
  if (rate >= 50) return 'fair';
  return 'not_good';
}

export function countsForStreak(rate: number): boolean {
  return rate >= STREAK_THRESHOLD;
}

/** Rate to one decimal, rounding half up, computed in integers to avoid float drift. */
export function successRate(done: number, planned: number): number {
  return planned > 0 ? Math.round((done * 1000) / planned) / 10 : 0;
}

export function scoreDay(items: readonly ScoredItem[]): DayScore {
  let planned = 0;
  let done = 0;
  let missed = 0;
  for (const i of items) {
    if (!PLANNED.has(i.status)) continue;
    planned += i.points;
    if (i.status === 'done') done += i.points;
    if (i.status === 'missed') missed += i.points;
  }
  const rate = successRate(done, planned);
  return { planned, done, missed, rate, band: bandFor(rate) };
}
