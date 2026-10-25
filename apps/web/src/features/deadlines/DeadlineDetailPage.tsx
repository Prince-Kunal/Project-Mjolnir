import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Sheet } from '../../components/Sheet.tsx';
import { Button, Loading, Notice } from '../../components/ui.tsx';
import { type DayItem, useDay } from '../../lib/day.ts';
import { useDeadline, useDeleteDeadline, useUpdateDeadline } from '../../lib/deadlines.ts';
import { formatDayMonth, formatMinutes, formatWeekday } from '../../lib/format.ts';
import { useProfile } from '../../lib/queries.ts';
import { useNow } from '../../lib/useNow.ts';
import { ItemSheet } from '../today/ItemSheet.tsx';
import { QuickAdd } from '../today/QuickAdd.tsx';
import { DeadlineForm } from './DeadlineForm.tsx';
import { dueText, sessionWhen } from './format.ts';
import { ProgressSlider, StatusSelect, Warnings } from './parts.tsx';

const STATUS_TEXT: Record<string, string> = {
  done: 'Done',
  missed: 'Missed',
  pending: 'Planned',
};

/** Screen 6 detail: sessions past and upcoming, tags, targets, notes, and scheduling a session. */
export function DeadlineDetailPage() {
  const { id = '' } = useParams();
  const { data: d, isLoading } = useDeadline(id);
  const { data: day } = useDay();
  const { data: profile } = useProfile();
  const remove = useDeleteDeadline();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const now = useNow();

  if (isLoading || !profile) return <Loading />;
  if (!d)
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-4 text-[28px] leading-tight md:text-[32px]">Deadline not found</h1>
        <Notice tone="error">This deadline no longer exists.</Notice>
        <Link
          to="/deadlines"
          className="mt-4 inline-block text-sm text-text underline decoration-active underline-offset-4"
        >
          Back to deadlines
        </Link>
      </div>
    );

  const tz = profile.timezone;
  const sessions = d.sessions ?? [];
  const isUpcoming = (s: DayItem) =>
    s.status === 'pending' &&
    (s.start_at
      ? Date.parse(s.start_at) > now
      : s.logical_date !== null && day !== undefined && s.logical_date >= day.today);
  const upcoming = sessions.filter(isUpcoming);
  const past = sessions.filter((s) => !isUpcoming(s)).reverse();
  const open = sessions.find((s) => s.id === openId) ?? null;
  const s = d.stats;
  const firstTag = d.tags[0]?.name;

  return (
    <div>
      <Link to="/deadlines" className="text-sm text-muted hover:text-text">
        ← Deadlines
      </Link>
      <div className="mt-3 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <div className="min-w-0">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[28px] leading-tight md:text-[32px]">{d.title}</h1>
              <p className="mt-1 text-sm text-muted">{dueText(d)}</p>
            </div>
            <StatusSelect deadline={d} />
          </header>

          <div className="mt-4">
            <ProgressSlider deadline={d} />
          </div>
          <div className="mt-3">
            <Warnings warnings={d.warnings} />
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Sessions done"
              value={`${s.sessions_done}${d.target_sessions ? ` / ${d.target_sessions}` : ''}`}
            />
            <Stat label="Upcoming" value={String(s.sessions_upcoming)} />
            <Stat label="Missed" value={String(s.sessions_missed)} />
            <Stat
              label="Hours done"
              value={`${formatMinutes(s.minutes_done)}${d.target_minutes ? ` / ${formatMinutes(d.target_minutes)}` : ''}`}
            />
            <Stat label="Hours planned" value={formatMinutes(s.minutes_planned)} />
            <Stat
              label="Last session"
              value={
                s.last_session
                  ? `${formatWeekday(s.last_session)} ${formatDayMonth(s.last_session)}`
                  : '—'
              }
            />
            <Stat
              label="Next session"
              value={s.next_session ? sessionWhen(s.next_session, tz) : '—'}
            />
            <Stat
              label="Window"
              value={`${formatDayMonth(s.window_from)} – ${formatDayMonth(s.window_to)}`}
            />
          </dl>

          <div className="mt-5 flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-muted">Tags</span>
            {d.tags.length ? (
              d.tags.map((t) => (
                <span key={t.id} className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
                  #{t.name}
                </span>
              ))
            ) : (
              <span className="text-xs text-muted">none: only directly linked items count</span>
            )}
          </div>

          <NotesField key={d.id} id={d.id} initial={d.notes} />

          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => setScheduling(true)} disabled={!day}>
              Schedule a session
            </Button>
            <Button variant="secondary" onClick={() => setEditing(true)} disabled={!day}>
              Edit
            </Button>
            <Button
              variant="ghost"
              className="text-band-not-good"
              disabled={remove.isPending}
              onClick={() => {
                if (!window.confirm(`Delete “${d.title}”? Its sessions stay in your calendar.`))
                  return;
                remove.mutate(d.id, { onSuccess: () => navigate('/deadlines') });
              }}
            >
              Delete
            </Button>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <SessionList title="Upcoming" items={upcoming} timeZone={tz} onOpen={setOpenId} />
          <SessionList title="Past" items={past} timeZone={tz} onOpen={setOpenId} />
          {sessions.length === 0 && (
            <p className="rounded-[var(--radius-card)] bg-surface p-6 text-sm text-muted">
              No sessions yet.{' '}
              {firstTag
                ? `Title a block with #${firstTag} in Google Calendar, or schedule one here.`
                : 'Link events or tasks to it from their sheet.'}
            </p>
          )}
        </div>
      </div>

      {day && (
        <>
          <DeadlineForm open={editing} onOpenChange={setEditing} deadline={d} today={day.today} />
          <Sheet
            open={scheduling}
            onOpenChange={setScheduling}
            title="Schedule a session"
            description={`Add a time to make a Google Calendar event${firstTag ? `; #${firstTag} links it` : ''}.`}
          >
            <QuickAdd
              stacked
              defaultDate={day.today}
              autoFocus
              initialText={firstTag ? `${d.title} #${firstTag} ` : `${d.title} `}
              onDone={() => setScheduling(false)}
            />
          </Sheet>
          <ItemSheet item={open} today={day.today} timeZone={tz} onClose={() => setOpenId(null)} />
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-inner)] bg-surface-2 px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function SessionList({
  title,
  items,
  timeZone,
  onOpen,
}: {
  title: string;
  items: DayItem[];
  timeZone: string;
  onOpen(id: string): void;
}) {
  if (!items.length) return null;
  return (
    <section className="rounded-[var(--radius-card)] bg-surface px-5 pt-4 pb-1">
      <h2 className="text-[17px] text-text">{title}</h2>
      <ul className="mt-1 divide-y divide-rule">
        {items.map((i) => (
          <li key={i.id}>
            <button
              onClick={() => onOpen(i.id)}
              className="flex w-full items-center gap-3 py-2.5 text-left text-sm"
            >
              <span className="w-32 shrink-0 text-xs text-muted tabular-nums">
                {sessionWhen(i, timeZone)}
              </span>
              <span
                className={`min-w-0 flex-1 truncate ${i.status === 'done' ? 'text-muted line-through' : ''}`}
              >
                {i.title}
              </span>
              <span
                className={`text-xs ${i.status === 'missed' ? 'text-band-not-good' : i.status === 'done' ? 'text-band-excellent' : 'text-muted'}`}
              >
                {STATUS_TEXT[i.status] ?? i.status}
                {i.planned_minutes
                  ? ` · ${formatMinutes(i.actual_minutes ?? i.planned_minutes)}`
                  : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NotesField({ id, initial }: { id: string; initial: string }) {
  const update = useUpdateDeadline();
  const [notes, setNotes] = useState(initial);
  return (
    <label className="mt-5 block text-sm">
      <span className="mb-1.5 block text-muted">Notes</span>
      <textarea
        value={notes}
        rows={3}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => notes !== initial && update.mutate({ id, notes })}
        className="w-full rounded-[var(--radius-inner)] bg-surface-2 px-3 py-2"
      />
    </label>
  );
}
