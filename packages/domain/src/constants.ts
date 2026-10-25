// Defaults fixed by section 4 of the plan. Each is also a per-user setting.

/** Decision 1: the logical day starts at 04:00 local time. */
export const DEFAULT_DAY_BOUNDARY_HOUR = 4;

/** Decision 6: weeks run Monday to Sunday (ISO weekday 1). */
export const DEFAULT_WEEK_START = 1;

/** Decision 7: "mark done (forgot to tick)" is allowed this long after day close. */
export const LATE_DONE_WINDOW_HOURS = 48;

/** Section 3.7: a finalized day counts toward the streak at or above this rate. */
export const STREAK_THRESHOLD = 50;

/** Section 3.9: "No sessions scheduled" warning horizon, in days. */
export const DEFAULT_DEADLINE_WARNING_DAYS = 7;

/** Decision 16: a finished day stays open for ticks until this local hour the next day. */
export const DAY_FREEZE_HOUR = 12;
