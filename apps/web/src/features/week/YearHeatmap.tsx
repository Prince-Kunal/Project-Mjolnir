import { addDays, type Band } from '@mjolnir/domain';
import { useEffect, useRef } from 'react';
import { useHeatmap } from '../../lib/analytics.ts';
import { BAND_COLOR, BAND_LABEL } from '../../lib/bands.ts';
import { formatDayMonth, formatWeekday } from '../../lib/format.ts';

const BANDS: Band[] = ['not_good', 'fair', 'good', 'excellent'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Screen 5: every day of the year coloured by band, one column per week (Monday first). */
export function YearHeatmap({ year }: { year: number }) {
  const { data } = useHeatmap(year);
  const scroller = useRef<HTMLDivElement>(null);
  // On narrow screens, open at the latest days rather than January.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [data]);
  const byDate = new Map((data ?? []).map((d) => [d.date, d]));
  const jan1 = `${year}-01-01`;
  const offset = (new Date(`${jan1}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const first = addDays(jan1, -offset);
  const weeks = Math.ceil((offset + (year % 4 === 0 ? 366 : 365)) / 7);

  return (
    <section className="mt-6" aria-label={`Days of ${year} by band`}>
      <div ref={scroller} className="overflow-x-auto pb-1">
        <div className="relative mb-1 h-4 text-[12px] text-muted" aria-hidden>
          {MONTHS.map((m, i) => {
            const day = Math.round(
              (Date.parse(`${year}-${String(i + 1).padStart(2, '0')}-01`) - Date.parse(jan1)) /
                86_400_000,
            );
            return (
              <span
                key={m}
                className="absolute"
                style={{ left: Math.floor((offset + day) / 7) * 14 }}
              >
                {m}
              </span>
            );
          })}
        </div>
        <div
          className="grid grid-flow-col gap-[3px]"
          style={{ gridTemplateRows: 'repeat(7, 11px)', gridAutoColumns: '11px' }}
        >
          {Array.from({ length: weeks * 7 }, (_, i) => {
            const date = addDays(first, i);
            if (!date.startsWith(String(year))) return <span key={date} />;
            const d = byDate.get(date);
            const label = d
              ? `${formatWeekday(date)} ${formatDayMonth(date)}: ${d.rate}%, ${BAND_LABEL[d.band]}`
              : `${formatWeekday(date)} ${formatDayMonth(date)}: not closed`;
            return (
              <span
                key={date}
                title={label}
                aria-label={label}
                className="rounded-[2px]"
                style={{ background: d ? BAND_COLOR[d.band] : 'var(--color-surface-2)' }}
              />
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
        {BANDS.map((b) => (
          <span key={b} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px]" style={{ background: BAND_COLOR[b] }} />
            {BAND_LABEL[b]}
          </span>
        ))}
      </div>
    </section>
  );
}
