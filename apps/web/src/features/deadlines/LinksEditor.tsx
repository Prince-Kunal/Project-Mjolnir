import { matchTags } from '@mjolnir/domain';
import { useState } from 'react';
import { Button, Notice } from '../../components/ui.tsx';
import type { DayItem } from '../../lib/day.ts';
import {
  parseTagNames,
  TAG_NAME,
  useDeadlines,
  useSetItemLinks,
  useTags,
} from '../../lib/deadlines.ts';
import { useToast } from '../../lib/toast.ts';

/**
 * Tags and deadlines on one item (3.8). Tags from the title's #hashtags are fixed here: only the
 * title can remove them. Links are stored in the app and in the Google event's properties.
 */
export function LinksEditor({ item }: { item: DayItem }) {
  const [editing, setEditing] = useState(false);
  const hashtags = item.tags.filter((t) => t.source === 'hashtag').map((t) => t.name);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="font-medium">Tags and deadlines</p>
        {!editing && item.status !== 'deleted' && (
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </div>
      {editing ? (
        <Picker item={item} hashtags={hashtags} onDone={() => setEditing(false)} />
      ) : item.tags.length || item.deadlines.length ? (
        <div className="flex flex-wrap gap-1.5">
          {item.tags.map((t) => (
            <span
              key={t.id}
              title={t.source === 'hashtag' ? 'From the title' : undefined}
              className="rounded bg-surface-2 px-1.5 py-0.5 text-xs"
            >
              #{t.name}
            </span>
          ))}
          {item.deadlines.map((d) => (
            <span
              key={d.id}
              className="rounded border border-accent/40 px-1.5 py-0.5 text-xs text-accent"
            >
              {d.title}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-muted">None. Linked work counts toward a deadline.</p>
      )}
    </div>
  );
}

function Picker({ item, hashtags, onDone }: { item: DayItem; hashtags: string[]; onDone(): void }) {
  const { data: tags = [] } = useTags();
  const { data: deadlines = [] } = useDeadlines();
  const save = useSetItemLinks();
  const toast = useToast((s) => s.show);
  const [chosenTags, setChosenTags] = useState(() => new Set(item.tags.map((t) => t.name)));
  const [chosenDeadlines, setChosenDeadlines] = useState(
    () => new Set(item.deadlines.map((d) => d.id)),
  );
  const [newTags, setNewTags] = useState('');

  const names = tags.map((t) => t.name);
  const suggested = new Set(hashtags.length ? [] : matchTags(item.title, names));
  const ordered = [...names].sort(
    (a, b) => Number(suggested.has(b)) - Number(suggested.has(a)) || a.localeCompare(b),
  );
  const typed = parseTagNames(newTags);
  const badTag = typed.find((t) => !TAG_NAME.test(t));
  const shownDeadlines = deadlines.filter(
    (d) => !['done', 'dropped'].includes(d.status) || chosenDeadlines.has(d.id),
  );

  const flip = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  function submit() {
    save.mutate(
      {
        id: item.id,
        tags: [...new Set([...chosenTags, ...typed])],
        deadlines: [...chosenDeadlines],
      },
      {
        onSuccess: () => {
          if (item.source === 'calendar') toast('Links saved, and added to the Google event');
          onDone();
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <fieldset>
        <legend className="mb-1 text-xs text-muted">Tags</legend>
        {ordered.length > 0 && (
          <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
            {ordered.map((name) => {
              const fixed = hashtags.includes(name);
              const on = chosenTags.has(name);
              return (
                <button
                  key={name}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  disabled={fixed}
                  title={fixed ? 'From the title' : undefined}
                  onClick={() => setChosenTags(flip(chosenTags, name))}
                  className={`rounded-full border px-2 py-0.5 text-xs ${on ? 'border-accent bg-accent/15 text-text' : 'border-border text-muted'} disabled:opacity-70`}
                >
                  #{name}
                  {suggested.has(name) && !on && (
                    <span className="ml-1 text-accent">suggested</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        <input
          value={newTags}
          onChange={(e) => setNewTags(e.target.value)}
          placeholder="New tags, such as lfx gsoc"
          aria-label="New tags"
          className="mt-2 w-full rounded-lg border border-border bg-surface-2 px-3 py-1.5"
        />
        {badTag && (
          <p className="mt-1 text-xs text-band-not-good">
            “{badTag}”: use up to 32 letters, digits, - or _.
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-xs text-muted">Deadlines</legend>
        {shownDeadlines.length === 0 ? (
          <p className="text-xs text-muted">No open deadlines.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {shownDeadlines.map((d) => (
              <label key={d.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={chosenDeadlines.has(d.id)}
                  onChange={() => setChosenDeadlines(flip(chosenDeadlines, d.id))}
                />
                <span>{d.title}</span>
                {d.tags.some((t) => chosenTags.has(t.name)) && !chosenDeadlines.has(d.id) && (
                  <span className="text-xs text-muted">counts through its tags</span>
                )}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {save.error && <Notice tone="error">{save.error.message}</Notice>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={save.isPending || Boolean(badTag)} onClick={submit}>
          Save links
        </Button>
      </div>
    </div>
  );
}
