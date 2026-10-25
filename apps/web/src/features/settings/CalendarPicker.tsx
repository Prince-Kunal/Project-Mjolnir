import { Card, Loading, Notice } from '../../components/ui.tsx';
import { useCalendars, useSetCalendarSync } from '../../lib/queries.ts';

export function CalendarPicker() {
  const { data: calendars, isLoading, error } = useCalendars();
  const setSync = useSetCalendarSync();

  return (
    <Card
      title="Calendars to sync"
      description="Events on these calendars become tasks. Skip calendars like Birthdays and Holidays."
    >
      {isLoading ? (
        <Loading />
      ) : error ? (
        <Notice tone="error">Could not load calendars.</Notice>
      ) : !calendars?.length ? (
        <p className="text-sm text-muted">No calendars yet. Connect Google Calendar first.</p>
      ) : (
        <ul className="divide-y divide-rule">
          {calendars.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-3 py-2.5">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-accent)]"
                  checked={c.sync_enabled}
                  onChange={(e) => setSync.mutate({ id: c.id, enabled: e.target.checked })}
                />
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: c.color ?? 'var(--color-muted)' }}
                />
                <span className="min-w-0 flex-1 truncate text-sm">{c.summary}</span>
                {c.is_primary && <span className="text-xs text-muted">Primary</span>}
                {c.access_role === 'reader' || c.access_role === 'freeBusyReader' ? (
                  <span className="text-xs text-muted">Read only</span>
                ) : null}
              </label>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
