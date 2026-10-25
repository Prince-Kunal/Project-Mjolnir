import type { ProfileSettings } from '../../lib/queries.ts';

export interface DayValues {
  timezone: string;
  day_boundary_hour: number;
  week_start: number;
  google_item_type: 'events' | 'tasks';
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function timezones(current: string): string[] {
  const all =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return all.includes(current) ? all : [current, ...all];
}

const fieldClass =
  'mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text focus:border-accent focus:outline-none';

export function DaySettings({
  values,
  onChange,
  showWeekStart = true,
}: {
  values: DayValues;
  onChange(patch: ProfileSettings): void;
  showWeekStart?: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <label className="block text-sm">
        <span className="font-medium">Timezone</span>
        <select
          className={fieldClass}
          value={values.timezone}
          onChange={(e) => onChange({ timezone: e.target.value })}
        >
          {timezones(values.timezone).map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="font-medium">Day ends at</span>
        <select
          className={fieldClass}
          value={values.day_boundary_hour}
          onChange={(e) => onChange({ day_boundary_hour: Number(e.target.value) })}
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, '0')}:00
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-muted">
          A block that starts before this time counts for the previous day. 04:00 means a 00:30
          session belongs to the evening it was planned in.
        </span>
      </label>

      {showWeekStart && (
        <label className="block text-sm">
          <span className="font-medium">Week starts on</span>
          <select
            className={fieldClass}
            value={values.week_start}
            onChange={(e) => onChange({ week_start: Number(e.target.value) })}
          >
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i + 1}>
                {d}
              </option>
            ))}
          </select>
        </label>
      )}

      <fieldset className="text-sm">
        <legend className="font-medium">Where your day lives in Google</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(
            [
              ['events', 'Calendar events', 'Timed blocks. Colour sets points.'],
              ['tasks', 'Google Tasks', 'Dated to-dos with no times. Each list sets points.'],
            ] as const
          ).map(([value, label, hint]) => (
            <label
              key={value}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
                values.google_item_type === value ? 'border-accent bg-accent/10' : 'border-border'
              }`}
            >
              <input
                type="radio"
                name="google_item_type"
                value={value}
                checked={values.google_item_type === value}
                onChange={() => onChange({ google_item_type: value })}
                className="mt-0.5 accent-[var(--color-accent)]"
              />
              <span>
                <span className="block font-medium">{label}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        {values.google_item_type === 'tasks' && (
          <p className="mt-2 text-xs text-muted">
            Calendars stop syncing and your history stays. Set up your task lists under Google
            Tasks; tasks due from today on become items.
          </p>
        )}
      </fieldset>
    </div>
  );
}
