import { describe, expect, it } from 'vitest';
import { freeSlots } from './freeSlots.ts';

const IN = 'Asia/Kolkata';
const at = (local: string) => new Date(`${local}+05:30`);
const iso = (d: Date) => d.toISOString();
const ist = (local: string) => iso(at(local));

const base = {
  timeZone: IN,
  windowStartHour: 7,
  windowEndHour: 24,
  stepMinutes: 30,
};

describe('freeSlots', () => {
  it('starts at the next half hour from now', () => {
    const slots = freeSlots({
      ...base,
      busy: [],
      minutes: 60,
      from: at('2026-10-21T09:10:00'),
      limit: 2,
    });
    expect(slots.map((s) => s.start)).toEqual([
      ist('2026-10-21T09:30:00'),
      ist('2026-10-21T10:30:00'),
    ]);
  });

  it('skips busy blocks and does not overlap its own suggestions', () => {
    const slots = freeSlots({
      ...base,
      busy: [{ start: ist('2026-10-21T10:00:00'), end: ist('2026-10-21T12:00:00') }],
      minutes: 90,
      from: at('2026-10-21T09:00:00'),
      limit: 3,
    });
    expect(slots.map((s) => [s.start, s.end])).toEqual([
      [ist('2026-10-21T12:00:00'), ist('2026-10-21T13:30:00')],
      [ist('2026-10-21T13:30:00'), ist('2026-10-21T15:00:00')],
      [ist('2026-10-21T15:00:00'), ist('2026-10-21T16:30:00')],
    ]);
  });

  it('keeps inside the daily window and rolls to the next morning', () => {
    const slots = freeSlots({
      ...base,
      busy: [],
      minutes: 120,
      from: at('2026-10-21T22:45:00'),
      limit: 1,
    });
    expect(slots[0]!.start).toBe(ist('2026-10-22T07:00:00'));
  });

  it('allows a slot that ends exactly at midnight', () => {
    const slots = freeSlots({
      ...base,
      busy: [],
      minutes: 60,
      from: at('2026-10-21T23:00:00'),
      limit: 1,
    });
    expect(slots[0]).toEqual({
      start: ist('2026-10-21T23:00:00'),
      end: ist('2026-10-22T00:00:00'),
    });
  });

  it('treats touching blocks as free and overlapping ones as busy', () => {
    const busy = [
      { start: ist('2026-10-21T09:00:00'), end: ist('2026-10-21T10:00:00') },
      { start: ist('2026-10-21T11:00:00'), end: ist('2026-10-21T11:30:00') },
    ];
    const slots = freeSlots({
      ...base,
      busy,
      minutes: 60,
      from: at('2026-10-21T09:00:00'),
      limit: 1,
    });
    expect(slots[0]!.start).toBe(ist('2026-10-21T10:00:00'));
    const longer = freeSlots({
      ...base,
      busy,
      minutes: 90,
      from: at('2026-10-21T09:00:00'),
      limit: 1,
    });
    expect(longer[0]!.start).toBe(ist('2026-10-21T11:30:00'));
  });

  it('gives up after the search horizon', () => {
    const allDay = [{ start: ist('2026-10-21T00:00:00'), end: ist('2026-11-30T00:00:00') }];
    expect(
      freeSlots({ ...base, busy: allDay, minutes: 30, from: at('2026-10-21T09:00:00'), limit: 3 }),
    ).toEqual([]);
  });
});
