// Section 3.4: what a moved calendar item (or a Google task with a new due date) becomes.
import { logicalDate } from './dayBoundary.ts';
import type { ItemStatus, LogicalDate, MoveClass } from './types.ts';

export interface MovableItem {
  status: ItemStatus;
  /** Current planned start. In Tasks mode, the start of the item's logical day. */
  startAt: Date | string;
  logicalDate: LogicalDate;
}

const ms = (t: Date | string) => (t instanceof Date ? t : new Date(t)).getTime();

/**
 * M1: same logical day → `same_day`.
 * M2: another day, moved before the original start → `plain_move`.
 * M3: another day, moved at or after the original start, not done → `miss_and_recreate`.
 * M4: a done item that is not finalized moves and stays done → `plain_move`.
 * Finalized items never reach this function (plan 8.5 handles them first).
 */
export function classifyMove(
  item: MovableItem,
  newStart: Date | string,
  now: Date | string,
  timeZone: string,
  boundaryHour: number,
): MoveClass {
  if (logicalDate(newStart, timeZone, boundaryHour) === item.logicalDate) return 'same_day';
  // Only an unfinished task can be missed; done and 0-point items simply move.
  if (item.status !== 'pending') return 'plain_move';
  return ms(now) < ms(item.startAt) ? 'plain_move' : 'miss_and_recreate';
}
