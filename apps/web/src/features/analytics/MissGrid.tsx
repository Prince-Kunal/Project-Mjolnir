import type { MissesReport } from '../../lib/analytics.ts';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pad = (h: number) => String(h).padStart(2, '0');

/**
 * Weekday by start hour (section 12): one hue, darker = more of the planned points missed.
 * Each cell names its numbers on hover and to screen readers.
 */
export function MissGrid({ slots }: { slots: MissesReport['slots'] }) {
  const hours = slots.map((s) => s.hour);
  const first = Math.min(...hours);
  const last = Math.max(...hours);
  const cols = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const at = (d: number, h: number) => slots.find((s) => s.weekday === d && s.hour === h);

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-[10px]">
        <thead>
          <tr>
            <th />
            {cols.map((h) => (
              <th key={h} className="w-6 font-normal text-muted tabular-nums">
                {h % 3 === 0 || cols.length < 9 ? pad(h) : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day, i) => (
            <tr key={day}>
              <th className="pr-1.5 text-left font-normal text-muted">{day}</th>
              {cols.map((h) => {
                const s = at(i + 1, h);
                const rate = s && s.planned > 0 ? s.missed / s.planned : null;
                const label = s
                  ? `${day} ${pad(h)}:00 · ${s.missed} of ${s.planned} points missed (${Math.round((rate ?? 0) * 100)}%)`
                  : `${day} ${pad(h)}:00 · nothing planned`;
                return (
                  <td
                    key={h}
                    title={label}
                    aria-label={label}
                    className="h-6 w-6 rounded-[3px]"
                    style={{
                      background:
                        rate === null
                          ? 'var(--color-surface-2)'
                          : `color-mix(in oklab, var(--color-band-not-good) ${Math.round(15 + rate * 85)}%, var(--color-surface-2))`,
                    }}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted">
        <span>0%</span>
        {[0, 0.25, 0.5, 0.75, 1].map((r) => (
          <span
            key={r}
            className="size-3 rounded-[3px]"
            style={{
              background: `color-mix(in oklab, var(--color-band-not-good) ${Math.round(15 + r * 85)}%, var(--color-surface-2))`,
            }}
            aria-hidden
          />
        ))}
        <span>100% missed</span>
      </div>
    </div>
  );
}
