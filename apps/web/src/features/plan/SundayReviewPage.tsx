import { addDays, bandFor, successRate, weekKey } from '@mjolnir/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loading, Notice } from '../../components/ui.tsx';
import { useAreasReport, useMisses } from '../../lib/analytics.ts';
import { useAuth } from '../../lib/auth.ts';
import { BAND_COLOR, BAND_LABEL } from '../../lib/bands.ts';
import { type DayRow, useDay, useDaysRange } from '../../lib/day.ts';
import { useDeadlines } from '../../lib/deadlines.ts';
import { formatDayMonth, formatMinutes, formatWeekday } from '../../lib/format.ts';
import { useAreas, useProfile } from '../../lib/queries.ts';
import { supabase } from '../../lib/supabase.ts';
import { dueText } from '../deadlines/format.ts';

const PROMPTS = [
  'What went well this week?',
  'What got in the way?',
  'What will you change next week?',
];

/**
 * Sunday review (section 5): the week summarised from closed days, with a reflection. It opens on
 * the week ending today, or else the last full week.
 */
export function SundayReviewPage() {
  const { data: day } = useDay();
  const { data: profile } = useProfile();
  const [params, setParams] = useSearchParams();
  if (!day || !profile) return <Loading />;

  const thisWeek = weekKey(day.today, profile.week_start);
  const endsToday = addDays(thisWeek, 6) === day.today;
  const latest = endsToday ? thisWeek : addDays(thisWeek, -7);
  const week = params.get('week') ?? latest;
  const go = (w: string) => setParams(w === latest ? {} : { week: w });

  return (
    <div>
      <h1 className="text-[28px] leading-tight md:text-[32px]">Sunday review</h1>
      <div className="mt-2 flex items-center gap-1 text-sm">
        <button
          onClick={() => go(addDays(week, -7))}
          className="rounded-full px-2.5 py-1 text-faint hover:bg-surface-2 hover:text-text"
          aria-label="Previous week"
        >
          ‹
        </button>
        <span className="font-medium tabular-nums">
          {formatDayMonth(week)} – {formatDayMonth(addDays(week, 6))}
        </span>
        <button
          onClick={() => go(addDays(week, 7))}
          disabled={week >= latest}
          className="rounded-full px-2.5 py-1 text-faint hover:bg-surface-2 hover:text-text disabled:opacity-30"
          aria-label="Next week"
        >
          ›
        </button>
      </div>
      <Review key={week} week={week} today={day.today} streak={day.streak.current} />
    </div>
  );
}

function Review({ week, today, streak }: { week: string; today: string; streak: number }) {
  const end = addDays(week, 6);
  const days = useDaysRange(week, end);
  const areas = useAreasReport(week, end);
  const misses = useMisses(week, end);
  const { data: areaList = [] } = useAreas();
  const { data: deadlines = [] } = useDeadlines();

  if (days.isLoading || areas.isLoading || misses.isLoading) return <Loading />;
  if (!days.data || !areas.data || !misses.data)
    return <Notice tone="error">Could not load this week.</Notice>;

  const rows = days.data.filter((d) => d.date <= today);
  const closed = rows.filter((d) => d.finalized);
  const planned = closed.reduce((n, d) => n + d.planned, 0);
  const done = closed.reduce((n, d) => n + d.done, 0);
  const rate = successRate(done, planned);
  const counted = closed.filter((d) => d.counts).length;
  const ranked = closed.filter((d) => d.planned > 0).sort((a, b) => b.rate - a.rate);
  const best = ranked[0];
  const worst = ranked.length > 1 ? ranked[ranked.length - 1] : undefined;
  const missedPoints = misses.data.slots.reduce((n, s) => n + s.missed, 0);
  const worstSlot = [...misses.data.slots]
    .filter((s) => s.missed > 0)
    .sort((a, b) => b.missed / b.planned - a.missed / a.planned || b.missed - a.missed)[0];
  const areaName = (id: string | null) => areaList.find((a) => a.id === id)?.name ?? 'No area';
  const comingUp = deadlines.filter(
    (d) =>
      !['done', 'dropped'].includes(d.status) && (d.stats.days_left <= 14 || d.warnings.length > 0),
  );
  const notes = rows.filter((d) => d.note?.trim());

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="min-w-0">
        <div className="grid grid-cols-3 gap-3">
          <Tile
            label="Success"
            value={planned ? `${rate}%` : '—'}
            note={planned ? BAND_LABEL[bandFor(rate)] : 'no closed days'}
            color={planned ? BAND_COLOR[bandFor(rate)] : undefined}
          />
          <Tile label="Days counted" value={`${counted} / ${closed.length}`} note="50% or more" />
          <Tile label="Points" value={`${done} / ${planned}`} note={`streak now ${streak}`} />
        </div>

        <ol className="mt-4 grid grid-cols-7 gap-1.5" aria-label="Days">
          {days.data.map((d: DayRow) => (
            <li key={d.date} className="text-center">
              <p className="text-[12px] text-muted">{formatWeekday(d.date)}</p>
              <div
                className="mt-1 h-9 rounded-md"
                title={d.planned ? `${d.rate}%, ${BAND_LABEL[d.band]}` : 'Nothing planned'}
                style={{
                  background:
                    d.date > today || !d.planned ? 'var(--color-surface-2)' : BAND_COLOR[d.band],
                  opacity: d.finalized ? 1 : 0.5,
                }}
              />
              <p className="mt-1 text-[12px] tabular-nums">
                {d.date > today || !d.planned ? '' : `${Math.round(d.rate)}%`}
              </p>
            </li>
          ))}
        </ol>

        <ul className="mt-5 flex flex-col gap-1.5 text-sm">
          {best && (
            <li>
              Best day: <strong>{formatWeekday(best.date)}</strong>, {best.rate}% ({best.done} of{' '}
              {best.planned} points).
            </li>
          )}
          {worst && worst.date !== best?.date && (
            <li>
              Toughest day: <strong>{formatWeekday(worst.date)}</strong>, {worst.rate}%.
            </li>
          )}
          {missedPoints > 0 && (
            <li>
              {missedPoints} point{missedPoints === 1 ? '' : 's'} of blocks missed
              {worstSlot &&
                `; most often around ${String(worstSlot.hour).padStart(2, '0')}:00 on ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][worstSlot.weekday - 1]}`}
              .
            </li>
          )}
          {misses.data.estimate.ratio !== null && (
            <li>
              Tasks took {Math.round(misses.data.estimate.ratio * 100)}% of their planned time.
            </li>
          )}
        </ul>

        {areas.data.areas.length > 0 && (
          <Section title="By area">
            <ul className="divide-y divide-rule text-sm">
              {areas.data.areas.map((a) => (
                <li key={a.area_id ?? 'none'} className="flex items-center gap-3 py-2">
                  <span className="flex-1">{areaName(a.area_id)}</span>
                  <span className="text-muted tabular-nums">
                    {a.done} / {a.planned} points
                  </span>
                  <span className="w-16 text-right text-xs text-muted tabular-nums">
                    {formatMinutes(a.minutes_done)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {areas.data.tags.length > 0 && (
          <Section title="Time by tag">
            <p className="text-sm">
              {areas.data.tags
                .slice(0, 5)
                .map((t) => `#${t.name} ${formatMinutes(t.minutes_done)}`)
                .join(' · ')}
            </p>
          </Section>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-6">
        {comingUp.length > 0 && (
          <Section title="Deadlines coming up">
            <ul className="divide-y divide-rule text-sm">
              {comingUp.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2">
                  <Link
                    to={`/deadlines/${d.id}`}
                    className="min-w-0 flex-1 truncate hover:text-bone"
                  >
                    {d.title}
                  </Link>
                  <span className="text-xs text-muted">{dueText(d)}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {notes.length > 0 && (
          <Section title="Your notes">
            <ul className="flex flex-col gap-2 text-sm">
              {notes.map((d) => (
                <li key={d.date}>
                  <span className="text-xs text-muted">{formatWeekday(d.date)}</span>{' '}
                  <span className="whitespace-pre-wrap">{d.note}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Reflection week={week} />
      </div>
    </div>
  );
}

function Reflection({ week }: { week: string }) {
  const qc = useQueryClient();
  const userId = useAuth((s) => s.session?.user.id);
  const { data, isLoading } = useQuery({
    queryKey: ['weekly_note', week],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_notes')
        .select('body')
        .eq('week_start', week)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data?.body ?? '';
    },
  });
  if (isLoading || data === undefined) return null;
  return (
    <ReflectionField
      initial={data}
      onSave={async (body) => {
        const { error } = await supabase
          .from('weekly_notes')
          .upsert({ user_id: userId!, week_start: week, body });
        if (error) throw new Error(error.message);
        qc.setQueryData(['weekly_note', week], body);
      }}
    />
  );
}

function ReflectionField({
  initial,
  onSave,
}: {
  initial: string;
  onSave(body: string): Promise<void>;
}) {
  const [body, setBody] = useState(initial);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  return (
    <Section title="Reflection">
      <ul className="mb-2 list-disc pl-5 text-sm text-muted">
        {PROMPTS.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <textarea
        value={body}
        rows={6}
        aria-label="Reflection"
        onChange={(e) => setBody(e.target.value)}
        onBlur={() => {
          if (body === initial) return;
          setState('saving');
          onSave(body).then(
            () => setState('saved'),
            () => setState('error'),
          );
        }}
        className="w-full rounded-[var(--radius-inner)] bg-surface-2 px-3 py-2 text-sm"
      />
      <p className="mt-1 h-4 text-xs text-muted" role="status">
        {state === 'saving'
          ? 'Saving…'
          : state === 'saved'
            ? 'Saved'
            : state === 'error'
              ? 'Could not save. Try again.'
              : ''}
      </p>
    </Section>
  );
}

function Tile({
  label,
  value,
  note,
  color,
}: {
  label: string;
  value: string;
  note: string;
  color?: string;
}) {
  return (
    <div className="rounded-[var(--radius-card)] bg-surface px-3 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-display text-[24px] tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs" style={{ color: color ?? 'var(--color-muted)' }}>
        {note}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-[var(--radius-card)] bg-surface px-5 py-4 first:mt-0">
      <h2 className="mb-2 text-[17px] text-text">{title}</h2>
      {children}
    </section>
  );
}
