import { Link } from 'react-router-dom';
import { Button, Loading, Notice } from '../../components/ui.tsx';
import { useResolveSuggestion, useUnassigned } from '../../lib/deadlines.ts';
import { useProfile } from '../../lib/queries.ts';
import { useToast } from '../../lib/toast.ts';
import { sessionWhen } from './format.ts';

/** Screen 7: untagged items whose title names a tag (3.8). Dismissals are remembered. */
export function UnassignedPage() {
  const { data: suggestions, isLoading, error } = useUnassigned();
  const { data: profile } = useProfile();
  const resolve = useResolveSuggestion();
  const toast = useToast((s) => s.show);

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/deadlines" className="text-sm text-muted hover:text-text">
        ← Deadlines
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Unassigned</h1>
      <p className="mt-1 text-sm text-muted">
        Untagged blocks that mention a tag. Link adds the tag here without changing the Google
        title.
      </p>

      {isLoading || !profile ? (
        <div className="mt-6">
          <Loading />
        </div>
      ) : error ? (
        <div className="mt-6">
          <Notice tone="error">Could not load suggestions. Try again.</Notice>
        </div>
      ) : suggestions?.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          Nothing to sort. New suggestions appear when a block mentions a tag you use.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-border">
          {suggestions?.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.item.title}</p>
                <p className="text-xs text-muted">{sessionWhen(s.item, profile.timezone)}</p>
              </div>
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">#{s.tag.name}</span>
              <div className="flex gap-1">
                <Button
                  className="px-3 py-1.5"
                  onClick={() =>
                    resolve.mutate(
                      { id: s.id, link: true },
                      { onSuccess: () => toast(`Linked “${s.item.title}” to #${s.tag.name}`) },
                    )
                  }
                >
                  Link
                </Button>
                <Button
                  variant="ghost"
                  className="px-3 py-1.5"
                  onClick={() => resolve.mutate({ id: s.id, link: false })}
                >
                  Dismiss
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {resolve.error && (
        <div className="mt-4">
          <Notice tone="error">{resolve.error.message}</Notice>
        </div>
      )}
    </div>
  );
}
