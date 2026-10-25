import { useEffect, useRef, useState } from 'react';
import { useSaveNote } from '../../lib/day.ts';

const SAVE_AFTER_MS = 800;

/** One free-text note per logical day (3.12), saved as you type. */
export function DailyNote({ date, initial }: { date: string; initial: string }) {
  const [body, setBody] = useState(initial);
  const save = useSaveNote();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(initial);

  // Flush a pending save when leaving the day.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        save.mutate({ date, body: latest.current });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [date],
  );

  function onChange(next: string) {
    setBody(next);
    latest.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      save.mutate({ date, body: next });
    }, SAVE_AFTER_MS);
  }

  return (
    <section className="rounded-[var(--radius-card)] bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[17px]">Note</h2>
        <span className="text-[14px] text-faint" aria-live="polite">
          {save.isPending ? 'Saving…' : save.isError ? 'Not saved' : save.isSuccess ? 'Saved' : ''}
        </span>
      </div>
      <textarea
        value={body}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        maxLength={10000}
        placeholder="How did today go?"
        aria-label="Daily note"
        className="mt-3 w-full resize-y rounded-[var(--radius-inner)] bg-surface-2 px-3.5 py-3 text-[16px] leading-relaxed placeholder:text-faint focus:outline-2 focus:outline-bone/50"
      />
    </section>
  );
}
