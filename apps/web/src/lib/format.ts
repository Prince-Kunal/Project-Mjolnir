// Times shown in the user's own timezone (profile), not the browser's.

const cache = new Map<string, Intl.DateTimeFormat>();

function fmt(timeZone: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = timeZone + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(undefined, { timeZone, ...opts });
    cache.set(key, f);
  }
  return f;
}

export function formatTime(iso: string, timeZone: string): string {
  return fmt(timeZone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(iso),
  );
}

/** A logical date such as 2026-10-20 as "Tuesday, 20 October". */
export function formatDay(date: string): string {
  return fmt('UTC', { weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/** Link to the event in Google Calendar: `eid` is base64 of "eventId calendarId". */
export function googleEventUrl(eventId: string, calendarId: string): string {
  const eid = btoa(`${eventId} ${calendarId}`).replace(/=+$/, '');
  return `https://calendar.google.com/calendar/event?eid=${eid}`;
}

/** "Wed 22 Oct" for an instant, in the user's timezone. */
export function formatShortDay(iso: string, timeZone: string): string {
  return fmt(timeZone, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso));
}

/** "Wed" for a logical date. */
export function formatWeekday(date: string): string {
  return fmt('UTC', { weekday: 'short' }).format(new Date(`${date}T12:00:00Z`));
}

/** "22 Oct" for a logical date. */
export function formatDayMonth(date: string): string {
  return fmt('UTC', { day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00Z`));
}
