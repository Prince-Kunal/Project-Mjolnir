import type { DeadlineStatus } from '@mjolnir/domain';
import { useState } from 'react';
import { type Deadline, type DeadlineWarning, useUpdateDeadline } from '../../lib/deadlines.ts';
import { formatMinutes } from '../../lib/format.ts';
import { sessionWhen, STATUS, WARNING_LABEL } from './format.ts';

export function StatusChip({ status }: { status: DeadlineStatus }) {
  const s = STATUS[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium"
      style={{ color: s.color }}
    >
      <span className="size-2 rounded-full" style={{ background: s.color }} aria-hidden />
      {s.label}
    </span>
  );
}

export function StatusSelect({ deadline }: { deadline: Deadline }) {
  const update = useUpdateDeadline();
  return (
    <select
      value={deadline.status}
      aria-label="Status"
      onChange={(e) => update.mutate({ id: deadline.id, status: e.target.value as DeadlineStatus })}
      className="rounded-[var(--radius-inner)] bg-surface-2 px-2 py-1 text-xs font-medium"
      style={{ color: STATUS[deadline.status].color }}
    >
      {(Object.keys(STATUS) as DeadlineStatus[]).map((s) => (
        <option key={s} value={s}>
          {STATUS[s].label}
        </option>
      ))}
    </select>
  );
}

export function Warnings({ warnings }: { warnings: DeadlineWarning[] }) {
  if (!warnings.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {warnings.map((w) => (
        <span
          key={w}
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${w === 'overdue' ? 'bg-band-not-good/15 text-band-not-good' : 'bg-band-fair/15 text-band-fair'}`}
        >
          {WARNING_LABEL[w]}
        </span>
      ))}
    </div>
  );
}

/** The manual progress bar (3.9), saved when the drag ends. */
export function ProgressSlider({ deadline }: { deadline: Deadline }) {
  const update = useUpdateDeadline();
  // Only while dragging; otherwise the saved value (which realtime may change) is shown.
  const [draft, setDraft] = useState<number | null>(null);
  const value = draft ?? deadline.progress_pct;
  const commit = () => {
    if (draft !== null && draft !== deadline.progress_pct)
      update.mutate({ id: deadline.id, progress_pct: draft }, { onSettled: () => setDraft(null) });
    else setDraft(null);
  };

  return (
    <label className="flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        aria-label={`Progress on ${deadline.title}`}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        className="h-1.5 flex-1 accent-[var(--color-accent)]"
      />
      <span className="w-10 text-right text-xs tabular-nums text-muted">{value}%</span>
    </label>
  );
}

export function StatsLine({ deadline, timeZone }: { deadline: Deadline; timeZone: string }) {
  const s = deadline.stats;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
      <div>
        <dt className="text-muted">Sessions</dt>
        <dd className="tabular-nums">
          {s.sessions_done} done
          {deadline.target_sessions ? ` of ${deadline.target_sessions}` : ''} ·{' '}
          {s.sessions_upcoming} upcoming
          {s.sessions_missed ? ` · ${s.sessions_missed} missed` : ''}
        </dd>
      </div>
      <div>
        <dt className="text-muted">Hours</dt>
        <dd className="tabular-nums">
          {formatMinutes(s.minutes_done)} done of{' '}
          {formatMinutes(deadline.target_minutes ?? s.minutes_planned)}
          {deadline.target_minutes ? ' target' : ' planned'}
        </dd>
      </div>
      <div>
        <dt className="text-muted">Next session</dt>
        <dd className="truncate">{s.next_session ? sessionWhen(s.next_session, timeZone) : '—'}</dd>
      </div>
    </dl>
  );
}
