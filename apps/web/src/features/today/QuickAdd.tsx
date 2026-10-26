import { useMemo, useState } from 'react';
import { TagInput } from '../../components/TagInput.tsx';
import { Notice } from '../../components/ui.tsx';
import { useCreateEvent, useCreateGoogleTask, useCreateTask } from '../../lib/day.ts';
import { formatDay, formatMinutes, formatShortDay, formatTime } from '../../lib/format.ts';
import { useHabits, useProfile } from '../../lib/queries.ts';
import { parseQuickAdd } from '../../lib/quickAdd.ts';
import { useToast } from '../../lib/toast.ts';
import { useEffects } from '../../lib/effects.ts';

interface Props {
  /** Day for a task when the text names none: the day being viewed. */
  defaultDate: string;
  autoFocus?: boolean;
  /** In a narrow dialog the input takes its own row, with points and Add below. */
  stacked?: boolean;
  /** Text to start from, such as a deadline's tag. */
  initialText?: string;
  onDone?(): void;
}

/**
 * Quick add (section 5): `PR review tomorrow 6pm 2h #lfx !2`. With a time it becomes a Google
 * Calendar event coloured for its points; otherwise a task for the named day. `!0` (Schedule)
 * makes a schedule-only event, and an event named like a habit schedules that habit.
 */
export function QuickAdd({
  defaultDate,
  autoFocus,
  stacked = false,
  initialText = '',
  onDone,
}: Props) {
  const { data: profile } = useProfile();
  const [text, setText] = useState(initialText);
  const [points, setPoints] = useState<0 | 1 | 2 | 3>(1);
  const { data: habits = [] } = useHabits();
  const createEvent = useCreateEvent();
  const createTask = useCreateTask();
  const createGoogleTask = useCreateGoogleTask();
  const toast = useToast((s) => s.show);
  const loki = useEffects((s) => s.loki);

  const parsed = useMemo(
    () =>
      profile && text.trim()
        ? parseQuickAdd(text, {
            now: new Date(),
            timeZone: profile.timezone,
            boundaryHour: profile.day_boundary_hour,
          })
        : null,
    [text, profile],
  );
  // An event named like a habit gives the habit a time (decision 17), at the habit's points.
  const habit =
    parsed?.kind === 'event'
      ? habits.find((h) => h.title.trim().toLowerCase() === parsed.title.trim().toLowerCase())
      : undefined;
  const effectivePoints = habit ? habit.points : parsed?.hasPoints ? parsed.points : points;
  const taskDate = parsed?.hasDate ? parsed.date : defaultDate;
  // Tasks mode (3.13): the day lives in Google Tasks, which keep a date but no time.
  const tasksMode = profile?.google_item_type === 'tasks';
  const pending = createEvent.isPending || createTask.isPending || createGoogleTask.isPending;
  // Schedule-only needs a time and a calendar: there is nothing to schedule on a task.
  const scheduleOnly = effectivePoints === 0;
  const blocked = scheduleOnly && (tasksMode || parsed?.kind !== 'event');
  const error = createEvent.error ?? createTask.error ?? createGoogleTask.error;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed?.title || !profile || blocked) return;
    const done = () => {
      setText('');
      onDone?.();
    };
    if (tasksMode) {
      createGoogleTask.mutate(
        { title: parsed.rawTitle, date: taskDate, points: effectivePoints as 1 | 2 | 3 },
        {
          onSuccess: () => {
            toast(`Added to Google Tasks: ${formatDay(taskDate)}`);
            done();
          },
        },
      );
    } else if (parsed.kind === 'event') {
      createEvent.mutate(
        { title: parsed.rawTitle, points: effectivePoints, start: parsed.start!, end: parsed.end! },
        {
          onSuccess: () => {
            toast(
              `Added to Google Calendar: ${formatShortDay(parsed.start!, profile.timezone)}, ${formatTime(parsed.start!, profile.timezone)}`,
            );
            done();
          },
        },
      );
    } else {
      createTask.mutate(
        {
          title: parsed.title,
          points: effectivePoints as 1 | 2 | 3,
          date: taskDate,
          tags: parsed.tags,
          plannedMinutes: parsed.minutes,
        },
        { onSuccess: done },
      );
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className={`flex flex-wrap items-start gap-2 ${stacked ? '' : 'sm:flex-nowrap'}`}>
        <TagInput
          value={text}
          onChange={(next) => {
            // Easter egg: name the trickster and he flies through, as he did at the forge.
            if (/\bloki\b/i.test(next) && !/\bloki\b/i.test(text)) loki();
            setText(next);
          }}
          chips={!scheduleOnly && (stacked || text.trim().length > 0)}
          boxClassName={`flex-1 basis-full ${stacked ? '' : 'sm:basis-auto'}`}
          autoFocus={autoFocus}
          placeholder="Add… e.g. Gym 7pm 1h #health !2"
          aria-label="Quick add"
          className="h-11 min-w-0 rounded-full bg-surface-2 px-5 text-[16px] placeholder:text-faint focus:outline-2 focus:outline-bone/50"
        />
        <div
          role="radiogroup"
          aria-label="Points"
          className="flex h-11 shrink-0 items-center rounded-full bg-surface-2 p-1"
        >
          {([1, 2, 3, 0] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={effectivePoints === p}
              aria-label={p === 0 ? 'Schedule only: on the calendar, not a task' : `${p} points`}
              title={p === 0 ? 'Schedule only: on the calendar, never a task or score' : undefined}
              disabled={parsed?.hasPoints || Boolean(habit)}
              onClick={() => setPoints(p)}
              className={`h-9 rounded-full text-[15px] transition disabled:cursor-default ${p === 0 ? 'px-3' : 'w-9'} ${effectivePoints === p ? 'bg-text font-semibold text-bg' : 'text-muted hover:text-text'}`}
            >
              {p === 0 ? 'Schedule' : p}
            </button>
          ))}
        </div>
        <button
          type="submit"
          disabled={!parsed?.title || pending || blocked}
          className={`ml-auto h-11 shrink-0 rounded-full bg-primary px-5 ${stacked ? '' : 'sm:ml-0'} text-[15px] font-medium text-on-primary transition hover:bg-bone active:scale-[0.97] disabled:opacity-40`}
        >
          Add
        </button>
      </div>
      {parsed && profile && (
        <p role="status" className="pl-5 text-[14px] text-faint">
          {blocked ? (
            <span className="text-band-fair">
              {tasksMode
                ? 'Schedule-only blocks need Calendar mode.'
                : 'Schedule only needs a time, e.g. Dinner 8pm.'}
            </span>
          ) : tasksMode ? (
            <>
              <span className="font-medium text-text">Google task</span> · {formatDay(taskDate)}
              {parsed.kind === 'event' ? ' · times are not kept in Tasks mode' : ''}
            </>
          ) : parsed.kind === 'event' ? (
            <>
              <span className="font-medium text-text">
                {habit
                  ? `Schedules your habit “${habit.title}”`
                  : scheduleOnly
                    ? 'Schedule only'
                    : 'Event'}
              </span>{' '}
              · {formatShortDay(parsed.start!, profile.timezone)}{' '}
              {formatTime(parsed.start!, profile.timezone)}–
              {formatTime(parsed.end!, profile.timezone)}
            </>
          ) : (
            <>
              <span className="font-medium text-text">Task</span> · {formatDay(taskDate)}
              {parsed.minutes ? ` · about ${formatMinutes(parsed.minutes)}` : ''}
            </>
          )}
          {' · '}
          {scheduleOnly
            ? 'no points'
            : `${effectivePoints} point${effectivePoints === 1 ? '' : 's'}`}
          {parsed.title && !habit && <> · “{parsed.title}”</>}
          {parsed.tags.map((t) => ` #${t}`).join('')}
        </p>
      )}
      {error && <Notice tone="error">{error.message}</Notice>}
    </form>
  );
}
