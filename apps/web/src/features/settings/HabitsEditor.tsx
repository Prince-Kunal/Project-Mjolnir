import { useState } from 'react';
import { Button, Loading } from '../../components/ui.tsx';
import {
  type Habit,
  useArchiveHabit,
  useAreas,
  useHabits,
  useSaveHabit,
} from '../../lib/queries.ts';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const field =
  'rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm focus:border-accent focus:outline-none';

/** Weekday bitmask, Monday = bit 0 (section 7). */
function WeekdayPicker({ value, onChange }: { value: number; onChange(v: number): void }) {
  return (
    <div className="flex gap-1" role="group" aria-label="Days">
      {DAYS.map((d, i) => {
        const on = (value & (1 << i)) !== 0;
        return (
          <button
            key={i}
            type="button"
            aria-pressed={on}
            aria-label={DAY_NAMES[i]}
            onClick={() => {
              const next = value ^ (1 << i);
              if (next) onChange(next);
            }}
            className={`size-7 rounded-md text-xs font-medium ${on ? 'bg-accent text-bg' : 'bg-surface-2 text-muted'}`}
          >
            {d}
          </button>
        );
      })}
    </div>
  );
}

function PointsPicker({ value, onChange }: { value: number; onChange(p: number): void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Points"
      className="flex overflow-hidden rounded-lg border border-border"
    >
      {[1, 2, 3].map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={value === p}
          onClick={() => onChange(p)}
          className={`w-8 py-1.5 text-sm ${value === p ? 'bg-accent font-semibold text-bg' : 'text-muted'}`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

function HabitRow({ habit }: { habit: Habit }) {
  const { data: areas } = useAreas();
  const save = useSaveHabit();
  const archive = useArchiveHabit();
  const set = (patch: Partial<Habit>) => save.mutate({ id: habit.id, ...patch });

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-center gap-2">
        <input
          defaultValue={habit.title}
          aria-label={`Habit title ${habit.title}`}
          className={`${field} min-w-0 flex-1`}
          onBlur={(e) => {
            const t = e.target.value.trim();
            if (t && t !== habit.title) set({ title: t });
          }}
        />
        <PointsPicker value={habit.points} onChange={(points) => set({ points })} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <WeekdayPicker value={habit.weekdays} onChange={(weekdays) => set({ weekdays })} />
        <select
          value={habit.area_id ?? ''}
          onChange={(e) => set({ area_id: e.target.value || null })}
          aria-label="Area"
          className={`${field} py-1.5`}
        >
          <option value="">No area</option>
          {areas?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={habit.active}
            onChange={(e) => set({ active: e.target.checked })}
            className="accent-[var(--color-accent)]"
          />
          Active
        </label>
        <Button
          variant="ghost"
          className="ml-auto px-2 text-xs"
          onClick={() => archive.mutate(habit.id)}
        >
          Remove
        </Button>
      </div>
    </li>
  );
}

export function HabitsEditor() {
  const { data: habits, isLoading } = useHabits();
  const save = useSaveHabit();
  const [title, setTitle] = useState('');
  const [points, setPoints] = useState(1);

  if (isLoading) return <Loading />;
  return (
    <div className="flex flex-col gap-3">
      {habits?.length ? (
        <ul className="divide-y divide-border">
          {habits.map((h) => (
            <HabitRow key={h.id} habit={h} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          No habits yet. Each one becomes a daily check worth its points.
        </p>
      )}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          save.mutate(
            { title: title.trim(), points, weekdays: 127, active: true, area_id: null },
            { onSuccess: () => setTitle('') },
          );
        }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New habit, e.g. Gym"
          aria-label="New habit"
          className={`${field} min-w-0 flex-1`}
        />
        <PointsPicker value={points} onChange={setPoints} />
        <Button type="submit" variant="secondary" disabled={!title.trim()}>
          Add
        </Button>
      </form>
    </div>
  );
}
