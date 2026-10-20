import { describe, expect, it } from 'vitest';
import cases from './scoring.cases.json' with { type: 'json' };
import { bandFor, countsForStreak, scoreDay } from './scoring.ts';
import type { ItemStatus } from './types.ts';

describe('bandFor (3.6, decision 10: inclusive edges)', () => {
  for (const c of cases.bands) {
    it(`${c.rate}% is ${c.band}`, () => expect(bandFor(c.rate)).toBe(c.band));
  }
});

describe('scoreDay (3.6)', () => {
  for (const c of cases.days) {
    it(c.name, () => {
      const items = c.items.map((i) => ({ points: i.points, status: i.status as ItemStatus }));
      expect(scoreDay(items)).toEqual({
        planned: c.planned,
        done: c.done,
        missed: c.missed,
        rate: c.rate,
        band: c.band,
      });
    });
  }
});

describe('countsForStreak (3.7)', () => {
  it('counts a day at exactly 50%', () => expect(countsForStreak(50)).toBe(true));
  it('does not count 49.9%', () => expect(countsForStreak(49.9)).toBe(false));
});
