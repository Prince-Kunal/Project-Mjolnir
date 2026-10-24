import { describe, expect, it } from 'vitest';
import type { Deadline } from '../../lib/deadlines.ts';
import { dueText, sessionWhen } from './format.ts';

const deadline = (days_left: number, status: Deadline['status'] = 'on_track') =>
  ({ due_date: '2026-10-30', status, stats: { days_left } }) as Deadline;

describe('dueText', () => {
  it('counts days left, today and overdue', () => {
    expect(dueText(deadline(6))).toMatch(/30.*6 days left$/);
    expect(dueText(deadline(1))).toMatch(/1 day left$/);
    expect(dueText(deadline(0))).toMatch(/^Due today/);
    expect(dueText(deadline(-3))).toMatch(/3 days overdue$/);
  });

  it('drops the countdown once done or dropped', () => {
    expect(dueText(deadline(-3, 'done'))).not.toMatch(/overdue|left/);
  });
});

describe('sessionWhen', () => {
  it('shows a time for blocks, the day for tasks, and Backlog for neither', () => {
    expect(
      sessionWhen({ start_at: '2026-10-25T04:30:00Z', logical_date: null }, 'Asia/Kolkata'),
    ).toMatch(/10:00$/);
    expect(sessionWhen({ start_at: null, logical_date: '2026-10-25' }, 'UTC')).toMatch(/25/);
    expect(sessionWhen({ start_at: null, logical_date: null }, 'UTC')).toBe('Backlog');
  });
});
