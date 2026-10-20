import type { DayItem } from '../../lib/day.ts';
import { formatTime } from '../../lib/format.ts';

export function PointDots({ points }: { points: number }) {
  return (
    <span
      className="flex gap-0.5"
      aria-label={`${points} point${points === 1 ? '' : 's'}`}
      role="img"
    >
      {[1, 2, 3].map((p) => (
        <span
          key={p}
          className={`size-1.5 rounded-full ${p <= points ? 'bg-accent' : 'bg-surface-2'}`}
        />
      ))}
    </span>
  );
}

interface Props {
  item: DayItem;
  timeZone: string;
  /** True on the current logical day, where past blocks can look overdue. */
  isToday: boolean;
  now: number;
  onToggle(item: DayItem): void;
  onOpen(item: DayItem): void;
}

export function ItemRow({ item, timeZone, isToday, now, onToggle, onOpen }: Props) {
  const done = item.status === 'done';
  const missed = item.status === 'missed';
  const locked = item.finalized;
  const overdue =
    isToday && item.status === 'pending' && item.end_at !== null && Date.parse(item.end_at) < now;
  const time =
    item.start_at && !item.is_all_day && item.source === 'calendar'
      ? `${formatTime(item.start_at, timeZone)}–${item.end_at ? formatTime(item.end_at, timeZone) : ''}`
      : null;

  return (
    <li className="flex items-center gap-3 py-2.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`${done ? 'Untick' : 'Tick'} ${item.title}`}
        disabled={locked}
        onClick={() => onToggle(item)}
        className={`flex size-6 shrink-0 items-center justify-center rounded-md border-2 transition ${
          done
            ? 'border-band-excellent bg-band-excellent text-bg'
            : missed
              ? 'border-band-not-good/60'
              : 'border-muted hover:border-text'
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {done && (
          <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
            <path
              d="M3 8.5l3.2 3L13 4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      <button type="button" onClick={() => onOpen(item)} className="min-w-0 flex-1 text-left">
        <span className={`block truncate text-sm ${done ? 'text-muted line-through' : ''}`}>
          {item.title || 'Untitled'}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {time && <span className="tabular-nums">{time}</span>}
          {overdue && <span className="font-medium text-band-fair">Overdue</span>}
          {missed && <span className="font-medium text-band-not-good">Missed</span>}
          {item.marked_late && <span>Marked late</span>}
          {item.tags.map((t) => (
            <span key={t.id} className="rounded bg-surface-2 px-1.5 py-px">
              #{t.name}
            </span>
          ))}
        </span>
      </button>

      <PointDots points={item.points} />
    </li>
  );
}
