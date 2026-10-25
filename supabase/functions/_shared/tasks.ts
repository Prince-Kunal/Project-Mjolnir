// Google Tasks API v1 (plan 8.9), with fetch and no SDK. Tasks have a due date but no time.
import { type FetchFn, GoogleError } from './google.ts';
export { SCOPE_TASKS } from './google.ts';
import type { GTask } from './sync/tasks.ts';

export const TASKS_API = 'https://tasks.googleapis.com/tasks/v1';

const TASK_FIELDS = 'id,etag,title,status,due,completed,deleted,hidden,updated';

async function call<T>(
  url: string,
  accessToken: string,
  init: RequestInit,
  fallback: string,
  fetchFn: FetchFn,
): Promise<T> {
  const res = await fetchFn(url, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
  });
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = json.error?.errors?.[0]?.reason ?? json.error?.status ?? fallback;
    throw new GoogleError(res.status, String(reason));
  }
  return json as T;
}

export async function listTaskLists(
  accessToken: string,
  fetchFn: FetchFn = fetch,
): Promise<{ id: string; title: string }[]> {
  const out: { id: string; title: string }[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      maxResults: '100',
      fields: 'nextPageToken,items(id,title)',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await call<{ items?: { id: string; title: string }[]; nextPageToken?: string }>(
      `${TASKS_API}/users/@me/lists?${params}`,
      accessToken,
      {},
      'task_lists',
      fetchFn,
    );
    out.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}

export function tasksUrl(
  listId: string,
  opts: { updatedMin?: string | null; pageToken?: string | null },
): string {
  const params = new URLSearchParams({
    maxResults: '100',
    showCompleted: 'true',
    showDeleted: 'true',
    showHidden: 'true',
    fields: `nextPageToken,items(${TASK_FIELDS})`,
  });
  if (opts.updatedMin) params.set('updatedMin', opts.updatedMin);
  if (opts.pageToken) params.set('pageToken', opts.pageToken);
  return `${TASKS_API}/lists/${encodeURIComponent(listId)}/tasks?${params}`;
}

function taskUrl(listId: string, taskId?: string): string {
  const base = `${TASKS_API}/lists/${encodeURIComponent(listId)}/tasks`;
  return taskId ? `${base}/${encodeURIComponent(taskId)}` : base;
}

/** Google keeps only the date of `due`; midnight UTC is the documented form. */
export const dueFor = (date: string) => `${date}T00:00:00.000Z`;

export function insertTask(
  accessToken: string,
  listId: string,
  task: { title: string; due: string | null },
  fetchFn: FetchFn = fetch,
): Promise<GTask & { etag: string }> {
  return call(
    `${taskUrl(listId)}?fields=${TASK_FIELDS}`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ title: task.title, ...(task.due ? { due: dueFor(task.due) } : {}) }),
    },
    'insert_failed',
    fetchFn,
  );
}

export interface TaskPatch {
  title?: string;
  /** A date, or null to move the task to no date. */
  due?: string | null;
  status?: 'needsAction' | 'completed';
}

export function patchTask(
  accessToken: string,
  listId: string,
  taskId: string,
  patch: TaskPatch,
  fetchFn: FetchFn = fetch,
): Promise<GTask & { etag: string }> {
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.due !== undefined) body.due = patch.due === null ? null : dueFor(patch.due);
  if (patch.status) {
    body.status = patch.status;
    // Reopening a task must clear its completion time too.
    if (patch.status === 'needsAction') body.completed = null;
  }
  return call(
    `${taskUrl(listId, taskId)}?fields=${TASK_FIELDS}`,
    accessToken,
    { method: 'PATCH', body: JSON.stringify(body) },
    'patch_failed',
    fetchFn,
  );
}

/** Deletes one task. One that is already gone counts as deleted. */
export async function deleteTask(
  accessToken: string,
  listId: string,
  taskId: string,
  fetchFn: FetchFn = fetch,
): Promise<void> {
  try {
    await call(
      taskUrl(listId, taskId),
      accessToken,
      { method: 'DELETE' },
      'delete_failed',
      fetchFn,
    );
  } catch (err) {
    if (err instanceof GoogleError && (err.status === 404 || err.status === 410)) return;
    throw err;
  }
}
