// Calendar view geometry: where each timed block sits in a day column, Google Calendar style.
import { addDays, weekKey, zonedInstant } from '@mjolnir/domain';

export interface Timed {
  id: string;
  start_at: string | null;
  end_at: string | null;
}

export interface Segment<T extends Timed> {
  item: T;
  /** Minutes from local midnight. */
  top: number;
  height: number;
  /** The block continues from the previous day or into the next. */
  startsBefore: boolean;
  endsAfter: boolean;
  /** Side-by-side position among overlapping blocks. */
  lane: number;
  lanes: number;
}

const MINUTE = 60_000;
export const MIN_BLOCK_MINUTES = 15;

/** The parts of `items` that fall on local calendar day `date`, laid out in lanes. */
export function layoutDay<T extends Timed>(
  items: T[],
  date: string,
  timeZone: string,
): Segment<T>[] {
  const dayStart = zonedInstant(date, 0, 0, timeZone).getTime();
  const dayEnd = zonedInstant(addDays(date, 1), 0, 0, timeZone).getTime();

  const segs: Segment<T>[] = [];
  for (const item of items) {
    if (!item.start_at || !item.end_at) continue;
    const start = Date.parse(item.start_at);
    const end = Math.max(Date.parse(item.end_at), start + MINUTE);
    if (start >= dayEnd || end <= dayStart) continue;
    const s = Math.max(start, dayStart);
    const e = Math.min(end, dayEnd);
    segs.push({
      item,
      top: (s - dayStart) / MINUTE,
      height: Math.max((e - s) / MINUTE, MIN_BLOCK_MINUTES),
      startsBefore: start < dayStart,
      endsAfter: end > dayEnd,
      lane: 0,
      lanes: 1,
    });
  }

  // Longest first at equal starts, so a long block takes the leftmost lane.
  segs.sort((a, b) => a.top - b.top || b.height - a.height);

  // Clusters of transitively overlapping blocks share a lane count.
  let cluster: Segment<T>[] = [];
  let clusterEnd = -1;
  const laneEnds: number[] = [];
  const close = () => {
    const lanes = Math.max(1, laneEnds.length);
    for (const s of cluster) s.lanes = lanes;
    cluster = [];
    laneEnds.length = 0;
  };
  for (const s of segs) {
    if (s.top >= clusterEnd) close();
    let lane = laneEnds.findIndex((end) => end <= s.top);
    if (lane === -1) lane = laneEnds.push(0) - 1;
    laneEnds[lane] = s.top + s.height;
    s.lane = lane;
    cluster.push(s);
    clusterEnd = Math.max(clusterEnd, s.top + s.height);
  }
  close();
  return segs;
}

export function snapMinutes(minutes: number, step = 15): number {
  return Math.round(minutes / step) * step;
}

/** The 7 dates of the week containing `date`, starting on `weekStart` (ISO weekday). */
export function weekDays(date: string, weekStart: number): string[] {
  const first = weekKey(date, weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/** Six full weeks covering the month of `date`. */
export function monthGrid(date: string, weekStart: number): string[] {
  const first = weekKey(`${date.slice(0, 7)}-01`, weekStart);
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}
