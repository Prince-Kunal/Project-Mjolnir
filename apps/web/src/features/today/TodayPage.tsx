import { addDays } from '@mjolnir/domain';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useToast } from '../../lib/toast.ts';
import { Button, Loading, Notice } from '../../components/ui.tsx';
import { type DayItem, useDay, useToggleItem } from '../../lib/day.ts';
import { formatDay } from '../../lib/format.ts';
import { useNow } from '../../lib/useNow.ts';
import { type Area, useAreas, useProfile } from '../../lib/queries.ts';
import { BacklogDrawer } from './BacklogDrawer.tsx';
import { DailyNote } from './DailyNote.tsx';
import { ItemRow } from './ItemRow.tsx';
import { ItemSheet } from './ItemSheet.tsx';
import { QuickAdd } from './QuickAdd.tsx';
import { BAND_COLOR, BAND_LABEL } from '../../lib/bands.ts';
import { ScoreRing } from './ScoreRing.tsx';
import { StreakLine } from './StreakLine.tsx';

const GROUP_KEY = 'mjolnir.today.byArea';

function readGroupPref(): boolean {
  try {
    return localStorage.getItem(GROUP_KEY) === '1';
  } catch {
    return false;
  }
}

function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  if (date === addDays(today, 1)) return 'Tomorrow';
  return formatDay(date).split(',')[0]!;
}

interface Group {
  key: string;
  title: string;
  items: DayItem[];
}

/** Section 11: Schedule (by time), Tasks, Habits; or everything by area, like the Notion layout. */
function groupItems(items: DayItem[], byArea: boolean, areas: Area[]): Group[] {
  if (byArea) {
    const named = areas.map((a) => ({
      key: a.id,
      title: a.name,
      items: items.filter((i) => i.area_id === a.id),
    }));
    const known = new Set(areas.map((a) => a.id));
    const rest = items.filter((i) => !i.area_id || !known.has(i.area_id));
    return [...named, { key: 'none', title: 'No area', items: rest }].filter((g) => g.items.length);
  }
  return [
    {
      key: 'schedule',
      title: 'Schedule',
      items: items.filter((i) => i.source === 'calendar' || i.source === 'gtask'),
    },
    { key: 'tasks', title: 'Tasks', items: items.filter((i) => i.source === 'manual') },
    { key: 'habits', title: 'Habits', items: items.filter((i) => i.source === 'habit') },
  ].filter((g) => g.items.length);
}

export function TodayPage() {
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? undefined;
  const { data: view, isLoading, error } = useDay(date);
  const { data: profile } = useProfile();
  const { data: areas = [] } = useAreas();
  const toggle = useToggleItem();
  const toast = useToast((s) => s.show);
  const now = useNow();
  const [byArea, setByArea] = useState(readGroupPref);
  const [openId, setOpenId] = useState<string | null>(null);
  const [backlogOpen, setBacklogOpen] = useState(false);

  if (isLoading || !profile) return <Loading />;
  if (error || !view)
    return <Notice tone="error">Could not load this day. Pull to refresh or try again.</Notice>;

  const isToday = view.date === view.today;
  const go = (d: string) => setParams(d === view.today ? {} : { date: d });
  const groups = groupItems(view.items, byArea, areas);
  const open = view.items.find((i) => i.id === openId) ?? null;

  function onToggle(item: DayItem) {
    const done = item.status !== 'done';
    toggle.mutate(
      { item, done },
      {
        onSuccess: () =>
          done &&
          toast(`Ticked “${item.title}”`, {
            label: 'Undo',
            run: () => toggle.mutate({ item: { ...item, status: 'done' }, done: false }),
          }),
        onError: (e) => toast(e.message),
      },
    );
  }

  function setGrouping(value: boolean) {
    setByArea(value);
    try {
      localStorage.setItem(GROUP_KEY, value ? '1' : '0');
    } catch {
      // A per-device preference; fine to lose.
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <button
              onClick={() => go(addDays(view.date, -1))}
              className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text"
              aria-label="Previous day"
            >
              <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
                <path
                  d="M10 3L5 8l5 5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <h1 className="text-2xl font-semibold tracking-tight">
              {dayLabel(view.date, view.today)}
            </h1>
            <button
              onClick={() => go(addDays(view.date, 1))}
              className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text"
              aria-label="Next day"
            >
              <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
                <path
                  d="M6 3l5 5-5 5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          <p className="mt-0.5 pl-1 text-sm text-muted">{formatDay(view.date)}</p>
          <p className="mt-3 pl-1 text-sm">
            <span className="font-semibold tabular-nums">{view.score.done}</span>
            <span className="text-muted"> of {view.score.planned} points</span>
            {view.score.planned > 0 && (
              <span className="ml-2 font-medium" style={{ color: BAND_COLOR[view.score.band] }}>
                {BAND_LABEL[view.score.band]}
              </span>
            )}
          </p>
          <StreakLine streak={view.streak} todayRate={view.score.rate} isToday={isToday} />
          {view.finalized && (
            <p className="mt-1 pl-1 text-xs text-muted">Day closed · score frozen</p>
          )}
          {!isToday && (
            <button
              onClick={() => go(view.today)}
              className="mt-1 pl-1 text-xs font-medium text-accent"
            >
              Back to today
            </button>
          )}
        </div>
        <ScoreRing rate={view.score.rate} band={view.score.band} />
      </header>

      {view.missed_open > 0 && (
        <Link
          to="/missed"
          className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-band-fair/40 bg-band-fair/10 px-4 py-3 text-sm"
        >
          <span>
            You missed {view.missed_open} task{view.missed_open === 1 ? '' : 's'}. Reschedule?
          </span>
          <span className="font-medium text-band-fair">Open</span>
        </Link>
      )}

      <div className="mt-6 flex items-center justify-between gap-2">
        <div
          role="radiogroup"
          aria-label="Group items"
          className="flex rounded-lg border border-border p-0.5 text-xs"
        >
          {[
            [false, 'By type'],
            [true, 'By area'],
          ].map(([value, label]) => (
            <button
              key={String(value)}
              role="radio"
              aria-checked={byArea === value}
              onClick={() => setGrouping(value as boolean)}
              className={`rounded-md px-2.5 py-1 ${byArea === value ? 'bg-surface-2 font-medium text-text' : 'text-muted'}`}
            >
              {label as string}
            </button>
          ))}
        </div>
        <Button variant="ghost" onClick={() => setBacklogOpen(true)} className="px-2 text-xs">
          Backlog
        </Button>
      </div>

      {groups.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          Nothing planned. Add blocks in Google Calendar, or a task below.
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="mt-6">
            <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">{g.title}</h2>
            <ul className="mt-1 divide-y divide-border">
              {g.items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  timeZone={profile.timezone}
                  isToday={isToday}
                  now={now}
                  onToggle={onToggle}
                  onOpen={(i) => setOpenId(i.id)}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {!view.finalized && (
        <div className="mt-8">
          <QuickAdd defaultDate={view.date} />
        </div>
      )}

      <DailyNote key={view.date} date={view.date} initial={view.note ?? ''} />

      <ItemSheet
        item={open}
        today={view.today}
        timeZone={profile.timezone}
        onClose={() => setOpenId(null)}
      />
      <BacklogDrawer open={backlogOpen} onOpenChange={setBacklogOpen} today={view.today} />
    </div>
  );
}
