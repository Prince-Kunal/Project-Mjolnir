// Shared vocabulary from the plan's glossary and section 3.
// No I/O lives in this package: every rule is a pure function over these types.

export type Points = 0 | 1 | 2 | 3;

export type ItemSource = 'calendar' | 'gtask' | 'manual' | 'habit';

export type ItemStatus = 'pending' | 'done' | 'missed' | 'deleted' | 'ignored';

export type MissReason = 'day_close' | 'moved_after_start';

export type InboxState = 'none' | 'open' | 'dismissed' | 'rescheduled';

export type Band = 'excellent' | 'good' | 'fair' | 'not_good';

export type MoveClass = 'same_day' | 'plain_move' | 'miss_and_recreate';

/** ISO calendar date, `YYYY-MM-DD`, in the user's logical-day frame. */
export type LogicalDate = string;

/** `'default'` (event has no `colorId`) or Google's colour ids `'1'`..`'11'`. */
export type ColorKey = 'default' | `${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11}`;

export type DeadlineStatus = 'on_track' | 'needs_attention' | 'urgent' | 'done' | 'dropped';
