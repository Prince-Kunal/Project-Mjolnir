// One poll of one Google task list (plan 8.9): tasks updated since the last run, planned with
// planTask and applied in one transaction per page.
import { type FetchFn, ReconnectNeededError } from '../google.ts';
import { tasksUrl } from '../tasks.ts';
import { backoffSeconds, type SyncOutcome } from './run.ts';
import { type GTask, planTaskPage, type TaskOp, type TaskSnapshot } from './tasks.ts';

export interface TaskLease {
  source_id: string;
  user_id: string;
  google_tasklist_id: string;
  run_kind: 'incremental' | 'full';
  run_started_at: string;
  /** RFC 3339: only tasks changed since then (null on a full run). */
  updated_min: string | null;
  page_token: string | null;
  attempts: number;
  points: number;
  since: string | null;
  profile: { timezone: string; day_boundary_hour: number };
}

export interface TaskStore {
  lease(listId: string): Promise<TaskLease | null>;
  items(listId: string, taskIds: string[]): Promise<TaskSnapshot[]>;
  apply(
    listId: string,
    ops: TaskOp[],
    seen: string[],
  ): Promise<{ applied: number; skipped: number }>;
  checkpoint(listId: string, pageToken: string | null): Promise<void>;
  finish(listId: string): Promise<void>;
  fail(listId: string, error: string, retrySeconds: number | null, reset: boolean): Promise<void>;
}

export interface TaskSyncDeps {
  store: TaskStore;
  accessToken(userId: string): Promise<string>;
  fetchFn?: FetchFn;
  now?: () => Date;
  deadline: number;
}

export async function syncTaskList(listId: string, deps: TaskSyncDeps): Promise<SyncOutcome> {
  const now = deps.now ?? (() => new Date());
  const fetchFn = deps.fetchFn ?? fetch;
  const { store } = deps;

  const lease = await store.lease(listId);
  if (!lease) return 'skipped';

  let token: string;
  try {
    token = await deps.accessToken(lease.user_id);
  } catch (err) {
    if (err instanceof ReconnectNeededError) {
      await store.fail(listId, 'reconnect_needed', null, false);
      return 'reconnect';
    }
    throw err;
  }

  let pageToken = lease.page_token;
  while (true) {
    if (now().getTime() >= deps.deadline) {
      await store.checkpoint(listId, pageToken);
      return 'continued';
    }
    const res = await fetchFn(
      tasksUrl(lease.google_tasklist_id, { updatedMin: lease.updated_min, pageToken }),
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      await res.body?.cancel();
      // A list deleted in Google, or a lost permission: stop until the next poll.
      const transient = res.status === 429 || res.status >= 500 || res.status === 401;
      await store.fail(
        listId,
        `google_${res.status}`,
        transient ? backoffSeconds(lease.attempts) : 600,
        false,
      );
      return 'retry';
    }

    const page = (await res.json()) as { items?: GTask[]; nextPageToken?: string };
    const tasks = page.items ?? [];
    const snapshots = tasks.length
      ? await store.items(
          listId,
          tasks.map((t) => t.id),
        )
      : [];
    const plan = planTaskPage(tasks, snapshots, {
      timeZone: lease.profile.timezone,
      boundaryHour: lease.profile.day_boundary_hour,
      points: lease.points,
      now: now(),
      since: lease.since,
    });
    const result = await store.apply(listId, plan.ops, plan.seen);
    if (result.skipped > 0) {
      // An item changed while we planned (a tick, say): re-run this page fresh.
      await store.checkpoint(listId, pageToken);
      return 'continued';
    }
    if (page.nextPageToken) {
      pageToken = page.nextPageToken;
      continue;
    }
    await store.finish(listId);
    return 'done';
  }
}
