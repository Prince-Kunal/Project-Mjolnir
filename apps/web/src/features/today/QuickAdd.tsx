import { useMemo, useState } from 'react';
import { Notice } from '../../components/ui.tsx';
import { useCreateEvent, useCreateTask } from '../../lib/day.ts';
import { formatDay, formatMinutes, formatShortDay, formatTime } from '../../lib/format.ts';
import { useProfile } from '../../lib/queries.ts';
import { parseQuickAdd } from '../../lib/quickAdd.ts';
import { useToast } from '../../lib/toast.ts';

interface Props {
  /** Day for a task when the text names none: the day being viewed. */
  defaultDate: string;
  autoFocus?: boolean;
  /** Text to start from, such as a deadline's tag. */
  initialText?: string;
  onDone?(): void;
}

/**
 * Quick add (section 5): `PR review tomorrow 6pm 2h #lfx !2`. With a time it becomes a Google
 * Calendar event coloured for its points; otherwise a task for the named day.
 */
export function QuickAdd({ defaultDate, autoFocus, initialText = '', onDone }: Props) {
  const { data: profile } = useProfile();
  const [text, setText] = useState(initialText);
  const [points, setPoints] = useState<1 | 2 | 3>(1);
  const createEvent = useCreateEvent();
  const createTask = useCreateTask();
  const toast = useToast((s) => s.show);

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
  const effectivePoints = parsed?.hasPoints ? parsed.points : points;
  const taskDate = parsed?.hasDate ? parsed.date : defaultDate;
  const pending = createEvent.isPending || createTask.isPending;
  const error = createEvent.error ?? createTask.error;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed?.title || !profile) return;
    const done = () => {
      setText('');
      onDone?.();
    };
    if (parsed.kind === 'event') {
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
          points: effectivePoints,
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
      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus={autoFocus}
          placeholder="Add… e.g. Gym 7pm 1h #health !2"
          aria-label="Quick add"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <div
          role="radiogroup"
          aria-label="Points"
          className="flex overflow-hidden rounded-lg border border-border"
        >
          {([1, 2, 3] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={effectivePoints === p}
              disabled={parsed?.hasPoints}
              onClick={() => setPoints(p)}
              className={`w-8 py-2 text-sm disabled:cursor-default ${effectivePoints === p ? 'bg-accent font-semibold text-bg' : 'text-muted'}`}
            >
              {p}
            </button>
          ))}
        </div>
        <button
          type="submit"
          disabled={!parsed?.title || pending}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {parsed && profile && (
        <p role="status" className="pl-1 text-xs text-muted">
          {parsed.kind === 'event' ? (
            <>
              <span className="font-medium text-text">Event</span> ·{' '}
              {formatShortDay(parsed.start!, profile.timezone)}{' '}
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
          {effectivePoints} point{effectivePoints === 1 ? '' : 's'}
          {parsed.title && <> · “{parsed.title}”</>}
          {parsed.tags.map((t) => ` #${t}`).join('')}
        </p>
      )}
      {error && <Notice tone="error">{error.message}</Notice>}
    </form>
  );
}
