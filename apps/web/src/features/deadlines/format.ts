import type { DeadlineStatus } from '@mjolnir/domain';
import type { Deadline, DeadlineWarning } from '../../lib/deadlines.ts';
import { formatDayMonth, formatShortDay, formatTime, formatWeekday } from '../../lib/format.ts';

// Section 11: On track green, Needs attention amber, Urgent red, like the owner's Notion dots.
export const STATUS: Record<DeadlineStatus, { label: string; color: string }> = {
  on_track: { label: 'On track', color: 'var(--color-band-excellent)' },
  needs_attention: { label: 'Needs attention', color: 'var(--color-band-fair)' },
  urgent: { label: 'Urgent', color: 'var(--color-band-not-good)' },
  done: { label: 'Done', color: 'var(--color-accent)' },
  dropped: { label: 'Dropped', color: 'var(--color-muted)' },
};

export const WARNING_LABEL: Record<DeadlineWarning, string> = {
  overdue: 'Overdue',
  no_sessions: 'No sessions scheduled',
  needs_more_sessions: 'Needs more sessions',
};

/** "Fri 30 Oct · 6 days left", or "3 days overdue". */
export function dueText(d: Deadline): string {
  const date = `${formatWeekday(d.due_date)} ${formatDayMonth(d.due_date)}`;
  if (d.status === 'done' || d.status === 'dropped') return `Due ${date}`;
  const n = d.stats.days_left;
  const plural = (k: number) => `${k} day${k === 1 ? '' : 's'}`;
  if (n > 0) return `Due ${date} · ${plural(n)} left`;
  if (n === 0) return `Due today, ${date}`;
  return `Due ${date} · ${plural(-n)} overdue`;
}

/** "Sun 25 Oct, 10:00" for a session; a task with no time shows its day. */
export function sessionWhen(
  s: { start_at: string | null; logical_date: string | null },
  timeZone: string,
): string {
  if (s.start_at)
    return `${formatShortDay(s.start_at, timeZone)}, ${formatTime(s.start_at, timeZone)}`;
  if (s.logical_date) return `${formatWeekday(s.logical_date)} ${formatDayMonth(s.logical_date)}`;
  return 'Backlog';
}
