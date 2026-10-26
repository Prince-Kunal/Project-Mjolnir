import { describe, expect, it } from 'vitest';
import {
  COLOR_KEYS,
  type ColorRule,
  colorForPoints,
  defaultColorRules,
  normalizePrimaries,
  pointsForColor,
  setPrimary,
  setRulePoints,
} from './colorRules.ts';

function rules(map: Partial<Record<string, 0 | 1 | 2 | 3>>, primaries: string[] = []): ColorRule[] {
  return COLOR_KEYS.map((colorKey) => ({
    colorKey,
    points: map[colorKey] ?? 0,
    primaryForPoints: primaries.includes(colorKey),
  }));
}

describe('defaultColorRules (3.2: until onboarding maps colours)', () => {
  it('has one rule per Google colour plus calendar default', () => {
    expect(defaultColorRules().map((r) => r.colorKey)).toEqual([
      'default',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
    ]);
  });

  it('gives calendar default 1 point and every other colour 0', () => {
    const r = defaultColorRules();
    expect(pointsForColor(r, undefined)).toBe(1);
    for (const key of COLOR_KEYS.filter((k) => k !== 'default')) {
      expect(pointsForColor(r, key)).toBe(0);
    }
  });

  it('marks calendar default primary for 1 point', () => {
    expect(colorForPoints(defaultColorRules(), 1)).toBe('default');
  });
});

describe('pointsForColor', () => {
  const r = rules({ default: 1, '11': 3, '5': 2 });

  it('reads the colour id of an event', () => {
    expect(pointsForColor(r, '11')).toBe(3);
    expect(pointsForColor(r, '5')).toBe(2);
    expect(pointsForColor(r, '7')).toBe(0);
  });

  it('treats a missing colorId as calendar default', () => {
    expect(pointsForColor(r, null)).toBe(1);
    expect(pointsForColor(r, undefined)).toBe(1);
  });

  it('treats an unknown colour id as 0 points (not a task)', () => {
    expect(pointsForColor(r, '42')).toBe(0);
  });
});

describe('colorForPoints (3.2: colour the app writes for chosen points)', () => {
  it('uses the colour marked primary when several map to one value', () => {
    expect(colorForPoints(rules({ '2': 3, '11': 3 }, ['11']), 3)).toBe('11');
  });

  it('falls back to the first mapped colour when none is primary', () => {
    expect(colorForPoints(rules({ '4': 2, '9': 2 }), 2)).toBe('4');
  });

  it('ignores a stale primary flag on a colour mapped to another value', () => {
    expect(colorForPoints(rules({ '4': 1, '9': 2 }, ['4']), 2)).toBe('9');
  });

  it('returns null when no colour maps to the value', () => {
    expect(colorForPoints(rules({ default: 1 }), 3)).toBeNull();
  });
});

describe('normalizePrimaries', () => {
  it('gives each used points value exactly one primary', () => {
    const out = normalizePrimaries(rules({ default: 1, '2': 3, '11': 3, '5': 2 }));
    for (const p of [1, 2, 3] as const) {
      expect(out.filter((r) => r.points === p && r.primaryForPoints)).toHaveLength(1);
    }
  });

  it('keeps an existing valid primary', () => {
    const out = normalizePrimaries(rules({ '2': 3, '11': 3 }, ['11']));
    expect(out.find((r) => r.points === 3 && r.primaryForPoints)?.colorKey).toBe('11');
  });

  it('keeps only the first of two primaries for one value', () => {
    const out = normalizePrimaries(rules({ '2': 3, '11': 3 }, ['2', '11']));
    expect(out.filter((r) => r.points === 3 && r.primaryForPoints).map((r) => r.colorKey)).toEqual([
      '2',
    ]);
  });

  it('marks one 0-point colour primary for schedule-only events, Graphite by default', () => {
    const out = normalizePrimaries(rules({ default: 1 }));
    expect(out.filter((r) => r.points === 0 && r.primaryForPoints).map((r) => r.colorKey)).toEqual([
      '8',
    ]);
    expect(colorForPoints(normalizePrimaries(rules({}, ['3'])), 0)).toBe('3');
  });

  it('never writes a schedule-only event in the calendar default colour', () => {
    const only = COLOR_KEYS.map((colorKey) => ({
      colorKey,
      points: (colorKey === 'default' ? 0 : 1) as 0 | 1,
      primaryForPoints: false,
    }));
    expect(colorForPoints(only, 0)).toBeNull();
  });
});

describe('setRulePoints and setPrimary', () => {
  it('moves a primary colour to a new value and promotes another for the old value', () => {
    const start = rules({ '2': 3, '11': 3 }, ['11']);
    const out = setRulePoints(start, '11', 1);
    expect(colorForPoints(out, 3)).toBe('2');
    expect(colorForPoints(out, 1)).toBe('11');
  });

  it('marks one colour primary and clears others with the same value', () => {
    const out = setPrimary(rules({ '2': 3, '11': 3 }, ['2']), '11');
    expect(colorForPoints(out, 3)).toBe('11');
    expect(out.filter((r) => r.primaryForPoints)).toHaveLength(1);
  });

  it('lets a 0-point colour be the schedule-only colour, but not the calendar default', () => {
    const start = rules({ '2': 1 }, ['2']);
    expect(colorForPoints(setPrimary(start, '4'), 0)).toBe('4');
    expect(setPrimary(start, 'default')).toEqual(start);
  });

  it('does not mutate its input', () => {
    const start = rules({ '2': 3 }, ['2']);
    const copy = JSON.parse(JSON.stringify(start)) as ColorRule[];
    setRulePoints(start, '2', 1);
    setPrimary(start, '2');
    expect(start).toEqual(copy);
  });
});
