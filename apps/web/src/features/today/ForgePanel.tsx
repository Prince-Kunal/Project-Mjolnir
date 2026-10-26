import { addDays, type DayScore, streakAtRisk, weekKey } from '@mjolnir/domain';
import { BAND_COLOR, BAND_LABEL } from '../../lib/bands.ts';
import { type StreakInfo, useDaysRange } from '../../lib/day.ts';
import { formatWeekday } from '../../lib/format.ts';
import { nextBand } from './nextBand.ts';
import { ScoreRing } from './ScoreRing.tsx';

/** Runes cut beside a long streak: Thor's own at a week, then victory, then home. */
const MILESTONES = [
  [100, 'ᛟ', 'Othala: a hundred days unbroken'],
  [30, 'ᛏ', 'Tiwaz: a month unbroken'],
  [7, 'ᚦ', 'Thurisaz, Thor’s rune: a week unbroken'],
] as const;

export function ForgePanel({
  score,
  streak,
  date,
  today,
  weekStart,
  live,
  compact = false,
}: {
  score: DayScore;
  streak: StreakInfo;
  date: string;
  today: string;
  weekStart: number;
  live: boolean;
  compact?: boolean;
}) {
  const isToday = date === today;
  const next = nextBand(score);
  const rune = MILESTONES.find(([n]) => streak.current >= n);
  const passUsed = streak.pass_used_on !== null;
  const atRisk =
    isToday &&
    streak.current > 0 &&
    streakAtRisk({ todayRate: score.rate, passUsedThisWeek: passUsed });

  return (
    <section
      aria-label="Score and streak"
      className={`rounded-[var(--radius-card)] bg-surface ${compact ? 'flex items-center gap-5 p-4' : 'p-6'}`}
    >
      <div className={compact ? '' : 'flex justify-center'}>
        <ScoreRing rate={score.rate} band={score.band} size={compact ? 132 : 208} live={live} />
      </div>

      <div className={compact ? 'min-w-0 flex-1' : 'mt-6'}>
        <p className="font-display text-[17px]">
          <span className="text-[22px] tabular-nums">{score.done}</span>
          <span className="text-muted"> of {score.planned} points</span>
        </p>
        <p className="mt-0.5 text-[14px] text-faint">
          {score.planned === 0
            ? 'Nothing planned yet'
            : next
              ? `${next.points} more to ${next.label}`
              : score.band === 'excellent' && score.rate >= 100
                ? 'Every block struck'
                : `${BAND_LABEL[score.band]} reached`}
        </p>

        <div className={`flex items-end justify-between gap-3 ${compact ? 'mt-3' : 'mt-6'}`}>
          <p className="font-display text-[15px] text-muted">
            Streak <span className="text-[22px] text-text tabular-nums">{streak.current}</span>
            {rune && (
              <span
                className="ml-1.5 font-display text-[18px] text-bone"
                title={rune[2]}
                aria-label={rune[2]}
              >
                {rune[1]}
              </span>
            )}
            {!compact && streak.best > streak.current && (
              <span className="text-faint"> · best {streak.best}</span>
            )}
          </p>
          {atRisk && <span className="text-[14px] text-band-fair">At risk today</span>}
        </div>
        {!compact && <WeekMarks date={date} today={today} weekStart={weekStart} live={score} />}
        <p className="mt-3 text-[14px] text-faint">
          {passUsed
            ? `Rest pass used ${formatWeekday(streak.pass_used_on!)}: one slip a week, like Brokkr at the bellows.`
            : 'Rest pass available: one slip a week keeps the streak.'}
        </p>
      </div>
    </section>
  );
}

/**
 * The week of the day being viewed, one mark per day: each day in its band, the viewed day
 * outlined with its live score, a rest-pass day hollow, days still to come empty.
 */
function WeekMarks({
  date: viewed,
  today,
  weekStart,
  live,
}: {
  date: string;
  today: string;
  weekStart: number;
  live: DayScore;
}) {
  const first = weekKey(viewed, weekStart);
  const { data: days = [] } = useDaysRange(first, addDays(first, 6));
  return (
    <ol
      className="mt-4 grid grid-cols-7 gap-1.5"
      aria-label={viewed === today ? 'This week' : 'That week'}
    >
      {Array.from({ length: 7 }, (_, i) => {
        const date = addDays(first, i);
        const d = days.find((x) => x.date === date);
        const isViewed = date === viewed;
        const future = date > today;
        const band = isViewed ? live.band : d?.band;
        const planned = isViewed ? live.planned : (d?.planned ?? 0);
        const color =
          future || !planned ? 'var(--color-surface-2)' : BAND_COLOR[band ?? 'not_good'];
        const label = future
          ? `${formatWeekday(date)}: to come`
          : !planned
            ? `${formatWeekday(date)}: nothing planned`
            : `${formatWeekday(date)}: ${isViewed ? live.rate : d?.rate}%${d?.rest_pass_used ? ', rest pass' : ''}`;
        return (
          <li
            key={date}
            className="flex flex-col items-center gap-1.5"
            title={label}
            aria-label={label}
          >
            {/* Every mark keeps one height so the row stays level; a rest-pass day is hollow. */}
            <span
              className={`h-[18px] w-full rounded-full border-2 ${isViewed ? 'outline-2 outline-offset-2 outline-text' : ''}`}
              style={{
                borderColor: color,
                background: d?.rest_pass_used ? 'transparent' : color,
                opacity: isViewed && !d?.finalized ? 0.85 : 1,
              }}
            />
            <span className={`text-[12px] ${isViewed ? 'text-text' : 'text-faint'}`}>
              {formatWeekday(date).slice(0, 1)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
