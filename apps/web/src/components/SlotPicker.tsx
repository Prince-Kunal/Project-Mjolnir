import { freeSlots, zonedInstant } from '@mjolnir/domain';
import { useMemo, useState } from 'react';
import { useBusyBlocks } from '../lib/day.ts';
import { formatMinutes, formatShortDay, formatTime } from '../lib/format.ts';
import { SLOT_SEARCH_DAYS, SLOT_SUGGESTIONS, SLOT_WINDOW } from '../lib/slots.ts';
import { Button, Loading, Notice } from './ui.tsx';

interface Props {
  minutes: number;
  timeZone: string;
  /** Options shown above the free slots, such as "Same time tomorrow". */
  extra?: { label: string; start: Date }[];
  onPick(start: Date, end: Date): void;
  pending: boolean;
  error?: string | null;
}

/** Free slots from the synced calendars (busy_blocks + freeSlots), or a day and time of your own. */
export function SlotPicker({ minutes, timeZone, extra = [], onPick, pending, error }: Props) {
  const [now] = useState(() => new Date());
  const until = useMemo(
    () => new Date(now.getTime() + SLOT_SEARCH_DAYS * 86_400_000).toISOString(),
    [now],
  );
  const busy = useBusyBlocks(now.toISOString(), until, true);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  const slots = useMemo(
    () =>
      busy.data
        ? freeSlots({
            ...SLOT_WINDOW,
            busy: busy.data,
            minutes,
            from: now,
            timeZone,
            limit: SLOT_SUGGESTIONS,
          })
        : [],
    [busy.data, minutes, now, timeZone],
  );

  const pick = (start: Date) => onPick(start, new Date(start.getTime() + minutes * 60_000));
  const slotButton = (start: Date, label: string) => (
    <button
      key={`${label}-${start.toISOString()}`}
      disabled={pending}
      onClick={() => pick(start)}
      className="flex w-full items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-left text-sm hover:border-accent disabled:opacity-50"
    >
      <span>{label}</span>
      <span className="text-muted tabular-nums">
        {formatTime(start.toISOString(), timeZone)}–
        {formatTime(new Date(start.getTime() + minutes * 60_000).toISOString(), timeZone)}
      </span>
    </button>
  );

  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-muted">
        Needs {formatMinutes(minutes)}. Free slots from your synced calendars:
      </p>
      {busy.isLoading ? (
        <Loading label="Finding free slots…" />
      ) : (
        <div className="flex flex-col gap-2">
          {extra.map((x) => slotButton(x.start, x.label))}
          {slots.map((s) => slotButton(new Date(s.start), formatShortDay(s.start, timeZone)))}
          {!slots.length && (
            <p className="text-muted">No free slot in the next two weeks. Pick a time below.</p>
          )}
        </div>
      )}

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const [h, m] = time.split(':').map(Number);
          if (date && h !== undefined && m !== undefined) pick(zonedInstant(date, h, m, timeZone));
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-muted">Day</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Start</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2"
          />
        </label>
        <Button type="submit" variant="secondary" disabled={!date || !time || pending}>
          Use this time
        </Button>
      </form>

      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
