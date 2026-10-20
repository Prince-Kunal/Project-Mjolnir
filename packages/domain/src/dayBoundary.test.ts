import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayStart,
  logicalDate,
  shiftLocalDays,
  weekdayOf,
  zonedInstant,
} from './dayBoundary.ts';

const NY = 'America/New_York';
const IN = 'Asia/Kolkata';

describe('logicalDate (3.3)', () => {
  it('puts 03:59 on the previous day and 04:00 on the same day with a 04:00 boundary', () => {
    expect(logicalDate('2026-10-20T03:59:00+05:30', IN, 4)).toBe('2026-10-19');
    expect(logicalDate('2026-10-20T04:00:00+05:30', IN, 4)).toBe('2026-10-20');
  });

  it('counts a 01:30 session for the evening it was planned in', () => {
    expect(logicalDate('2026-10-21T01:30:00+05:30', IN, 4)).toBe('2026-10-20');
  });

  it('uses the local date in the user timezone, not UTC', () => {
    // 20:00 UTC is 01:30 next day in India: still the 20th's logical day.
    expect(logicalDate('2026-10-20T20:00:00Z', IN, 4)).toBe('2026-10-20');
    // Same instant is 16:00 in New York.
    expect(logicalDate('2026-10-20T20:00:00Z', NY, 4)).toBe('2026-10-20');
  });

  it('treats a boundary of 0 as plain midnight', () => {
    expect(logicalDate('2026-10-20T00:00:00+05:30', IN, 0)).toBe('2026-10-20');
    expect(logicalDate('2026-10-19T23:59:00+05:30', IN, 0)).toBe('2026-10-19');
  });

  it('accepts Date objects', () => {
    expect(logicalDate(new Date('2026-10-20T04:00:00+05:30'), IN, 4)).toBe('2026-10-20');
  });

  describe('around New York clock changes', () => {
    // 2026-11-01: clocks fall back from 02:00 EDT to 01:00 EST.
    it('keeps both 01:30s of the repeated hour on the previous day', () => {
      expect(logicalDate('2026-11-01T01:30:00-04:00', NY, 4)).toBe('2026-10-31');
      expect(logicalDate('2026-11-01T01:30:00-05:00', NY, 4)).toBe('2026-10-31');
    });

    it('switches day at 04:00 EST on the fall-back day', () => {
      expect(logicalDate('2026-11-01T03:59:00-05:00', NY, 4)).toBe('2026-10-31');
      expect(logicalDate('2026-11-01T04:00:00-05:00', NY, 4)).toBe('2026-11-01');
    });

    // 2026-03-08: clocks spring forward from 02:00 EST to 03:00 EDT.
    it('switches day at 04:00 EDT on the spring-forward day', () => {
      expect(logicalDate('2026-03-08T03:30:00-04:00', NY, 4)).toBe('2026-03-07');
      expect(logicalDate('2026-03-08T04:00:00-04:00', NY, 4)).toBe('2026-03-08');
    });
  });
});

describe('dayStart', () => {
  it('is the boundary instant on that local date', () => {
    expect(dayStart('2026-10-20', IN, 4).toISOString()).toBe('2026-10-19T22:30:00.000Z');
  });

  it('follows the offset in force on that date', () => {
    expect(dayStart('2026-11-01', NY, 4).toISOString()).toBe('2026-11-01T09:00:00.000Z');
    expect(dayStart('2026-10-31', NY, 4).toISOString()).toBe('2026-10-31T08:00:00.000Z');
    expect(dayStart('2026-03-08', NY, 4).toISOString()).toBe('2026-03-08T08:00:00.000Z');
  });

  it('lands on a time that does not exist by moving past the gap', () => {
    // 02:00 on 2026-03-08 does not exist in New York; the day starts at 03:00 EDT.
    expect(dayStart('2026-03-08', NY, 2).toISOString()).toBe('2026-03-08T07:00:00.000Z');
  });

  it('round-trips with logicalDate', () => {
    for (const date of ['2026-03-07', '2026-03-08', '2026-03-09', '2026-10-31', '2026-11-01']) {
      expect(logicalDate(dayStart(date, NY, 4), NY, 4)).toBe(date);
      expect(logicalDate(new Date(dayStart(date, NY, 4).getTime() - 1), NY, 4)).toBe(
        addDays(date, -1),
      );
    }
  });
});

describe('addDays and weekdayOf', () => {
  it('crosses month and year ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('returns ISO weekdays, Monday = 1', () => {
    expect(weekdayOf('2026-10-19')).toBe(1);
    expect(weekdayOf('2026-10-25')).toBe(7);
  });
});

describe('zonedInstant and shiftLocalDays', () => {
  it('converts a local time to an instant', () => {
    expect(zonedInstant('2026-10-21', 18, 30, IN).toISOString()).toBe('2026-10-21T13:00:00.000Z');
  });

  it('keeps the wall-clock time across a DST change', () => {
    // 18:00 EDT on Sat 31 Oct, one day later is 18:00 EST on Sun 1 Nov.
    expect(shiftLocalDays('2026-10-31T22:00:00Z', 1, NY).toISOString()).toBe(
      '2026-11-01T23:00:00.000Z',
    );
  });

  it('moves a past-midnight block by calendar days', () => {
    // 01:30 on the 21st (logical day the 20th) moved one day is 01:30 on the 22nd.
    expect(shiftLocalDays('2026-10-21T01:30:00+05:30', 1, IN).toISOString()).toBe(
      '2026-10-21T20:00:00.000Z',
    );
  });
});
