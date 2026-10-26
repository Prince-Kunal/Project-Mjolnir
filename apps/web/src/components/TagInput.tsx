import { parseTitle } from '@mjolnir/domain';
import { useId, useMemo, useRef, useState } from 'react';
import { useDeadlines, useTags } from '../lib/deadlines.ts';

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>;

interface Props extends InputProps {
  value: string;
  onChange(value: string): void;
  /** Show one-tap chips for the tags open deadlines count. */
  chips?: boolean;
  /** Sizing of the field and its chips inside the parent's layout. */
  boxClassName?: string;
}

// The #word being typed just before the caret.
const TYPING = /(?:^|\s)#([a-z0-9_-]{0,32})$/i;

/**
 * A text field that knows the user's tags (3.8): typing `#` offers matching tags, each with the
 * deadlines it feeds, and the chips below add a deadline's tag in one tap, so a block can be
 * linked to a deadline without remembering its tag.
 */
export function TagInput({
  value,
  onChange,
  chips = false,
  boxClassName = 'flex-1 basis-full',
  className,
  onKeyDown,
  ...rest
}: Props) {
  const { data: tags = [] } = useTags();
  const { data: deadlines = [] } = useDeadlines();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [caret, setCaret] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // Tag name -> titles of the open deadlines it counts toward.
  const feeds = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const d of deadlines) {
      if (d.completed_at) continue;
      for (const t of d.tags) m.set(t.name, [...(m.get(t.name) ?? []), d.title]);
    }
    return m;
  }, [deadlines]);

  const typed = TYPING.exec(value.slice(0, caret ?? value.length));
  const query = typed?.[1]?.toLowerCase() ?? null;
  const options =
    query === null
      ? []
      : tags
          .filter((t) => t.name.startsWith(query) && t.name !== query)
          .sort((a, b) => Number(feeds.has(b.name)) - Number(feeds.has(a.name)))
          .slice(0, 6);
  const open = options.length > 0 && !dismissed;
  const used = new Set(parseTitle(value).tags);
  const chipTags = [...feeds.keys()].filter((name) => !used.has(name)).sort();

  function place(next: string, at: number) {
    onChange(next);
    setDismissed(false);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(at, at);
      setCaret(at);
    });
  }

  function choose(name: string) {
    const end = caret ?? value.length;
    const start = end - (typed![1]!.length + 1);
    const after = value.slice(end).replace(/^\S*/, '').replace(/^\s*/, '');
    const head = `${value.slice(0, start)}#${name} `;
    place(head + after, head.length);
  }

  function addChip(name: string) {
    const head = value.replace(/\s*$/, '');
    const next = `${head}${head ? ' ' : ''}#${name} `;
    place(next, next.length);
  }

  const track = (e: React.SyntheticEvent<HTMLInputElement>) =>
    setCaret(e.currentTarget.selectionStart);

  return (
    <div className={`flex min-w-0 flex-col gap-2 ${boxClassName}`}>
      <div className="relative">
        <input
          {...rest}
          ref={inputRef}
          value={value}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          onChange={(e) => {
            onChange(e.target.value);
            setCaret(e.target.selectionStart);
            setActive(0);
            setDismissed(false);
          }}
          onSelect={track}
          onClick={track}
          onKeyDown={(e) => {
            if (open) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const step = e.key === 'ArrowDown' ? 1 : -1;
                setActive((a) => (a + step + options.length) % options.length);
                return;
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                choose(options[Math.min(active, options.length - 1)]!.name);
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setDismissed(true);
                return;
              }
            }
            onKeyDown?.(e);
          }}
          onBlur={() => setDismissed(true)}
          onFocus={() => setDismissed(false)}
          className={`w-full ${className ?? ''}`}
        />
        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Tags"
            className="mt-1.5 overflow-hidden rounded-[var(--radius-inner)] bg-surface-2 py-1"
          >
            {options.map((t, i) => (
              <li
                key={t.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // Keep focus in the field while picking.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(t.name);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-baseline gap-3 px-4 py-2 text-[15px] ${i === active ? 'bg-active' : ''}`}
              >
                <span className="text-text">#{t.name}</span>
                {feeds.has(t.name) && (
                  <span className="min-w-0 truncate text-[13px] text-muted">
                    {feeds.get(t.name)!.join(', ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {chips && chipTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pl-1">
          <span className="text-[13px] text-faint">Count toward</span>
          {chipTags.map((name) => (
            <button
              key={name}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addChip(name)}
              title={feeds.get(name)!.join(', ')}
              className="rounded-full bg-surface-2 px-2.5 py-1 text-[13px] text-muted transition hover:bg-active hover:text-text"
            >
              #{name}
              <span className="text-faint"> · {feeds.get(name)![0]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
