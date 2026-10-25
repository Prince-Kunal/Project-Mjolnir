import { addDays, bandFor, successRate, weekKey } from '@mjolnir/domain';
import { Link, useSearchParams } from 'react-router-dom';
import { Loading, Notice } from '../../components/ui.tsx';
import { BAND_COLOR, BAND_LABEL } from '../../lib/bands.ts';
import { YearHeatmap } from './YearHeatmap.tsx';
import { type DayRow, type MonthRow, useDay, useDaysRange, useMonths } from '../../lib/day.ts';
import { formatDayMonth, formatWeekday } from '../../lib/format.ts';
import { useProfile } from '../../lib/queries.ts';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function Arrow({ dir, onClick, label }: { dir: 'left' | 'right'; onClick(): void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="rounded-full p-2 text-faint hover:bg-surface-2 hover:text-text"
    >
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
        <path
          d={dir === 'left' ? 'M10 3L5 8l5 5' : 'M6 3l5 5-5 5'}
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

function BandChip({ band, muted }: { band: DayRow['band']; muted?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${muted ? 'opacity-60' : ''}`}>
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: BAND_COLOR[band] }}
        aria-hidden
      />
      {BAND_LABEL[band]}
    </span>
  );
}

/** Counted, rest pass, or broke (section 11, screen 4). Open days are not judged yet. */
function streakStatus(d: DayRow, today: string): { label: string; tone: string } {
  if (!d.finalized) return { label: d.date === today ? 'Today' : '—', tone: 'text-muted' };
  if (d.counts) return { label: `Counted · ${d.streak_after}`, tone: 'text-band-excellent' };
  if (d.rest_pass_used) return { label: 'Rest pass', tone: 'text-band-fair' };
  return { label: 'Broke', tone: 'text-band-not-good' };
}

export function WeekPage() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'months' ? 'months' : 'week';
  const { data: day } = useDay();
  const { data: profile } = useProfile();

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[28px] leading-tight md:text-[32px]">
          {view === 'week' ? 'Week' : 'Months'}
        </h1>
        <div
          role="radiogroup"
          aria-label="Table"
          className="flex rounded-full bg-surface-2 p-1 text-sm"
        >
          {(['week', 'months'] as const).map((v) => (
            <button
              key={v}
              role="radio"
              aria-checked={view === v}
              onClick={() => setParams(v === 'week' ? {} : { view: v })}
              className={`rounded-md px-2.5 py-1 capitalize ${view === v ? 'bg-text font-medium text-bg' : 'text-muted'}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      {!day || !profile ? (
        <Loading />
      ) : view === 'week' ? (
        <WeekTable today={day.today} weekStart={profile.week_start} />
      ) : (
        <MonthsTable today={day.today} />
      )}
    </div>
  );
}

function WeekTable({ today, weekStart }: { today: string; weekStart: number }) {
  const [params, setParams] = useSearchParams();
  const start = params.get('week') ?? weekKey(today, weekStart);
  const end = addDays(start, 6);
  const { data: days, isLoading, error } = useDaysRange(start, end);

  const closed = days?.filter((d) => d.finalized) ?? [];
  const planned = closed.reduce((s, d) => s + d.planned, 0);
  const done = closed.reduce((s, d) => s + d.done, 0);
  const weekRate = successRate(done, planned);
  const counted = closed.filter((d) => d.counts).length;
  const go = (d: string) => setParams(d === weekKey(today, weekStart) ? {} : { week: d });

  return (
    <>
      <div className="mt-4 flex items-center gap-1">
        <Arrow dir="left" label="Previous week" onClick={() => go(addDays(start, -7))} />
        <p className="text-sm font-medium">
          {formatDayMonth(start)} – {formatDayMonth(end)}
        </p>
        <Arrow dir="right" label="Next week" onClick={() => go(addDays(start, 7))} />
      </div>

      {isLoading ? (
        <Loading />
      ) : error || !days ? (
        <Notice tone="error">Could not load this week.</Notice>
      ) : (
        <>
          <table className="mt-4 w-full text-sm">
            <thead className="hidden text-left text-xs text-muted sm:table-header-group">
              <tr className="border-b border-rule">
                <th className="py-2 font-medium">Day</th>
                <th className="py-2 font-medium">Points</th>
                <th className="py-2 font-medium">Success</th>
                <th className="py-2 font-medium">Streak</th>
                <th className="py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {days.map((d) => {
                const status = streakStatus(d, today);
                const empty = !d.finalized && d.planned === 0;
                return (
                  <tr
                    key={d.date}
                    className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 py-3 sm:table-row"
                  >
                    <td className="sm:py-2.5">
                      <Link to={`/?date=${d.date}`} className="font-medium hover:text-bone">
                        {formatWeekday(d.date)}{' '}
                        <span className="text-muted">{formatDayMonth(d.date)}</span>
                      </Link>
                    </td>
                    <td className="text-right tabular-nums sm:py-2.5 sm:text-left">
                      {empty ? <span className="text-muted">—</span> : `${d.done} / ${d.planned}`}
                    </td>
                    <td className="sm:py-2.5">
                      {empty ? (
                        <span className="text-xs text-muted">Nothing planned</span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums">{d.rate}%</span>
                          <BandChip band={d.band} muted={!d.finalized} />
                        </span>
                      )}
                    </td>
                    <td className={`text-right text-xs sm:py-2.5 sm:text-left ${status.tone}`}>
                      {status.label}
                    </td>
                    <td className="col-span-2 text-xs text-muted sm:max-w-56 sm:truncate sm:py-2.5">
                      {d.note}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] bg-surface px-4 py-3 text-sm">
            <span>
              Week <span className="font-semibold tabular-nums">{weekRate}%</span>
              {planned > 0 && (
                <span className="ml-2">
                  <BandChip band={bandFor(weekRate)} />
                </span>
              )}
            </span>
            <span className="text-muted">
              {done} / {planned} points · {counted} of {closed.length} closed days counted
            </span>
          </div>
        </>
      )}
    </>
  );
}

function MonthsTable({ today }: { today: string }) {
  const [params, setParams] = useSearchParams();
  const thisYear = Number(today.slice(0, 4));
  const year = Number(params.get('year') ?? thisYear);
  const { data: months, isLoading, error } = useMonths(year);
  const byMonth = new Map<number, MonthRow>((months ?? []).map((m) => [m.month, m]));
  const go = (y: number) =>
    setParams(y === thisYear ? { view: 'months' } : { view: 'months', year: String(y) });

  return (
    <>
      <div className="mt-4 flex items-center gap-1">
        <Arrow dir="left" label="Previous year" onClick={() => go(year - 1)} />
        <p className="text-sm font-medium tabular-nums">{year}</p>
        <Arrow dir="right" label="Next year" onClick={() => go(year + 1)} />
      </div>
      <YearHeatmap year={year} />
      {isLoading ? (
        <Loading />
      ) : error ? (
        <Notice tone="error">Could not load this year.</Notice>
      ) : !months?.length ? (
        <p className="mt-6 rounded-[var(--radius-card)] bg-surface p-6 text-center text-sm text-muted">
          No closed days in {year} yet. Rows appear as days close.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-rule">
                <th className="py-2 font-medium">Month</th>
                <th className="py-2 font-medium">Success</th>
                <th className="py-2 font-medium">Days counted</th>
                <th className="py-2 font-medium">Points done</th>
                <th className="py-2 font-medium">Excellent days</th>
                <th className="py-2 font-medium">Best streak</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule tabular-nums">
              {MONTHS.map((name, i) => {
                const m = byMonth.get(i + 1);
                if (!m) return null;
                return (
                  <tr key={name}>
                    <td className="py-2.5 font-medium">{name}</td>
                    <td className="py-2.5">
                      <span className="flex items-center gap-2">
                        {m.rate}% <BandChip band={bandFor(m.rate)} />
                      </span>
                    </td>
                    <td className="py-2.5">
                      {m.days_counted} / {m.days_closed}
                    </td>
                    <td className="py-2.5">{m.points_done}</td>
                    <td className="py-2.5">{m.excellent_days}</td>
                    <td className="py-2.5">{m.best_streak}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
