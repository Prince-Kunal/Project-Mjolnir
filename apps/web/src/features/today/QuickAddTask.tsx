import { parseTitle } from '@mjolnir/domain';
import { useState } from 'react';
import { useCreateTask } from '../../lib/day.ts';

/** A manual task worth 1 to 3 points, for `date` or the backlog (null). #tags in the title link. */
export function QuickAddTask({
  date,
  placeholder = 'Add a task… #tag',
}: {
  date: string | null;
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  const [points, setPoints] = useState(1);
  const create = useCreateTask();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const { title, tags } = parseTitle(text);
    if (!title) return;
    create.mutate({ title, points, date, tags }, { onSuccess: () => setText('') });
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label="New task"
        className="min-w-0 flex-1 rounded-[var(--radius-inner)] bg-surface-2 px-3 py-2 text-sm placeholder:text-muted focus:outline-2 focus:outline-bone/50"
      />
      <div role="radiogroup" aria-label="Points" className="flex rounded-full bg-surface-2 p-1">
        {[1, 2, 3].map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={points === p}
            onClick={() => setPoints(p)}
            className={`w-8 py-2 text-sm ${points === p ? 'rounded-full bg-text font-semibold text-bg' : 'text-muted'}`}
          >
            {p}
          </button>
        ))}
      </div>
      <button
        type="submit"
        disabled={!text.trim() || create.isPending}
        className="h-10 rounded-full bg-primary px-4 text-sm font-medium text-on-primary transition hover:bg-bone disabled:opacity-40"
      >
        Add
      </button>
    </form>
  );
}
