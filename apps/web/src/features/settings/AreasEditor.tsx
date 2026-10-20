import { useState } from 'react';
import { Button, Loading } from '../../components/ui.tsx';
import { useArchiveArea, useAreas, useSaveArea } from '../../lib/queries.ts';

const field =
  'min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm focus:border-accent focus:outline-none';

export function AreasEditor() {
  const { data: areas, isLoading } = useAreas();
  const save = useSaveArea();
  const archive = useArchiveArea();
  const [name, setName] = useState('');

  if (isLoading) return <Loading />;
  return (
    <div className="flex flex-col gap-3">
      {areas?.length ? (
        <ul className="divide-y divide-border">
          {areas.map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-2">
              <input
                defaultValue={a.name}
                aria-label={`Area name ${a.name}`}
                className={field}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next && next !== a.name) save.mutate({ id: a.id, name: next });
                }}
              />
              <Button
                variant="ghost"
                onClick={() => archive.mutate(a.id)}
                aria-label={`Remove ${a.name}`}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No areas yet.</p>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          save.mutate(
            { name: name.trim(), sort_order: areas?.length ?? 0 },
            { onSuccess: () => setName('') },
          );
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New area"
          aria-label="New area"
          className={field}
        />
        <Button type="submit" variant="secondary" disabled={!name.trim()}>
          Add
        </Button>
      </form>
    </div>
  );
}
