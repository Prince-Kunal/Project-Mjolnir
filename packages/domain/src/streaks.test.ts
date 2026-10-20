import { describe, expect, it } from 'vitest';
import cases from './streaks.cases.json' with { type: 'json' };
import { streakAtRisk, walkStreak, weekKey } from './streaks.ts';

describe('weekKey', () => {
  it('is the Monday of the week by default', () => {
    expect(weekKey('2026-10-05')).toBe('2026-10-05'); // Monday
    expect(weekKey('2026-10-11')).toBe('2026-10-05'); // Sunday
    expect(weekKey('2026-10-12')).toBe('2026-10-12');
  });

  it('follows the week-start setting', () => {
    expect(weekKey('2026-10-11', 7)).toBe('2026-10-11'); // Sunday starts the week
    expect(weekKey('2026-10-10', 7)).toBe('2026-10-04');
  });
});

describe('walkStreak (3.7)', () => {
  for (const c of cases.cases) {
    it(c.name, () => {
      const result = walkStreak(
        c.days.map(([date, rate]) => ({ date: date as string, rate: rate as number })),
        { weekStart: c.weekStart ?? 1 },
      );
      expect(result.days.map((d) => d.streakAfter)).toEqual(c.streak);
      expect(result.days.map((d) => d.restPassUsed)).toEqual(c.pass);
      expect(result.current).toBe(c.current);
      expect(result.best).toBe(c.best);
    });
  }

  it('continues from a seed, as when recomputing from a changed day', () => {
    // The late mark-done case, recomputed from 2026-10-07 with the state after the 6th.
    const tail = walkStreak(
      [
        { date: '2026-10-07', rate: 30 },
        { date: '2026-10-08', rate: 90 },
      ],
      { weekStart: 1, seed: { streak: 2, best: 2, passUsedWeeks: [] } },
    );
    expect(tail.days.map((d) => d.streakAfter)).toEqual([2, 3]);
    expect(tail.best).toBe(3);
  });

  it('a seed whose week already used the pass resets on the next bad day', () => {
    const tail = walkStreak([{ date: '2026-10-08', rate: 10 }], {
      weekStart: 1,
      seed: { streak: 4, best: 6, passUsedWeeks: ['2026-10-05'] },
    });
    expect(tail.days[0]!.streakAfter).toBe(0);
    expect(tail.best).toBe(6);
  });
});

describe('streakAtRisk (3.7)', () => {
  it('is at risk when today is under 50% and this week’s pass is used', () => {
    expect(streakAtRisk({ todayRate: 40, passUsedThisWeek: true })).toBe(true);
    expect(streakAtRisk({ todayRate: 40, passUsedThisWeek: false })).toBe(false);
    expect(streakAtRisk({ todayRate: 50, passUsedThisWeek: true })).toBe(false);
  });
});
