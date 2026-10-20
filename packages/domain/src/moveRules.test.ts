import { describe, expect, it } from 'vitest';
import { classifyMove, type MovableItem } from './moveRules.ts';

const IN = 'Asia/Kolkata';
const B = 4;

// A pending 2-hour block at 18:00 on Tue 20 Oct 2026, Indian time.
const item: MovableItem = {
  status: 'pending',
  startAt: '2026-10-20T18:00:00+05:30',
  logicalDate: '2026-10-20',
};

const BEFORE_START = '2026-10-20T10:00:00+05:30';
const AFTER_START = '2026-10-20T19:00:00+05:30';

describe('classifyMove (3.4)', () => {
  it('M1: a move within the same logical day is a same-day move', () => {
    expect(classifyMove(item, '2026-10-20T21:00:00+05:30', AFTER_START, IN, B)).toBe('same_day');
  });

  it('M1: a move past midnight but before the boundary stays on the same day', () => {
    expect(classifyMove(item, '2026-10-21T01:00:00+05:30', AFTER_START, IN, B)).toBe('same_day');
  });

  it('M2: moving to another day before the original start is a plain move', () => {
    expect(classifyMove(item, '2026-10-21T18:00:00+05:30', BEFORE_START, IN, B)).toBe('plain_move');
  });

  it('M2: moving to an earlier day before the start is also a plain move', () => {
    expect(
      classifyMove(item, '2026-10-19T18:00:00+05:30', '2026-10-19T09:00:00+05:30', IN, B),
    ).toBe('plain_move');
  });

  it('M3: moving an unfinished task to another day after its start records a miss', () => {
    expect(classifyMove(item, '2026-10-21T18:00:00+05:30', AFTER_START, IN, B)).toBe(
      'miss_and_recreate',
    );
  });

  it('M3: the original start time itself counts as after the start', () => {
    expect(classifyMove(item, '2026-10-21T18:00:00+05:30', item.startAt, IN, B)).toBe(
      'miss_and_recreate',
    );
  });

  it('M4: a done item that is not finalized moves and stays done', () => {
    expect(
      classifyMove({ ...item, status: 'done' }, '2026-10-21T18:00:00+05:30', AFTER_START, IN, B),
    ).toBe('plain_move');
  });

  it('a 0-point (ignored) item never records a miss', () => {
    expect(
      classifyMove({ ...item, status: 'ignored' }, '2026-10-21T18:00:00+05:30', AFTER_START, IN, B),
    ).toBe('plain_move');
  });

  it('Tasks mode: a due-date change uses the start of the logical day as the start time', () => {
    const task: MovableItem = {
      status: 'pending',
      startAt: '2026-10-20T04:00:00+05:30', // dayStart of the 20th
      logicalDate: '2026-10-20',
    };
    const tomorrowStart = '2026-10-21T04:00:00+05:30';
    expect(classifyMove(task, tomorrowStart, '2026-10-20T03:00:00+05:30', IN, B)).toBe(
      'plain_move',
    );
    expect(classifyMove(task, tomorrowStart, '2026-10-20T09:00:00+05:30', IN, B)).toBe(
      'miss_and_recreate',
    );
  });
});
