import { wallClock, zonedInstant } from '@mjolnir/domain';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DayItem } from '../../lib/day.ts';
import { formatTime } from '../../lib/format.ts';
import { eventColor, textOn } from '../../lib/googleColors.ts';
import { layoutDay, type Segment, snapMinutes } from './layout.ts';

/** Pixels per hour. */
export const HOUR = 48;
const MINUTE_PX = HOUR / 60;

interface Props {
  days: string[];
  items: DayItem[];
  /** All-day events, tasks and habits per date, shown above the grid. */
  allDay: Map<string, DayItem[]>;
  timeZone: string;
  /** Today's local calendar date (for the header and the now line). */
  todayDate: string;
  now: number;
  onCreate(start: Date, end: Date): void;
  onOpen(item: DayItem): void;
  onMove(item: DayItem, start: Date, end: Date): void;
  onOpenDay(date: string): void;
}

interface CreateDraft {
  dayIndex: number;
  from: number;
  to: number;
}

interface MoveDraft {
  item: DayItem;
  seg: Segment<DayItem>;
  dayIndex: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  moved: boolean;
}

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' });

function canMove(item: DayItem): boolean {
  return (
    item.source === 'calendar' &&
    item.google_event_id !== null &&
    !item.finalized &&
    item.status !== 'deleted'
  );
}

function instantAt(date: string, minutes: number, timeZone: string): Date {
  return zonedInstant(date, Math.floor(minutes / 60), minutes % 60, timeZone);
}

/** Day and Week views: a 24-hour grid, Google Calendar style. */
export function TimeGrid({
  days,
  items,
  allDay,
  timeZone,
  todayDate,
  now,
  onCreate,
  onOpen,
  onMove,
  onOpenDay,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const columns = useRef<HTMLDivElement>(null);
  const [create, setCreate] = useState<CreateDraft | null>(null);
  const [move, setMove] = useState<MoveDraft | null>(null);

  const segments = useMemo(
    () => days.map((d) => layoutDay(items, d, timeZone)),
    [days, items, timeZone],
  );
  const nowClock = wallClock(new Date(now), timeZone);
  const nowMinutes = nowClock.hour * 60 + nowClock.minute;
  const todayIndex = days.indexOf(todayDate);

  // Open scrolled to an hour before now (or 7:00), like Google Calendar.
  useLayoutEffect(() => {
    const target = todayIndex >= 0 ? Math.max(nowMinutes - 60, 0) : 7 * 60;
    scroller.current?.scrollTo({ top: target * MINUTE_PX });
    // Only when the visible days change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.join()]);

  useEffect(() => {
    const cancel = (e: KeyboardEvent) => e.key === 'Escape' && (setCreate(null), setMove(null));
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, []);

  function minutesAt(clientY: number): number {
    const rect = columns.current!.getBoundingClientRect();
    return Math.min(24 * 60, Math.max(0, snapMinutes((clientY - rect.top) / MINUTE_PX)));
  }

  function dayIndexAt(clientX: number): number {
    const rect = columns.current!.getBoundingClientRect();
    return Math.min(
      days.length - 1,
      Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * days.length)),
    );
  }

  // Creating: drag on empty space (mouse and pen), or tap (touch, which needs to scroll).
  function startCreate(e: React.PointerEvent, dayIndex: number) {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    const m = minutesAt(e.clientY);
    if (e.pointerType === 'touch') {
      const startY = e.clientY;
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointerup', up);
        if (Math.abs(ev.clientY - startY) < 8) {
          const from = Math.floor(m / 30) * 30;
          onCreate(
            instantAt(days[dayIndex]!, from, timeZone),
            instantAt(days[dayIndex]!, Math.min(from + 60, 1440), timeZone),
          );
        }
      };
      window.addEventListener('pointerup', up);
      return;
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setCreate({ dayIndex, from: m, to: m });
  }

  function finishCreate() {
    if (!create) return;
    const a = Math.min(create.from, create.to);
    let b = Math.max(create.from, create.to);
    if (b - a < 30) b = Math.min(a + 60, 1440); // a click makes a one-hour block
    const date = days[create.dayIndex]!;
    setCreate(null);
    onCreate(instantAt(date, a, timeZone), instantAt(date, b, timeZone));
  }

  // Moving: drag a block with a mouse; a click (no movement) opens it.
  function startMove(e: React.PointerEvent, seg: Segment<DayItem>, dayIndex: number) {
    e.stopPropagation();
    if (e.pointerType === 'touch' || !canMove(seg.item) || e.button !== 0) {
      return;
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setMove({
      item: seg.item,
      seg,
      dayIndex,
      x: e.clientX,
      y: e.clientY,
      dx: 0,
      dy: 0,
      moved: false,
    });
  }

  function finishMove() {
    if (!move) return;
    const m = move;
    setMove(null);
    if (!m.moved) return onOpen(m.item);
    const dayShift = dayIndexAt(m.x + m.dx) - m.dayIndex;
    const minuteShift = snapMinutes(m.dy / MINUTE_PX);
    const shift = (dayShift * 1440 + minuteShift) * 60_000;
    if (shift === 0) return;
    onMove(
      m.item,
      new Date(Date.parse(m.item.start_at!) + shift),
      new Date(Date.parse(m.item.end_at!) + shift),
    );
  }

  const cols = `3.5rem repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Day headers */}
      <div className="grid border-b border-border" style={{ gridTemplateColumns: cols }}>
        <div />
        {days.map((d) => {
          const isToday = d === todayDate;
          return (
            <button
              key={d}
              onClick={() => onOpenDay(d)}
              className="flex flex-col items-center py-2 hover:bg-surface-2/50"
            >
              <span
                className={`text-[11px] font-medium tracking-wide uppercase ${isToday ? 'text-accent' : 'text-muted'}`}
              >
                {WEEKDAY.format(new Date(`${d}T12:00:00Z`))}
              </span>
              <span
                className={`mt-0.5 flex size-9 items-center justify-center rounded-full text-lg tabular-nums ${
                  isToday ? 'bg-accent font-semibold text-bg' : ''
                }`}
              >
                {Number(d.slice(8))}
              </span>
            </button>
          );
        })}
      </div>

      {/* All-day row: all-day events, and tasks and habits for the day */}
      <div className="grid border-b border-border" style={{ gridTemplateColumns: cols }}>
        <div className="self-center pr-2 text-right text-[10px] text-muted">all day</div>
        {days.map((d) => {
          const list = allDay.get(d) ?? [];
          const events = list.filter((i) => i.source === 'calendar');
          const checks = list.filter((i) => i.source !== 'calendar');
          const open = checks.filter((i) => i.status === 'pending').length;
          return (
            <div key={d} className="flex min-h-8 flex-col gap-0.5 border-l border-border p-0.5">
              {events.map((i) => {
                const bg = eventColor(i.color_key, i.calendar_color);
                return (
                  <button
                    key={i.id}
                    onClick={() => onOpen(i)}
                    className="truncate rounded px-1.5 py-0.5 text-left text-xs"
                    style={{ backgroundColor: bg, color: textOn(bg) }}
                  >
                    {i.title}
                  </button>
                );
              })}
              {checks.length > 0 && (
                <button
                  onClick={() => onOpenDay(d)}
                  className="truncate rounded bg-surface-2 px-1.5 py-0.5 text-left text-xs text-text"
                  title="Tasks and habits for this day"
                >
                  {open ? `${open} open task${open === 1 ? '' : 's'}` : `${checks.length} done ✓`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* The 24-hour grid */}
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div className="relative grid" style={{ gridTemplateColumns: cols, height: 24 * HOUR }}>
          <div className="relative">
            {Array.from({ length: 23 }, (_, h) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[10px] text-muted tabular-nums"
                style={{ top: (h + 1) * HOUR }}
              >
                {String(h + 1).padStart(2, '0')}:00
              </span>
            ))}
          </div>

          <div
            ref={columns}
            className="relative grid"
            style={{
              gridColumn: '2 / -1',
              gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
            }}
          >
            {days.map((d, dayIndex) => (
              <div
                key={d}
                className="relative cursor-cell border-l border-border select-none"
                style={{
                  backgroundImage: `repeating-linear-gradient(to bottom, var(--color-border) 0 1px, transparent 1px ${HOUR}px)`,
                  touchAction: 'pan-y',
                }}
                onPointerDown={(e) => startCreate(e, dayIndex)}
                onPointerMove={(e) => create && setCreate({ ...create, to: minutesAt(e.clientY) })}
                onPointerUp={finishCreate}
              >
                {segments[dayIndex]!.map((seg) => {
                  const i = seg.item;
                  const bg = eventColor(i.color_key, i.calendar_color);
                  const dragging = move?.item.id === i.id && move.moved;
                  const short = seg.height < 40;
                  return (
                    <button
                      key={i.id}
                      type="button"
                      onPointerDown={(e) => startMove(e, seg, dayIndex)}
                      onPointerMove={(e) =>
                        move &&
                        setMove({
                          ...move,
                          dx: e.clientX - move.x,
                          dy: e.clientY - move.y,
                          moved:
                            move.moved || Math.hypot(e.clientX - move.x, e.clientY - move.y) > 4,
                        })
                      }
                      onPointerUp={(e) => {
                        e.stopPropagation();
                        if (move) finishMove();
                        else onOpen(i);
                      }}
                      className={`absolute overflow-hidden rounded-md px-1.5 text-left text-xs leading-tight shadow-sm ring-1 ring-bg/60 ${
                        canMove(i) ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                      } ${i.status === 'done' ? 'opacity-70' : ''} ${i.status === 'missed' ? 'opacity-50' : ''} ${
                        dragging ? 'z-20 opacity-90 shadow-lg' : 'z-10'
                      }`}
                      style={{
                        top: seg.top * MINUTE_PX + 1,
                        height: seg.height * MINUTE_PX - 2,
                        left: `calc(${(seg.lane / seg.lanes) * 100}% + 1px)`,
                        width: `calc(${100 / seg.lanes}% - 3px)`,
                        backgroundColor: bg,
                        color: textOn(bg),
                        transform: dragging
                          ? `translate(${move!.dx}px, ${snapMinutes(move!.dy / MINUTE_PX) * MINUTE_PX}px)`
                          : undefined,
                      }}
                      title={`${i.title} · ${formatTime(i.start_at!, timeZone)}–${formatTime(i.end_at!, timeZone)}`}
                    >
                      <span
                        className={`font-medium ${i.status === 'done' ? 'line-through' : ''} ${short ? 'inline' : 'block truncate pt-0.5'}`}
                      >
                        {i.status === 'done' && '✓ '}
                        {i.title || '(no title)'}
                      </span>
                      <span className={short ? 'ml-1 opacity-80' : 'block opacity-80'}>
                        {short
                          ? formatTime(i.start_at!, timeZone)
                          : `${formatTime(i.start_at!, timeZone)} – ${formatTime(i.end_at!, timeZone)}`}
                        {i.status === 'missed' && ' · missed'}
                      </span>
                    </button>
                  );
                })}

                {create && create.dayIndex === dayIndex && (
                  <div
                    className="pointer-events-none absolute inset-x-0.5 z-20 rounded-md bg-accent/70 px-1.5 py-0.5 text-xs font-medium text-bg"
                    style={{
                      top: Math.min(create.from, create.to) * MINUTE_PX,
                      height: Math.max(Math.abs(create.to - create.from), 15) * MINUTE_PX,
                    }}
                  >
                    New event
                  </div>
                )}

                {dayIndex === todayIndex && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-30"
                    style={{ top: nowMinutes * MINUTE_PX }}
                  >
                    <div className="absolute -top-[5px] -left-[5px] size-2.5 rounded-full bg-band-not-good" />
                    <div className="h-0.5 bg-band-not-good" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
