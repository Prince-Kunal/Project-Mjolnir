import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from './quickAdd.ts';

// Saturday 24 Oct 2026, 10:00 in India. Results must not depend on the machine's timezone.
const ctx = {
  now: new Date('2026-10-24T10:00:00+05:30'),
  timeZone: 'Asia/Kolkata',
  boundaryHour: 4,
};
const ist = (local: string) => new Date(`${local}+05:30`).toISOString();

describe('parseQuickAdd (section 5: quick add)', () => {
  it('reads the plan example: day, time, duration, tag and points', () => {
    expect(parseQuickAdd('PR review tomorrow 6pm 2h #lfx !2', ctx)).toEqual({
      kind: 'event',
      title: 'PR review',
      rawTitle: 'PR review #lfx',
      tags: ['lfx'],
      points: 2,
      hasPoints: true,
      hasDate: true,
      date: '2026-10-25',
      start: ist('2026-10-25T18:00:00'),
      end: ist('2026-10-25T20:00:00'),
      minutes: 120,
    });
  });

  it('makes a one-hour event when no duration is given', () => {
    const r = parseQuickAdd('Gym today 7pm', ctx);
    expect([r.kind, r.start, r.end, r.points]).toEqual([
      'event',
      ist('2026-10-24T19:00:00'),
      ist('2026-10-24T20:00:00'),
      1,
    ]);
  });

  it('reads minutes and combined durations', () => {
    expect(parseQuickAdd('Read 45m at 9pm', ctx).end).toBe(ist('2026-10-24T21:45:00'));
    expect(parseQuickAdd('Deep work 1h30m at 9am monday', ctx)).toMatchObject({
      title: 'Deep work',
      start: ist('2026-10-26T09:00:00'),
      end: ist('2026-10-26T10:30:00'),
      minutes: 90,
    });
  });

  it('uses an explicit end time', () => {
    const r = parseQuickAdd('Standup today 10:30-11:15', ctx);
    expect([r.start, r.end, r.minutes]).toEqual([
      ist('2026-10-24T10:30:00'),
      ist('2026-10-24T11:15:00'),
      45,
    ]);
  });

  it('a late-night block belongs to the logical day it was planned in', () => {
    const r = parseQuickAdd('Open source tomorrow 1am', ctx);
    expect([r.start, r.date]).toEqual([ist('2026-10-25T01:00:00'), '2026-10-24']);
  });

  it('a date without a time makes a task for that day', () => {
    expect(parseQuickAdd('Pay rent friday !3', ctx)).toMatchObject({
      kind: 'task',
      title: 'Pay rent',
      points: 3,
      date: '2026-10-30',
      start: null,
    });
  });

  it('plain text makes a 1-point task for today', () => {
    expect(parseQuickAdd('Call bank', ctx)).toMatchObject({
      kind: 'task',
      title: 'Call bank',
      points: 1,
      date: '2026-10-24',
    });
  });

  it('keeps a task estimate from a duration', () => {
    expect(parseQuickAdd('Write report 2h', ctx)).toMatchObject({
      kind: 'task',
      title: 'Write report',
      minutes: 120,
    });
  });

  it('ignores ! values outside 1 to 3 and keeps them in the title', () => {
    expect(parseQuickAdd('Ship it !5', ctx)).toMatchObject({ title: 'Ship it !5', points: 1 });
  });

  it('returns an empty title for empty input', () => {
    expect(parseQuickAdd('   ', ctx)).toMatchObject({ kind: 'task', title: '' });
  });

  it('says when neither a day nor points were given', () => {
    expect(parseQuickAdd('Call bank', ctx)).toMatchObject({ hasPoints: false, hasDate: false });
    expect(parseQuickAdd('Call bank friday !2', ctx)).toMatchObject({
      hasPoints: true,
      hasDate: true,
    });
  });
});
