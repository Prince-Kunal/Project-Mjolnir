// Section 3.7: streaks with one automatic rest pass per week. The same walk runs in SQL
// (private.recompute_streak), checked against the shared cases in streaks.cases.json.
import { addDays, weekdayOf } from './dayBoundary.ts';
import { countsForStreak } from './scoring.ts';
import type { LogicalDate } from './types.ts';

/** First day of the week containing `date`. `weekStart` is an ISO weekday (Monday = 1). */
export function weekKey(date: LogicalDate, weekStart = 1): LogicalDate {
  return addDays(date, -((weekdayOf(date) - weekStart + 7) % 7));
}

export interface FinalizedDay {
  date: LogicalDate;
  /** Success rate; a day with nothing planned is 0. */
  rate: number;
}

export interface WalkedDay extends FinalizedDay {
  counts: boolean;
  restPassUsed: boolean;
  streakAfter: number;
}

/** State before the first day walked, when recomputing from a changed day. */
export interface StreakSeed {
  streak: number;
  best: number;
  /** Weeks (by weekKey) whose pass was already used before the first day walked. */
  passUsedWeeks: LogicalDate[];
}

export interface StreakResult {
  days: WalkedDay[];
  current: number;
  best: number;
}

/**
 * Walks finalized days in date order. A day at 50% or more adds 1. The first day under 50% in a
 * week uses the rest pass and changes nothing; a second one resets the streak to 0.
 */
export function walkStreak(
  days: readonly FinalizedDay[],
  opts: { weekStart?: number; seed?: StreakSeed } = {},
): StreakResult {
  let streak = opts.seed?.streak ?? 0;
  let best = opts.seed?.best ?? 0;
  const passUsed = new Set(opts.seed?.passUsedWeeks ?? []);
  const walked: WalkedDay[] = [];

  for (const d of days) {
    const week = weekKey(d.date, opts.weekStart ?? 1);
    const counts = countsForStreak(d.rate);
    let restPassUsed = false;
    if (counts) {
      streak += 1;
    } else if (!passUsed.has(week)) {
      passUsed.add(week);
      restPassUsed = true;
    } else {
      streak = 0;
    }
    best = Math.max(best, streak);
    walked.push({ ...d, counts, restPassUsed, streakAfter: streak });
  }
  return { days: walked, current: streak, best };
}

/** Shown on Today when a bad day would break the streak (3.7). Today is judged only at close. */
export function streakAtRisk(opts: { todayRate: number; passUsedThisWeek: boolean }): boolean {
  return !countsForStreak(opts.todayRate) && opts.passUsedThisWeek;
}
