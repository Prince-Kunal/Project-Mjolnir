import { addDays, weekdayOf, wallClock, weekKey } from '@mjolnir/domain';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loading, Notice, Segmented } from '../../components/ui.tsx';
import { type DayItem, useDay, useToggleItem } from '../../lib/day.ts';
import { formatDay, formatTime } from '../../lib/format.ts';
import { type Area, useAreas, useProfile } from '../../lib/queries.ts';
import { useToast } from '../../lib/toast.ts';
import { useMediaQuery } from '../../lib/useMediaQuery.ts';
import { useNow } from '../../lib/useNow.ts';
import { BacklogDrawer } from './BacklogDrawer.tsx';
import { DailyNote } from './DailyNote.tsx';
import { ForgePanel } from './ForgePanel.tsx';
import { ItemRow } from './ItemRow.tsx';
import { ItemSheet } from './ItemSheet.tsx';
import { QuickAdd } from './QuickAdd.tsx';

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

/** "Sunday 25 October"; a Thursday is Þórsdagr, Thor's day. */
function dateLine(date: string): string {
  const full = formatDay(date);
  return weekdayOf(date) === 4 ? full.replace(/^[^,\s]+,?/, 'Thor’s day,') : full;
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

/** The one line under the title: what needs doing next on this day. */
function finding(items: DayItem[], isToday: boolean, now: number, timeZone: string): string | null {
  const open = items.filter((i) => i.status === 'pending' && i.points > 0);
  if (!open.length) return items.some((i) => i.points > 0) ? 'Everything planned is done.' : null;
  if (!isToday) return `${open.length} open item${open.length === 1 ? '' : 's'}`;
  const overdue = open.filter((i) => i.end_at && Date.parse(i.end_at) < now);
  const next = open
    .filter((i) => i.start_at && Date.parse(i.start_at) >= now)
    .sort((a, b) => Date.parse(a.start_at!) - Date.parse(b.start_at!))[0];
  const parts = [];
  if (next) parts.push(`Next: ${next.title} at ${formatTime(next.start_at!, timeZone)}`);
  if (overdue.length)
    parts.push(
      `${overdue.length} block${overdue.length === 1 ? '' : 's'} past ${overdue.length === 1 ? 'its' : 'their'} time`,
    );
  if (!parts.length) parts.push(`${open.length} still open`);
  return parts.join(' · ');
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
  // One forge panel: compact above the list on phones and tablets, beside it on a laptop.
  const wide = useMediaQuery('(min-width: 1024px)');

  if (isLoading || !profile) return <Loading />;
  if (error || !view)
    return <Notice tone="error">Could not load this day. Pull to refresh or try again.</Notice>;

  const isToday = view.date === view.today;
  // Evening and end-of-week prompts (section 5: Plan tomorrow, Sunday review).
  const evening = isToday && wallClock(new Date(now), profile.timezone).hour >= 18;
  const weekEnds = isToday && addDays(weekKey(view.today, profile.week_start), 6) === view.today;
  const go = (d: string) => setParams(d === view.today ? {} : { date: d });
  const groups = groupItems(view.items, byArea, areas);
  const open = view.items.find((i) => i.id === openId) ?? null;
  const line = view.finalized
    ? 'Day closed · score frozen'
    : view.date < view.today
      ? `Open until ${formatTime(view.freezes_at, profile.timezone)}${view.date === addDays(view.today, -1) ? ' today' : ''} · tick what you finished`
      : finding(view.items, isToday, now, profile.timezone);

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

  const forge = (compact: boolean) => (
    <ForgePanel
      score={view.score}
      streak={view.streak}
      date={view.date}
      today={view.today}
      weekStart={profile.week_start}
      live={isToday && !view.finalized}
      compact={compact}
    />
  );

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <DayArrow dir="prev" onClick={() => go(addDays(view.date, -1))} />
            <h1 className="text-[28px] leading-none md:text-[32px]">
              {dayLabel(view.date, view.today)}
            </h1>
            <DayArrow dir="next" onClick={() => go(addDays(view.date, 1))} />
          </div>
          <p
            className="mt-2 pl-1 text-[16px] text-muted"
            title={weekdayOf(view.date) === 4 ? 'Thursday is Þórsdagr: Thor’s day' : undefined}
          >
            {dateLine(view.date)}
          </p>
          {line && <p className="mt-0.5 pl-1 text-[16px] text-text">{line}</p>}
          {!isToday && (
            <button
              onClick={() => go(view.today)}
              className="mt-2 ml-1 text-[15px] text-muted underline decoration-active underline-offset-4 hover:text-text"
            >
              Back to today
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {weekEnds && <PillLink to="/review">Sunday review</PillLink>}
          {evening && <PillLink to="/plan">Plan tomorrow</PillLink>}
          <button
            onClick={() => setBacklogOpen(true)}
            className="h-9 rounded-full bg-surface-2 px-4 text-[15px] text-text transition hover:bg-active"
          >
            Backlog
          </button>
        </div>
      </header>

      {!wide && <div className="mt-5">{forge(true)}</div>}

      <div className="mt-6 grid gap-6 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_368px]">
        <div className="min-w-0">
          {isToday && (
            <YesterdayOpen
              date={addDays(view.today, -1)}
              timeZone={profile.timezone}
              onOpen={() => go(addDays(view.today, -1))}
            />
          )}
          {view.missed_open > 0 && (
            <Link
              to="/missed"
              className="mb-6 flex items-center justify-between gap-4 rounded-[var(--radius-card)] bg-[#2a2213] px-5 py-4 transition hover:bg-[#33291a]"
            >
              <span className="text-[16px] text-[#f0c987]">
                You missed {view.missed_open} task{view.missed_open === 1 ? '' : 's'}. Reschedule?
              </span>
              <span className="shrink-0 rounded-full bg-[#f0c987] px-3.5 py-1.5 text-[14px] font-semibold text-[#2a2213]">
                Open
              </span>
            </Link>
          )}

          <div className="mb-3 flex items-center justify-between gap-3">
            <Segmented
              label="Group items"
              value={byArea ? 'area' : 'type'}
              options={[
                ['type', 'By type'],
                ['area', 'By area'],
              ]}
              onChange={(v) => setGrouping(v === 'area')}
            />
          </div>

          {groups.length === 0 ? (
            <p className="rounded-[var(--radius-card)] bg-surface px-6 py-10 text-center text-[16px] text-muted">
              Nothing planned. Add blocks in Google Calendar, or a task below.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map((g) => (
                <section
                  key={g.key}
                  className="rounded-[var(--radius-card)] bg-surface px-4 pt-3 pb-1 md:px-5"
                >
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-[17px]">{g.title}</h2>
                    <span className="text-[14px] text-faint tabular-nums">
                      {g.items.filter((i) => i.status === 'done').length} of{' '}
                      {g.items.filter((i) => i.points > 0 || i.status === 'done').length} done
                    </span>
                  </div>
                  <ul className="divide-y divide-rule">
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
              ))}
            </div>
          )}

          {!view.finalized && (
            <div className="mt-6">
              <QuickAdd defaultDate={view.date} />
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-[76px] lg:self-start">
          {wide && forge(false)}
          <DailyNote key={view.date} date={view.date} initial={view.note ?? ''} />
        </aside>
      </div>

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

function PillLink({ to, children }: { to: string; children: string }) {
  return (
    <Link
      to={to}
      className="flex h-9 items-center rounded-full bg-surface-2 px-4 text-[15px] text-text transition hover:bg-active"
    >
      {children}
    </Link>
  );
}

function DayArrow({ dir, onClick }: { dir: 'prev' | 'next'; onClick(): void }) {
  return (
    <button
      onClick={onClick}
      className="flex size-9 items-center justify-center rounded-full text-faint transition hover:bg-surface-2 hover:text-text"
      aria-label={dir === 'prev' ? 'Previous day' : 'Next day'}
    >
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
        <path
          d={dir === 'prev' ? 'M10 3L5 8l5 5' : 'M6 3l5 5-5 5'}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/**
 * Decision 16: yesterday stays open until noon, so a block finished late can be ticked over
 * breakfast. A quiet note while it still has unticked points; gone once it freezes.
 */
function YesterdayOpen({
  date,
  timeZone,
  onOpen,
}: {
  date: string;
  timeZone: string;
  onOpen(): void;
}) {
  const { data } = useDay(date);
  if (!data || data.finalized) return null;
  const open = data.items
    .filter((i) => i.status === 'pending' && i.points > 0)
    .reduce((n, i) => n + i.points, 0);
  if (!open) return null;
  return (
    <button
      onClick={onOpen}
      className="mb-6 flex w-full items-center justify-between gap-4 rounded-[var(--radius-card)] bg-surface px-5 py-4 text-left transition hover:bg-surface-2"
    >
      <span className="min-w-0 text-[16px]">
        Yesterday is open until {formatTime(data.freezes_at, timeZone)}
        <span className="block text-[15px] text-muted">
          {open} point{open === 1 ? '' : 's'} unticked. Tick what you finished.
        </span>
      </span>
      <span className="shrink-0 rounded-full bg-text px-3.5 py-1.5 text-[14px] font-medium text-bg">
        Open yesterday
      </span>
    </button>
  );
}
