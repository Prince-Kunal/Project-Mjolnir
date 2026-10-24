import { wallClock, zonedInstant } from '@mjolnir/domain';
import { useState } from 'react';
import { Sheet } from '../../components/Sheet.tsx';
import { Button, Notice } from '../../components/ui.tsx';
import { useCreateEvent } from '../../lib/day.ts';
import { formatDay } from '../../lib/format.ts';
import { useToast } from '../../lib/toast.ts';

const pad = (n: number) => String(n).padStart(2, '0');

function local(d: Date, timeZone: string) {
  const w = wallClock(d, timeZone);
  return {
    date: `${w.year}-${pad(w.month)}-${pad(w.day)}`,
    time: `${pad(w.hour)}:${pad(w.minute)}`,
  };
}

interface Props {
  slot: { start: Date; end: Date } | null;
  timeZone: string;
  onClose(): void;
}

/** New event from a click or drag on the calendar: title (with #tags), points, times. */
export function CreateEventSheet({ slot, timeZone, onClose }: Props) {
  return (
    <Sheet open={slot !== null} onOpenChange={(o) => !o && onClose()} title="New event">
      {slot && (
        <CreateEventForm
          key={slot.start.toISOString()}
          slot={slot}
          timeZone={timeZone}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}

function CreateEventForm({
  slot,
  timeZone,
  onClose,
}: {
  slot: { start: Date; end: Date };
  timeZone: string;
  onClose(): void;
}) {
  const create = useCreateEvent();
  const toast = useToast((s) => s.show);
  const s = local(slot.start, timeZone);
  const e = local(slot.end, timeZone);
  const [title, setTitle] = useState('');
  const [points, setPoints] = useState(1);
  const [date, setDate] = useState(s.date);
  const [start, setStart] = useState(s.time);
  const [end, setEnd] = useState(e.time);

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!title.trim()) return;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const startAt = zonedInstant(date, sh!, sm!, timeZone);
    let endAt = zonedInstant(date, eh!, em!, timeZone);
    if (endAt <= startAt) endAt = new Date(endAt.getTime() + 86_400_000); // past midnight
    create.mutate(
      { title: title.trim(), points, start: startAt.toISOString(), end: endAt.toISOString() },
      {
        onSuccess: () => {
          toast('Added to Google Calendar');
          onClose();
        },
      },
    );
  }

  const field = 'rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm';
  return (
    <form onSubmit={submit} className="flex flex-col gap-4 text-sm">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title, e.g. PR review #lfx"
        aria-label="Title"
        className={`${field} text-base`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Day"
          className={field}
        />
        <input
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          aria-label="Start"
          className={field}
        />
        <span className="text-muted">to</span>
        <input
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          aria-label="End"
          className={field}
        />
      </div>
      <p className="-mt-2 text-xs text-muted">{formatDay(date)}</p>
      <div>
        <p className="mb-1.5 font-medium">Points</p>
        <div
          role="radiogroup"
          aria-label="Points"
          className="flex w-40 overflow-hidden rounded-lg border border-border"
        >
          {[1, 2, 3].map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={points === p}
              onClick={() => setPoints(p)}
              className={`flex-1 py-1.5 ${points === p ? 'bg-accent font-semibold text-bg' : 'text-muted'}`}
            >
              {p}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted">
          The event gets the colour you mapped to these points.
        </p>
      </div>
      {create.error && <Notice tone="error">{create.error.message}</Notice>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!title.trim() || create.isPending}>
          {create.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
