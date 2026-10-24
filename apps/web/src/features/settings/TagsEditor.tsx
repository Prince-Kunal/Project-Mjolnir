import { Button, Loading } from '../../components/ui.tsx';
import { useDeleteTag, useSaveTag, useTags } from '../../lib/deadlines.ts';
import { useAreas } from '../../lib/queries.ts';

/** Tags (3.8): made by #hashtags or the item dropdown. An area here gives untagged-area items one. */
export function TagsEditor() {
  const { data: tags, isLoading } = useTags();
  const { data: areas } = useAreas();
  const save = useSaveTag();
  const remove = useDeleteTag();

  if (isLoading) return <Loading />;
  if (!tags?.length)
    return (
      <p className="text-sm text-muted">No tags yet. Add #lfx to an event title to make one.</p>
    );

  return (
    <ul className="flex flex-col divide-y divide-border text-sm">
      {tags.map((t) => (
        <li key={t.id} className="flex items-center gap-3 py-2">
          <span className="min-w-0 flex-1 truncate">#{t.name}</span>
          <select
            value={t.area_id ?? ''}
            aria-label={`Area for #${t.name}`}
            onChange={(e) => save.mutate({ id: t.id, area_id: e.target.value || null })}
            className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs"
          >
            <option value="">No area</option>
            {areas?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            className="px-2 py-1 text-xs"
            aria-label={`Delete #${t.name}`}
            onClick={() => {
              if (
                window.confirm(
                  `Delete #${t.name}? Items and deadlines lose this tag; titles that still say #${t.name} bring it back on the next sync.`,
                )
              )
                remove.mutate(t.id);
            }}
          >
            Delete
          </Button>
        </li>
      ))}
    </ul>
  );
}
