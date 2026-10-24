import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Loading, Notice } from '../../components/ui.tsx';
import { useDay } from '../../lib/day.ts';
import { type Deadline, useDeadlines, useUnassigned } from '../../lib/deadlines.ts';
import { useProfile } from '../../lib/queries.ts';
import { DeadlineForm } from './DeadlineForm.tsx';
import { dueText } from './format.ts';
import { ProgressSlider, StatsLine, StatusChip, Warnings } from './parts.tsx';

/** Screen 6: deadlines sorted by due date, open ones first. */
export function DeadlinesPage() {
  const { data: deadlines, isLoading, error } = useDeadlines();
  const { data: day } = useDay();
  const { data: profile } = useProfile();
  const { data: unassigned } = useUnassigned();
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();

  const open = deadlines?.filter((d) => !['done', 'dropped'].includes(d.status)) ?? [];
  const closed = deadlines?.filter((d) => ['done', 'dropped'].includes(d.status)) ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Deadlines</h1>
        <div className="flex items-center gap-2">
          <Link
            to="/unassigned"
            className="rounded-lg px-3 py-2 text-sm text-muted hover:text-text"
          >
            Unassigned
            {unassigned && unassigned.length > 0 && (
              <span className="ml-1.5 rounded-full bg-accent px-1.5 py-px text-xs font-semibold text-bg tabular-nums">
                {unassigned.length}
              </span>
            )}
          </Link>
          <Button
            onClick={() => setAdding(true)}
            disabled={!day}
            aria-label="New deadline"
            className="whitespace-nowrap"
          >
            New<span className="hidden sm:inline">&nbsp;deadline</span>
          </Button>
        </div>
      </header>

      {isLoading || !profile ? (
        <div className="mt-6">
          <Loading />
        </div>
      ) : error ? (
        <div className="mt-6">
          <Notice tone="error">Could not load deadlines. Try again.</Notice>
        </div>
      ) : deadlines?.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          No deadlines yet. Add one with a tag, such as “5 PRs raised” with #lfx, and every #lfx
          block counts toward it.
        </p>
      ) : (
        <>
          <ul className="mt-6 flex flex-col gap-3">
            {open.map((d) => (
              <DeadlineCard key={d.id} deadline={d} timeZone={profile.timezone} />
            ))}
          </ul>
          {closed.length > 0 && (
            <>
              <h2 className="mt-8 text-xs font-semibold tracking-wide text-muted uppercase">
                Done and dropped
              </h2>
              <ul className="mt-2 flex flex-col gap-3 opacity-75">
                {closed.map((d) => (
                  <DeadlineCard key={d.id} deadline={d} timeZone={profile.timezone} />
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {day && (
        <DeadlineForm
          open={adding}
          onOpenChange={setAdding}
          today={day.today}
          onSaved={(id) => navigate(`/deadlines/${id}`)}
        />
      )}
    </div>
  );
}

function DeadlineCard({ deadline: d, timeZone }: { deadline: Deadline; timeZone: string }) {
  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/deadlines/${d.id}`}
            className="block truncate font-semibold hover:text-accent"
          >
            {d.title}
          </Link>
          <p
            className={`mt-0.5 text-xs ${d.stats.days_left < 0 && d.status !== 'done' && d.status !== 'dropped' ? 'text-band-not-good' : 'text-muted'}`}
          >
            {dueText(d)}
          </p>
        </div>
        <StatusChip status={d.status} />
      </div>
      <div className="mt-3">
        <ProgressSlider deadline={d} />
      </div>
      <div className="mt-3">
        <StatsLine deadline={d} timeZone={timeZone} />
      </div>
      {(d.warnings.length > 0 || d.tags.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Warnings warnings={d.warnings} />
          {d.tags.map((t) => (
            <span key={t.id} className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted">
              #{t.name}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}
