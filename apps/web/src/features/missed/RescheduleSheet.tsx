import { addDays, freeSlots, shiftLocalDays, zonedInstant } from '@mjolnir/domain';
import { useMemo, useState } from 'react';
import { Sheet } from '../../components/Sheet.tsx';
import { Button, Loading, Notice } from '../../components/ui.tsx';
import {
  type MissedItem,
  useBusyBlocks,
  useRescheduleEvent,
  useRescheduleManual,
} from '../../lib/day.ts';
import { formatMinutes, formatShortDay, formatTime } from '../../lib/format.ts';
import { SLOT_SEARCH_DAYS, SLOT_SUGGESTIONS, SLOT_WINDOW } from '../../lib/slots.ts';
import { useToast } from '../../lib/toast.ts';

interface Props {
  item: MissedItem | null;
  today: string;
  timeZone: string;
  onClose(): void;
}

export function RescheduleSheet({ item, today, timeZone, onClose }: Props) {
  return (
    <Sheet
      open={item !== null}
      onOpenChange={(o) => !o && onClose()}
      title={item ? `Reschedule “${item.title}”` : 'Reschedule'}
      description="It stays missed on its day. The new slot is a fresh task."
    >
      {item &&
        (item.source === 'calendar' ? (
          <EventSlots
            key={item.id}
            item={item}
            today={today}
            timeZone={timeZone}
            onDone={onClose}
          />
        ) : (
          <TaskDays key={item.id} item={item} today={today} onDone={onClose} />
        ))}
    </Sheet>
  );
}

function durationOf(item: MissedItem): number {
  if (item.planned_minutes) return item.planned_minutes;
  if (item.start_at && item.end_at)
    return Math.round((Date.parse(item.end_at) - Date.parse(item.start_at)) / 60_000);
  return 60;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function EventSlots({
  item,
  today,
  timeZone,
  onDone,
}: {
  item: MissedItem;
  today: string;
  timeZone: string;
  onDone(): void;
}) {
  const minutes = durationOf(item);
  const [now] = useState(() => new Date());
  const until = useMemo(
    () => new Date(now.getTime() + SLOT_SEARCH_DAYS * 86_400_000).toISOString(),
    [now],
  );
  const busy = useBusyBlocks(now.toISOString(), until, true);
  const reschedule = useRescheduleEvent();
  const toast = useToast((s) => s.show);
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

  // The block's local time on the logical day after today (3.5 bulk action, for one item).
  const sameTimeTomorrow = useMemo(() => {
    if (!item.start_at || !item.logical_date) return null;
    const days = daysBetween(item.logical_date, addDays(today, 1));
    const start = shiftLocalDays(item.start_at, days, timeZone);
    return start.getTime() > now.getTime() ? start : null;
  }, [item, today, timeZone, now]);

  function pick(start: Date) {
    const end = new Date(start.getTime() + minutes * 60_000);
    reschedule.mutate(
      { id: item.id, start: start.toISOString(), end: end.toISOString() },
      {
        onSuccess: () => {
          toast(
            `Rescheduled to ${formatShortDay(start.toISOString(), timeZone)}, ${formatTime(start.toISOString(), timeZone)}`,
          );
          onDone();
        },
      },
    );
  }

  const slotButton = (start: Date, label: string) => (
    <button
      key={start.toISOString()}
      disabled={reschedule.isPending}
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
          {sameTimeTomorrow && slotButton(sameTimeTomorrow, 'Same time tomorrow')}
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
        <Button type="submit" variant="secondary" disabled={!date || !time || reschedule.isPending}>
          Use this time
        </Button>
      </form>

      {reschedule.error && <Notice tone="error">{reschedule.error.message}</Notice>}
    </div>
  );
}

function TaskDays({ item, today, onDone }: { item: MissedItem; today: string; onDone(): void }) {
  const reschedule = useRescheduleManual();
  const toast = useToast((s) => s.show);
  const [date, setDate] = useState('');
  const go = (d: string) =>
    reschedule.mutate(
      { id: item.id, date: d },
      { onSuccess: () => (toast('Task rescheduled'), onDone()) },
    );

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex gap-2">
        <Button onClick={() => go(today)} disabled={reschedule.isPending}>
          Today
        </Button>
        <Button
          variant="secondary"
          onClick={() => go(addDays(today, 1))}
          disabled={reschedule.isPending}
        >
          Tomorrow
        </Button>
      </div>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (date) go(date);
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-muted">Another day</span>
          <input
            type="date"
            min={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2"
          />
        </label>
        <Button type="submit" variant="secondary" disabled={!date || reschedule.isPending}>
          Move
        </Button>
      </form>
      {reschedule.error && <Notice tone="error">{reschedule.error.message}</Notice>}
    </div>
  );
}
