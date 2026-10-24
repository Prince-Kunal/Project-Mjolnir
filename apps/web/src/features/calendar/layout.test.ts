import { describe, expect, it } from 'vitest';
import { layoutDay, monthGrid, snapMinutes, weekDays } from './layout.ts';

const IN = 'Asia/Kolkata';
const ev = (id: string, start: string, end: string) => ({
  id,
  start_at: new Date(`${start}+05:30`).toISOString(),
  end_at: new Date(`${end}+05:30`).toISOString(),
});

describe('layoutDay', () => {
  it('places a block by local minutes from midnight', () => {
    const [s] = layoutDay(
      [ev('a', '2026-10-24T09:30:00', '2026-10-24T11:00:00')],
      '2026-10-24',
      IN,
    );
    expect(s).toMatchObject({
      top: 570,
      height: 90,
      lane: 0,
      lanes: 1,
      startsBefore: false,
      endsAfter: false,
    });
  });

  it('splits a block that crosses midnight across both days', () => {
    const block = ev('a', '2026-10-24T23:30:00', '2026-10-25T00:30:00');
    expect(layoutDay([block], '2026-10-24', IN)[0]).toMatchObject({
      top: 1410,
      height: 30,
      endsAfter: true,
    });
    expect(layoutDay([block], '2026-10-25', IN)[0]).toMatchObject({
      top: 0,
      height: 30,
      startsBefore: true,
    });
  });

  it('leaves out blocks on other days', () => {
    expect(
      layoutDay([ev('a', '2026-10-23T09:00:00', '2026-10-23T10:00:00')], '2026-10-24', IN),
    ).toEqual([]);
  });

  it('puts overlapping blocks side by side and others full width', () => {
    const segs = layoutDay(
      [
        ev('a', '2026-10-24T09:00:00', '2026-10-24T11:00:00'),
        ev('b', '2026-10-24T10:00:00', '2026-10-24T12:00:00'),
        ev('c', '2026-10-24T11:00:00', '2026-10-24T11:30:00'),
        ev('d', '2026-10-24T14:00:00', '2026-10-24T15:00:00'),
      ],
      '2026-10-24',
      IN,
    );
    const by = Object.fromEntries(segs.map((s) => [s.item.id, [s.lane, s.lanes]]));
    expect(by).toEqual({ a: [0, 2], b: [1, 2], c: [0, 2], d: [0, 1] });
  });

  it('gives very short blocks a readable minimum height', () => {
    expect(
      layoutDay([ev('a', '2026-10-24T09:00:00', '2026-10-24T09:05:00')], '2026-10-24', IN)[0]!
        .height,
    ).toBe(15);
  });
});

describe('grids', () => {
  it('snaps minutes to a quarter hour', () => {
    expect([snapMinutes(0), snapMinutes(7), snapMinutes(8), snapMinutes(1439)]).toEqual([
      0, 0, 15, 1440,
    ]);
  });

  it('lists the 7 days of the week containing a date, from the week start', () => {
    expect(weekDays('2026-10-24', 1)).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
    expect(weekDays('2026-10-24', 7)[0]).toBe('2026-10-18');
  });

  it('gives a month 6 full weeks starting on the week start', () => {
    const grid = monthGrid('2026-10-24', 1);
    expect(grid).toHaveLength(42);
    expect([grid[0], grid[3], grid[41]]).toEqual(['2026-09-28', '2026-10-01', '2026-11-08']);
  });
});
