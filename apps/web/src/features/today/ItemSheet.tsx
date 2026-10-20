import { addDays } from '@mjolnir/domain';
import { useState } from 'react';
import { Sheet } from '../../components/Sheet.tsx';
import { useToast } from '../../lib/toast.ts';
import { Button, Notice } from '../../components/ui.tsx';
import { type DayItem, useDeleteTask, useToggleItem, useUpdateItem } from '../../lib/day.ts';
import { formatMinutes, formatTime, googleEventUrl } from '../../lib/format.ts';
import { useAreas } from '../../lib/queries.ts';

interface Props {
  item: DayItem | null;
  today: string;
  timeZone: string;
  onClose(): void;
}

const SOURCE_LABEL: Record<string, string> = {
  calendar: 'Calendar event',
  gtask: 'Google task',
  manual: 'Task',
  habit: 'Habit',
};

export function ItemSheet({ item, today, timeZone, onClose }: Props) {
  return (
    <Sheet
      open={item !== null}
      onOpenChange={(o) => !o && onClose()}
      title={item?.title || 'Untitled'}
    >
      {item && (
        <ItemDetails
          key={`${item.id}:${item.actual_minutes}`}
          item={item}
          today={today}
          timeZone={timeZone}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}

function ItemDetails({
  item,
  today,
  timeZone,
  onClose,
}: {
  item: DayItem;
  today: string;
  timeZone: string;
  onClose(): void;
}) {
  const toggle = useToggleItem();
  const update = useUpdateItem();
  const remove = useDeleteTask();
  const toast = useToast((s) => s.show);
  const { data: areas } = useAreas();
  const [minutes, setMinutes] = useState(item.actual_minutes ?? item.planned_minutes ?? 0);

  const done = item.status === 'done';
  const editablePoints = item.source === 'manual' || item.source === 'habit';
  const error = toggle.error ?? update.error ?? remove.error;

  return (
    <div className="flex flex-col gap-5 text-sm">
      <dl className="grid grid-cols-[7rem_1fr] gap-y-2">
        <dt className="text-muted">Type</dt>
        <dd>{SOURCE_LABEL[item.source]}</dd>
        {item.start_at && item.source === 'calendar' && !item.is_all_day && (
          <>
            <dt className="text-muted">Time</dt>
            <dd className="tabular-nums">
              {formatTime(item.start_at, timeZone)}–
              {item.end_at && formatTime(item.end_at, timeZone)}
              {item.planned_minutes ? ` · ${formatMinutes(item.planned_minutes)}` : ''}
            </dd>
          </>
        )}
        <dt className="text-muted">Status</dt>
        <dd className="capitalize">
          {item.finalized ? `${item.status} (day closed)` : item.status}
        </dd>
        {item.tags.length > 0 && (
          <>
            <dt className="text-muted">Tags</dt>
            <dd className="flex flex-wrap gap-1">
              {item.tags.map((t) => (
                <span key={t.id} className="rounded bg-surface-2 px-1.5 py-px text-xs">
                  #{t.name}
                </span>
              ))}
            </dd>
          </>
        )}
      </dl>

      <div>
        <p className="mb-1.5 font-medium">Points</p>
        {editablePoints && !item.finalized ? (
          <div
            role="radiogroup"
            aria-label="Points"
            className="flex w-40 overflow-hidden rounded-lg border border-border"
          >
            {[1, 2, 3].map((p) => (
              <button
                key={p}
                role="radio"
                aria-checked={item.points === p}
                onClick={() => update.mutate({ id: item.id, patch: { points: p } })}
                className={`flex-1 py-1.5 ${item.points === p ? 'bg-accent font-semibold text-bg' : 'text-muted'}`}
              >
                {p}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-muted">
            {item.points}{' '}
            {item.source === 'calendar' ? '· set by the event colour in Google Calendar' : ''}
          </p>
        )}
      </div>

      <label className="block">
        <span className="mb-1.5 block font-medium">Area</span>
        <select
          value={item.area_id ?? ''}
          disabled={item.finalized}
          onChange={(e) =>
            update.mutate({ id: item.id, patch: { area_id: e.target.value || null } })
          }
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2"
        >
          <option value="">No area</option>
          {areas?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>

      {item.source === 'manual' && !item.finalized && (
        <div>
          <p className="mb-1.5 font-medium">Day</p>
          <div className="flex gap-2">
            {(
              [
                ['Today', today],
                ['Tomorrow', addDays(today, 1)],
                ['Backlog', null],
              ] as const
            ).map(([label, date]) => (
              <Button
                key={label}
                variant={item.logical_date === date ? 'primary' : 'secondary'}
                onClick={() =>
                  update.mutate(
                    { id: item.id, patch: { logical_date: date } },
                    { onSuccess: onClose },
                  )
                }
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {!item.finalized && (
        <div className="flex flex-col gap-2">
          <p className="font-medium">Actual time</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={5}
              value={minutes}
              onChange={(e) => setMinutes(Math.max(0, Number(e.target.value)))}
              aria-label="Actual minutes"
              className="w-24 rounded-lg border border-border bg-surface-2 px-3 py-2 tabular-nums"
            />
            <span className="text-muted">minutes</span>
          </div>
        </div>
      )}

      {error && <Notice tone="error">{error.message}</Notice>}

      <div className="flex flex-wrap gap-2">
        {!item.finalized && !done && (
          <Button
            onClick={() =>
              toggle.mutate({ item, done: true, actualMinutes: minutes }, { onSuccess: onClose })
            }
          >
            Mark done
          </Button>
        )}
        {!item.finalized && done && (
          <>
            <Button
              disabled={minutes === item.actual_minutes}
              onClick={() =>
                toggle.mutate({ item, done: true, actualMinutes: minutes }, { onSuccess: onClose })
              }
            >
              Save time
            </Button>
            <Button
              variant="secondary"
              onClick={() => toggle.mutate({ item, done: false }, { onSuccess: onClose })}
            >
              Mark not done
            </Button>
          </>
        )}
        {item.google_event_id && item.google_calendar_id && (
          <a
            href={googleEventUrl(item.google_event_id, item.google_calendar_id)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-lg border border-border bg-surface-2 px-4 py-2 font-medium"
          >
            Open in Google Calendar
          </a>
        )}
        {item.source === 'manual' && !item.finalized && (
          <Button
            variant="ghost"
            className="text-band-not-good"
            onClick={() =>
              remove.mutate(item.id, {
                onSuccess: () => {
                  onClose();
                  toast('Task deleted');
                },
              })
            }
          >
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
