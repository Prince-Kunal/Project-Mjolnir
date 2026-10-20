import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Loading, Notice } from '../../components/ui.tsx';
import {
  type MissedItem,
  useBulkMissed,
  useDay,
  useDismissMissed,
  useMarkLateDone,
  useMissedInbox,
} from '../../lib/day.ts';
import { formatDay, formatTime } from '../../lib/format.ts';
import { useProfile } from '../../lib/queries.ts';
import { useToast } from '../../lib/toast.ts';
import { PointDots } from '../today/ItemRow.tsx';
import { RescheduleSheet } from './RescheduleSheet.tsx';

/** Section 11, screen 3: missed tasks with Reschedule, Dismiss and Mark done. */
export function MissedPage() {
  const { data: items, isLoading, error } = useMissedInbox();
  const { data: day } = useDay();
  const { data: profile } = useProfile();
  const dismiss = useDismissMissed();
  const lateDone = useMarkLateDone();
  const bulk = useBulkMissed();
  const toast = useToast((s) => s.show);
  const [open, setOpen] = useState<MissedItem | null>(null);
  const [now] = useState(() => Date.now());

  if (isLoading || !day || !profile) return <Loading />;
  if (error) return <Notice tone="error">Could not load missed tasks.</Notice>;

  const byDay = new Map<string, MissedItem[]>();
  for (const i of items ?? [])
    byDay.set(i.logical_date!, [...(byDay.get(i.logical_date!) ?? []), i]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Missed</h1>
      <p className="mt-1 text-sm text-muted">
        These stay missed on their day. Reschedule to plan them again, or dismiss them.
      </p>

      {items && items.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            disabled={bulk.isPending}
            onClick={() =>
              bulk.mutate('reschedule_tomorrow', {
                onSuccess: (r) =>
                  toast(
                    r.failed
                      ? `Rescheduled ${r.rescheduled}; ${r.failed} could not be`
                      : `Rescheduled ${r.rescheduled} to tomorrow`,
                  ),
                onError: (e) => toast(e.message),
              })
            }
          >
            Reschedule all to tomorrow, same times
          </Button>
          <Button
            variant="secondary"
            disabled={bulk.isPending}
            onClick={() => bulk.mutate('dismiss_all', { onError: (e) => toast(e.message) })}
          >
            Dismiss all
          </Button>
        </div>
      )}

      {!items?.length ? (
        <div className="mt-8 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          Nothing missed.{' '}
          <Link to="/" className="font-medium text-accent">
            Back to today
          </Link>
        </div>
      ) : (
        [...byDay.entries()].map(([date, list]) => (
          <section key={date} className="mt-6">
            <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
              {formatDay(date)}
            </h2>
            <ul className="mt-1 divide-y divide-border">
              {list.map((i) => {
                const canMarkDone =
                  i.late_done_until !== null && Date.parse(i.late_done_until) > now;
                return (
                  <li key={i.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{i.title}</p>
                      <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                        {i.start_at && i.source === 'calendar' && (
                          <span className="tabular-nums">
                            {formatTime(i.start_at, profile.timezone)}–
                            {i.end_at && formatTime(i.end_at, profile.timezone)}
                          </span>
                        )}
                        <span>{i.source === 'calendar' ? 'Event' : 'Task'}</span>
                        <PointDots points={i.points} />
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <Button className="px-3 py-1.5 text-xs" onClick={() => setOpen(i)}>
                        Reschedule
                      </Button>
                      {canMarkDone && (
                        <Button
                          variant="secondary"
                          className="px-3 py-1.5 text-xs"
                          title="Forgot to tick: allowed for 48 hours after the day closes"
                          onClick={() =>
                            lateDone.mutate(i.id, {
                              onSuccess: () => toast('Marked done (late)'),
                              onError: (e) => toast(e.message),
                            })
                          }
                        >
                          Mark done
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        className="px-3 py-1.5 text-xs"
                        onClick={() => dismiss.mutate(i.id, { onError: (e) => toast(e.message) })}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      <RescheduleSheet
        item={open}
        today={day.today}
        timeZone={profile.timezone}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
