import { addDays } from '@mjolnir/domain';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sheet } from '../../components/Sheet.tsx';
import { Button, Loading } from '../../components/ui.tsx';
import { type DayItem, useBacklog, useDay, useUpdateItem } from '../../lib/day.ts';
import { type Deadline, useDeadlines } from '../../lib/deadlines.ts';
import { formatDay, formatMinutes, formatTime } from '../../lib/format.ts';
import { useProfile } from '../../lib/queries.ts';
import { useToast } from '../../lib/toast.ts';
import { dueText } from '../deadlines/format.ts';
import { ItemSheet } from '../today/ItemSheet.tsx';
import { PointDots } from '../today/ItemRow.tsx';
import { QuickAdd } from '../today/QuickAdd.tsx';

/** Plan tomorrow (section 5): tomorrow's blocks, deadlines with nothing scheduled, the backlog. */
export function PlanTomorrowPage() {
  const { data: today } = useDay();
  const tomorrow = today ? addDays(today.today, 1) : undefined;
  const { data: day, isLoading } = useDay(tomorrow);
  const { data: profile } = useProfile();
  const { data: deadlines = [] } = useDeadlines();
  const { data: backlog = [] } = useBacklog();
  const update = useUpdateItem();
  const toast = useToast((s) => s.show);
  const [openId, setOpenId] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<Deadline | null>(null);

  if (!today || !tomorrow || isLoading || !day || !profile) return <Loading />;

  const tz = profile.timezone;
  const blocks = day.items.filter((i) => i.source === 'calendar' || i.source === 'gtask');
  const tasks = day.items.filter((i) => i.source === 'manual');
  const habits = day.items.filter((i) => i.source === 'habit');
  const minutes = blocks.reduce((n, i) => n + (i.planned_minutes ?? 0), 0);
  const unscheduled = deadlines.filter(
    (d) => !['done', 'dropped'].includes(d.status) && d.stats.sessions_upcoming === 0,
  );
  const open = day.items.find((i) => i.id === openId) ?? null;
  const firstTag = scheduling?.tags[0]?.name;

  return (
    <div>
      <h1 className="text-[28px] leading-tight md:text-[32px]">Plan tomorrow</h1>
      <p className="mt-1 text-sm text-muted">
        {formatDay(tomorrow)} · {day.score.planned} point{day.score.planned === 1 ? '' : 's'}{' '}
        planned
        {minutes ? ` · ${formatMinutes(minutes)} in blocks` : ''}
      </p>

      {today.missed_open > 0 && (
        <Link
          to="/missed"
          className="mt-5 flex items-center justify-between gap-3 rounded-[var(--radius-card)] bg-[#2a2213] text-[#f0c987] px-4 py-3 text-sm"
        >
          <span>
            {today.missed_open} missed task{today.missed_open === 1 ? '' : 's'} could go into
            tomorrow.
          </span>
          <span className="font-medium text-band-fair">Reschedule</span>
        </Link>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Section title="Schedule">
            {blocks.length ? (
              <ul className="divide-y divide-rule">
                {blocks.map((i) => (
                  <PlanRow key={i.id} item={i} timeZone={tz} onOpen={() => setOpenId(i.id)} />
                ))}
              </ul>
            ) : (
              <Hint>No blocks yet. Add one below or in Google Calendar.</Hint>
            )}
          </Section>

          {(tasks.length > 0 || habits.length > 0) && (
            <Section title="Tasks and habits">
              <ul className="divide-y divide-rule">
                {tasks.map((i) => (
                  <PlanRow key={i.id} item={i} timeZone={tz} onOpen={() => setOpenId(i.id)} />
                ))}
              </ul>
              {habits.length > 0 && (
                <p className="mt-2 text-xs text-muted">
                  {habits.length} habit{habits.length === 1 ? '' : 's'}:{' '}
                  {habits.map((h) => h.title).join(', ')}
                </p>
              )}
            </Section>
          )}

          <div className="rounded-[var(--radius-card)] bg-surface p-5">
            <QuickAdd key={tomorrow} defaultDate={tomorrow} initialText="" />
            <p className="mt-1.5 text-xs text-muted">
              With no day named, tasks go to tomorrow. For a block, name the time: “Gym tomorrow 7am
              1h”.
            </p>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          {unscheduled.length > 0 && (
            <Section title="Deadlines with nothing scheduled">
              <ul className="divide-y divide-rule">
                {unscheduled.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <Link to={`/deadlines/${d.id}`} className="block truncate hover:text-bone">
                        {d.title}
                      </Link>
                      <p className="text-xs text-muted">{dueText(d)}</p>
                    </div>
                    <Button
                      variant="secondary"
                      className="px-3 py-1.5"
                      onClick={() => setScheduling(d)}
                    >
                      Schedule
                    </Button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {backlog.length > 0 && (
            <Section title="From the backlog">
              <ul className="divide-y divide-rule">
                {backlog.slice(0, 10).map((t: DayItem) => (
                  <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <PointDots points={t.points} />
                    <Button
                      variant="ghost"
                      className="px-2 py-1 text-xs"
                      disabled={update.isPending}
                      onClick={() =>
                        update.mutate(
                          { id: t.id, patch: { logical_date: tomorrow } },
                          { onSuccess: () => toast(`“${t.title}” is on tomorrow`) },
                        )
                      }
                    >
                      Tomorrow
                    </Button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {unscheduled.length === 0 && backlog.length === 0 && (
            <Section title="Nothing waiting">
              <Hint>Every open deadline has a session coming, and the backlog is empty.</Hint>
            </Section>
          )}
        </div>
      </div>

      <ItemSheet item={open} today={today.today} timeZone={tz} onClose={() => setOpenId(null)} />
      <Sheet
        open={scheduling !== null}
        onOpenChange={(o) => !o && setScheduling(null)}
        title="Schedule a session"
        description="Edit the time if you like; the tag links it to the deadline."
      >
        {scheduling && (
          <QuickAdd
            stacked
            defaultDate={tomorrow}
            autoFocus
            initialText={`${scheduling.title}${firstTag ? ` #${firstTag}` : ''} tomorrow 6pm 1h`}
            onDone={() => setScheduling(null)}
          />
        )}
      </Sheet>
    </div>
  );
}

function PlanRow({ item, timeZone, onOpen }: { item: DayItem; timeZone: string; onOpen(): void }) {
  return (
    <li>
      <button onClick={onOpen} className="flex w-full items-center gap-3 py-2.5 text-left text-sm">
        <span className="w-24 shrink-0 text-xs text-muted tabular-nums">
          {item.start_at && !item.is_all_day
            ? `${formatTime(item.start_at, timeZone)}–${item.end_at ? formatTime(item.end_at, timeZone) : ''}`
            : 'Any time'}
        </span>
        <span className="min-w-0 flex-1 truncate">{item.title}</span>
        {item.tags.map((t) => (
          <span key={t.id} className="hidden rounded bg-surface-2 px-1.5 text-xs sm:inline">
            #{t.name}
          </span>
        ))}
        <PointDots points={item.points} />
      </button>
    </li>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] bg-surface px-5 pt-4 pb-2">
      <h2 className="text-[17px] text-text">{title}</h2>
      <div className="mt-1">{children}</div>
    </section>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="py-3 text-sm text-muted">{children}</p>;
}
