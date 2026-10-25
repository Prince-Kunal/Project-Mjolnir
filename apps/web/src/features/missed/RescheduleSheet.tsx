import { addDays, shiftLocalDays } from '@mjolnir/domain';
import { useMemo, useState } from 'react';
import { Sheet } from '../../components/Sheet.tsx';
import { SlotPicker } from '../../components/SlotPicker.tsx';
import { Button, Notice } from '../../components/ui.tsx';
import { type MissedItem, useRescheduleEvent, useRescheduleManual } from '../../lib/day.ts';
import { formatShortDay, formatTime } from '../../lib/format.ts';
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
  const reschedule = useRescheduleEvent();
  const toast = useToast((s) => s.show);
  const [now] = useState(() => Date.now());

  // The block's local time on the logical day after today (3.5 bulk action, for one item).
  const sameTimeTomorrow = useMemo(() => {
    if (!item.start_at || !item.logical_date) return null;
    const start = shiftLocalDays(
      item.start_at,
      daysBetween(item.logical_date, addDays(today, 1)),
      timeZone,
    );
    return start.getTime() > now ? start : null;
  }, [item, today, timeZone, now]);

  return (
    <SlotPicker
      minutes={durationOf(item)}
      timeZone={timeZone}
      extra={sameTimeTomorrow ? [{ label: 'Same time tomorrow', start: sameTimeTomorrow }] : []}
      pending={reschedule.isPending}
      error={reschedule.error?.message}
      onPick={(start, end) =>
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
        )
      }
    />
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
            className="rounded-[var(--radius-inner)] bg-surface-2 px-3 py-2"
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
