import type { DayItem } from '../../lib/day.ts';
import { formatTime } from '../../lib/format.ts';
import { eventColor } from '../../lib/googleColors.ts';

/** Points as one to three staves, cut like the strokes of a rune: ᛁ ᛁᛁ ᛁᛁᛁ. */
export function PointDots({ points }: { points: number }) {
  return (
    <span
      className="flex h-4 shrink-0 items-end gap-[3px]"
      aria-label={`${points} point${points === 1 ? '' : 's'}`}
      role="img"
    >
      {[1, 2, 3].map((p) => (
        <span
          key={p}
          className={`w-[3px] rounded-full ${p <= points ? 'bg-text' : 'bg-active'}`}
          style={{ height: 8 + p * 2.5 }}
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

/**
 * One block, task or habit: its time on the left edge, the Google colour that set its points, the
 * box, the title with its tags, and the points as staves.
 */
export function ItemRow({ item, timeZone, isToday, now, onToggle, onOpen }: Props) {
  const done = item.status === 'done';
  const missed = item.status === 'missed';
  const locked = item.finalized;
  const overdue =
    isToday && item.status === 'pending' && item.end_at !== null && Date.parse(item.end_at) < now;
  const timed = item.start_at && !item.is_all_day && item.source === 'calendar';
  const start = timed ? formatTime(item.start_at!, timeZone) : null;
  const end = timed && item.end_at ? formatTime(item.end_at, timeZone) : null;
  const colour =
    item.source === 'calendar' ? eventColor(item.color_key, item.calendar_color) : null;

  return (
    <li className="group flex items-center gap-3 py-3 md:gap-4">
      <span className="hidden w-[52px] shrink-0 text-right leading-tight tabular-nums md:block">
        {start && (
          <>
            <span className="block text-[15px] text-muted">{start}</span>
            <span className="block text-[13px] text-faint">{end}</span>
          </>
        )}
      </span>
      <span
        className="h-9 w-1 shrink-0 rounded-full"
        style={{ background: colour ?? 'var(--color-active)' }}
        aria-hidden
      />
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`${done ? 'Untick' : 'Tick'} ${item.title}`}
        disabled={locked}
        onClick={() => onToggle(item)}
        className={`flex size-[26px] shrink-0 items-center justify-center rounded-[8px] border-2 transition duration-150 active:scale-90 ${
          done
            ? 'border-text text-text'
            : missed
              ? 'border-band-not-good/70'
              : 'border-border hover:border-muted'
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {done && (
          <svg viewBox="0 0 16 16" className="mj-rise size-4" aria-hidden>
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
        <span
          className={`block truncate text-[17px] leading-snug transition-colors ${done ? 'text-faint line-through decoration-faint/60' : 'group-hover:text-bone'}`}
        >
          {item.title || 'Untitled'}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[14px] text-faint">
          {start && (
            <span className="tabular-nums md:hidden">
              {start}–{end}
            </span>
          )}
          {overdue && <span className="text-band-fair">Overdue</span>}
          {missed && <span className="text-band-not-good">Missed</span>}
          {item.marked_late && <span>Marked late</span>}
          {item.tags.map((t) => (
            <span key={t.id}>#{t.name}</span>
          ))}
        </span>
      </button>

      <PointDots points={item.points} />
    </li>
  );
}
