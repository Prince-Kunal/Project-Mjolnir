import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Card, Loading, Notice } from '../../components/ui.tsx';
import { appApi } from '../../lib/day.ts';
import { startGoogleConnect } from '../../lib/googleConnect.ts';
import { useGoogleConnection } from '../../lib/queries.ts';
import { supabase } from '../../lib/supabase.ts';

const SCOPE_TASKS = 'https://www.googleapis.com/auth/tasks';

/** Tasks mode (3.13): Google Tasks access, which lists sync, and what each list's tasks are worth. */
export function TaskListsCard() {
  const qc = useQueryClient();
  const { data: google } = useGoogleConnection();
  const [error, setError] = useState<string | null>(null);
  const lists = useQuery({
    queryKey: ['task_lists'],
    queryFn: async () => {
      const { data, error } = await supabase.from('task_lists').select('*').order('created_at');
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const save = useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: string;
      sync_enabled?: boolean;
      points?: number;
    }) => {
      const { error } = await supabase.from('task_lists').update(patch).eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['task_lists'] }),
  });
  const refresh = useMutation({
    mutationFn: () => appApi<{ lists: number }>('google/task-lists'),
    onSettled: () => qc.invalidateQueries({ queryKey: ['task_lists'] }),
  });

  const hasAccess = Boolean(google?.connected && google.scopes?.includes(SCOPE_TASKS));

  return (
    <Card
      title="Google Tasks"
      description="Tasks with a due date become items for that day; tasks with none go to the backlog. Each list sets its tasks’ points."
    >
      <div className="flex flex-col gap-4 text-sm">
        {!hasAccess ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-muted">Mjolnir needs access to your Google Tasks.</p>
            <Button
              onClick={() =>
                startGoogleConnect({ ok: '/more', error: '/more' }, { tasks: true }).catch((e) =>
                  setError(e instanceof Error ? e.message : 'Could not start the connection.'),
                )
              }
            >
              Connect Google Tasks
            </Button>
          </div>
        ) : lists.isLoading ? (
          <Loading />
        ) : (
          <>
            {!lists.data?.length ? (
              <p className="text-muted">No task lists yet. Refresh to read them from Google.</p>
            ) : (
              <ul className="divide-y divide-rule">
                {lists.data.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 py-2">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--color-accent)]"
                        checked={l.sync_enabled}
                        onChange={(e) => save.mutate({ id: l.id, sync_enabled: e.target.checked })}
                      />
                      <span className="truncate">{l.title ?? 'Untitled list'}</span>
                    </label>
                    <select
                      value={l.points}
                      aria-label={`Points for ${l.title}`}
                      onChange={(e) => save.mutate({ id: l.id, points: Number(e.target.value) })}
                      className="rounded-[var(--radius-inner)] bg-surface-2 px-2 py-1 text-xs"
                    >
                      {[0, 1, 2, 3].map((p) => (
                        <option key={p} value={p}>
                          {p === 0 ? '0 · not tasks' : `${p} point${p === 1 ? '' : 's'}`}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                disabled={refresh.isPending}
                onClick={() => refresh.mutate()}
              >
                {refresh.isPending ? 'Reading…' : 'Refresh lists'}
              </Button>
              <p className="text-xs text-muted">
                Google Tasks has no live updates, so lists are checked every 10 minutes and when you
                open the app.
              </p>
            </div>
          </>
        )}
        {(error || save.error || refresh.error) && (
          <Notice tone="error">{error ?? save.error?.message ?? refresh.error?.message}</Notice>
        )}
      </div>
    </Card>
  );
}
