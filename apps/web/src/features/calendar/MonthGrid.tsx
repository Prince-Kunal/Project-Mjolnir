import { weekDays } from './layout.ts';
import type { DayItem } from '../../lib/day.ts';
import { formatTime } from '../../lib/format.ts';
import { eventColor } from '../../lib/googleColors.ts';

interface Props {
  days: string[];
  /** YYYY-MM of the month shown; days outside it are dimmed. */
  month: string;
  /** Per local date: timed and all-day events, then tasks and habits. */
  byDate: Map<string, DayItem[]>;
  timeZone: string;
  todayDate: string;
  weekStart: number;
  onOpen(item: DayItem): void;
  onOpenDay(date: string): void;
  onCreateOn(date: string): void;
}

const MAX_SHOWN = 3;
const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' });

/** Month view: six weeks, up to three events a day and "N more", Google Calendar style. */
export function MonthGrid({
  days,
  month,
  byDate,
  timeZone,
  todayDate,
  weekStart,
  onOpen,
  onOpenDay,
  onCreateOn,
}: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-7 border-b border-rule">
        {weekDays(days[0]!, weekStart).map((d) => (
          <div key={d} className="py-2 text-center text-[12px] text-muted">
            {WEEKDAY.format(new Date(`${d}T12:00:00Z`))}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {days.map((d) => {
          const list = byDate.get(d) ?? [];
          const events = list.filter((i) => i.source === 'calendar');
          const checks = list.filter((i) => i.source !== 'calendar');
          const open = checks.filter((i) => i.status === 'pending').length;
          const shown = events.slice(0, MAX_SHOWN);
          const more = events.length - shown.length;
          const isToday = d === todayDate;
          return (
            <div
              key={d}
              onClick={(e) => e.target === e.currentTarget && onCreateOn(d)}
              className={`flex min-h-0 cursor-cell flex-col gap-0.5 overflow-hidden border-r border-b border-rule p-1 ${
                d.startsWith(month) ? '' : 'bg-surface/40'
              }`}
            >
              <button
                onClick={() => onOpenDay(d)}
                className={`mx-auto flex size-6 items-center justify-center rounded-full text-xs tabular-nums ${
                  isToday
                    ? 'rounded-full bg-text font-semibold text-bg'
                    : d.startsWith(month)
                      ? 'text-text'
                      : 'text-muted'
                }`}
              >
                {Number(d.slice(8))}
              </button>
              {checks.length > 0 && (
                <button
                  onClick={() => onOpenDay(d)}
                  className="truncate rounded bg-surface-2 px-1 text-left text-[12px]"
                >
                  {open ? `${open} open task${open === 1 ? '' : 's'}` : `${checks.length} done`}
                </button>
              )}
              {shown.map((i) => (
                <button
                  key={i.id}
                  onClick={() => onOpen(i)}
                  className={`flex items-center gap-1 truncate rounded px-1 text-left text-[12px] hover:bg-surface-2 ${
                    i.status === 'done' ? 'line-through opacity-70' : ''
                  }`}
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: eventColor(i.color_key, i.calendar_color) }}
                  />
                  {i.start_at && !i.is_all_day && (
                    <span className="shrink-0 text-muted tabular-nums">
                      {formatTime(i.start_at, timeZone)}
                    </span>
                  )}
                  <span className="truncate">{i.title || '(no title)'}</span>
                </button>
              ))}
              {more > 0 && (
                <button
                  onClick={() => onOpenDay(d)}
                  className="px-1 text-left text-[12px] font-medium text-muted hover:text-text"
                >
                  {more} more
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
