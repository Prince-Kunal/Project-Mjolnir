import { addDays, wallClock, zonedInstant } from '@mjolnir/domain';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Loading, Notice } from '../../components/ui.tsx';
import { type DayItem, useCalendarRange, useDay, useEditEvent } from '../../lib/day.ts';
import { useProfile } from '../../lib/queries.ts';
import { useToast } from '../../lib/toast.ts';
import { useNow } from '../../lib/useNow.ts';
import { ItemSheet } from '../today/ItemSheet.tsx';
import { CreateEventSheet } from './CreateEventSheet.tsx';
import { monthGrid, weekDays } from './layout.ts';
import { MonthGrid } from './MonthGrid.tsx';
import { TimeGrid } from './TimeGrid.tsx';

type View = 'day' | 'week' | 'month';
const pad = (n: number) => String(n).padStart(2, '0');

function localDate(iso: string, timeZone: string): string {
  const w = wallClock(new Date(iso), timeZone);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

function title(view: View, days: string[], anchor: string): string {
  const fmt = (d: string, o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(undefined, { ...o, timeZone: 'UTC' }).format(
      new Date(`${d}T12:00:00Z`),
    );
  if (view === 'month') return fmt(anchor, { month: 'long', year: 'numeric' });
  if (view === 'day')
    return fmt(anchor, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const [first, last] = [days[0]!, days.at(-1)!];
  return `${fmt(first, { day: 'numeric', month: 'short' })} – ${fmt(last, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function shift(view: View, date: string, dir: 1 | -1): string {
  if (view === 'day') return addDays(date, dir);
  if (view === 'week') return addDays(date, 7 * dir);
  const [y, m] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y!, m! - 1 + dir, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-01`;
}

/** A Google-Calendar-style view of the synced calendars: day, week and month. */
export function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const { data: day } = useDay();
  const now = useNow();
  const toast = useToast((s) => s.show);
  const move = useEditEvent();
  const [openId, setOpenId] = useState<string | null>(null);
  const [slot, setSlot] = useState<{ start: Date; end: Date } | null>(null);

  const wide = typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;
  const view = (params.get('view') as View | null) ?? (wide ? 'week' : 'day');
  const timeZone = profile?.timezone ?? 'UTC';
  const todayDate = localDate(new Date(now).toISOString(), timeZone);
  const anchor = params.get('date') ?? todayDate;
  const weekStart = profile?.week_start ?? 1;

  const days = useMemo(
    () =>
      view === 'day'
        ? [anchor]
        : view === 'week'
          ? weekDays(anchor, weekStart)
          : monthGrid(anchor, weekStart),
    [view, anchor, weekStart],
  );
  // One day either side catches blocks that cross midnight and late-night blocks of the day before.
  const {
    data: items,
    isLoading,
    error,
  } = useCalendarRange(addDays(days[0]!, -1), addDays(days.at(-1)!, 1));

  const { timed, byDate } = useMemo(() => {
    const timed: DayItem[] = [];
    const byDate = new Map<string, DayItem[]>();
    const add = (d: string, i: DayItem) => byDate.set(d, [...(byDate.get(d) ?? []), i]);
    for (const i of items ?? []) {
      if (i.source === 'calendar' && i.start_at && !i.is_all_day) {
        timed.push(i);
        if (view === 'month') add(localDate(i.start_at, timeZone), i);
      } else if (i.logical_date) {
        add(i.logical_date, i);
      }
    }
    return { timed, byDate };
  }, [items, view, timeZone]);

  const go = (next: Partial<{ view: View; date: string }>) => {
    const v = next.view ?? view;
    const d = next.date ?? anchor;
    setParams({ view: v, ...(d === todayDate ? {} : { date: d }) });
  };
  const opened = items?.find((i) => i.id === openId) ?? null;

  if (!profile || !day) return <Loading />;

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col md:h-[calc(100dvh-4rem)]">
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <Button variant="secondary" className="px-3 py-1.5" onClick={() => go({ date: todayDate })}>
          Today
        </Button>
        <div className="flex">
          {([-1, 1] as const).map((dir) => (
            <button
              key={dir}
              onClick={() => go({ date: shift(view, anchor, dir) })}
              aria-label={dir < 0 ? 'Previous' : 'Next'}
              className="rounded-full p-2 text-faint hover:bg-surface-2 hover:text-text"
            >
              <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
                <path
                  d={dir < 0 ? 'M10 3L5 8l5 5' : 'M6 3l5 5-5 5'}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ))}
        </div>
        <h1 className="min-w-0 flex-1 truncate font-display text-[22px] md:text-[26px]">
          {title(view, days, anchor)}
        </h1>
        <div
          role="radiogroup"
          aria-label="View"
          className="flex rounded-full bg-surface-2 p-1 text-sm"
        >
          {(['day', 'week', 'month'] as const).map((v) => (
            <button
              key={v}
              role="radio"
              aria-checked={view === v}
              onClick={() => go({ view: v })}
              className={`rounded-md px-2.5 py-1 capitalize ${view === v ? 'bg-text font-medium text-bg' : 'text-muted'}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {error && <Notice tone="error">Could not load the calendar.</Notice>}
      <div className="min-h-0 flex-1 overflow-hidden rounded-[var(--radius-card)] bg-surface/30">
        {isLoading && !items ? (
          <div className="p-4">
            <Loading />
          </div>
        ) : view === 'month' ? (
          <MonthGrid
            days={days}
            month={anchor.slice(0, 7)}
            byDate={byDate}
            timeZone={timeZone}
            todayDate={todayDate}
            weekStart={weekStart}
            onOpen={(i) => setOpenId(i.id)}
            onOpenDay={(d) => go({ view: 'day', date: d })}
            onCreateOn={(d) =>
              setSlot({
                start: zonedInstant(d, 9, 0, timeZone),
                end: zonedInstant(d, 10, 0, timeZone),
              })
            }
          />
        ) : (
          <TimeGrid
            days={days}
            items={timed}
            allDay={byDate}
            timeZone={timeZone}
            todayDate={todayDate}
            now={now}
            onCreate={(start, end) => setSlot({ start, end })}
            onOpen={(i) => setOpenId(i.id)}
            onOpenDay={(d) =>
              view === 'day' ? navigate(`/?date=${d}`) : go({ view: 'day', date: d })
            }
            onMove={(i, start, end) =>
              move.mutate(
                { id: i.id, start: start.toISOString(), end: end.toISOString() },
                {
                  onSuccess: () => toast('Moved in Google Calendar'),
                  onError: (e) => toast(e.message),
                },
              )
            }
          />
        )}
      </div>

      <ItemSheet
        item={opened}
        today={day.today}
        timeZone={timeZone}
        onClose={() => setOpenId(null)}
      />
      <CreateEventSheet slot={slot} timeZone={timeZone} onClose={() => setSlot(null)} />
    </div>
  );
}
