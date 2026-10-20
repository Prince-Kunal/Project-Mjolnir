import { streakAtRisk } from '@mjolnir/domain';
import type { StreakInfo } from '../../lib/day.ts';
import { formatWeekday } from '../../lib/format.ts';

/** Streak count, this week's rest pass, and the at-risk warning (3.7). */
export function StreakLine({
  streak,
  todayRate,
  isToday,
}: {
  streak: StreakInfo;
  todayRate: number;
  isToday: boolean;
}) {
  const passUsed = streak.pass_used_on !== null;
  const atRisk =
    isToday && streak.current > 0 && streakAtRisk({ todayRate, passUsedThisWeek: passUsed });
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-1 text-xs text-muted">
      <span>
        Streak <span className="font-semibold text-text tabular-nums">{streak.current}</span>
        {streak.best > streak.current && <span> · best {streak.best}</span>}
      </span>
      <span>
        Rest pass {passUsed ? `used ${formatWeekday(streak.pass_used_on!)}` : 'available'}
      </span>
      {atRisk && <span className="font-medium text-band-fair">Streak at risk</span>}
    </p>
  );
}
