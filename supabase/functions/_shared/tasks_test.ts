import { assertEquals, assertRejects } from '@std/assert';
import { GoogleError } from './google.ts';
import { deleteTask, insertTask, listTaskLists, patchTask, TASKS_API, tasksUrl } from './tasks.ts';
import { fakeFetch } from './testing.ts';

Deno.test('task lists are read across pages', async () => {
  const fetchFn = fakeFetch({
    [`${TASKS_API}/users/@me/lists`]: (req) =>
      Response.json(
        req.url.searchParams.get('pageToken')
          ? { items: [{ id: 'l2', title: 'Work' }] }
          : { items: [{ id: 'l1', title: 'My Tasks' }], nextPageToken: 'n' },
      ),
  });
  assertEquals(await listTaskLists('at', fetchFn), [
    { id: 'l1', title: 'My Tasks' },
    { id: 'l2', title: 'Work' },
  ]);
});

Deno.test('the poll includes completed, deleted and hidden tasks', () => {
  const url = new URL(tasksUrl('list 1', { updatedMin: '2026-10-20T13:00:00Z' }));
  assertEquals(url.pathname, '/tasks/v1/lists/list%201/tasks');
  for (const p of ['showCompleted', 'showDeleted', 'showHidden'])
    assertEquals(url.searchParams.get(p), 'true');
  assertEquals(url.searchParams.get('updatedMin'), '2026-10-20T13:00:00Z');
});

Deno.test('new tasks get a date-only due date', async () => {
  let body = '';
  const fetchFn = fakeFetch({
    [`${TASKS_API}/lists/l1/tasks`]: (req) => (
      (body = req.body),
      Response.json({ id: 't1', etag: '"1"' })
    ),
  });
  await insertTask('at', 'l1', { title: 'Read paper', due: '2026-10-21' }, fetchFn);
  assertEquals(JSON.parse(body), { title: 'Read paper', due: '2026-10-21T00:00:00.000Z' });
});

Deno.test('reopening a task clears its completion time; no date clears the due date', async () => {
  const bodies: unknown[] = [];
  const fetchFn = fakeFetch({
    [`${TASKS_API}/lists/l1/tasks/t1`]: (req) => (
      bodies.push(JSON.parse(req.body)),
      Response.json({ id: 't1', etag: '"2"' })
    ),
  });
  await patchTask('at', 'l1', 't1', { status: 'needsAction' }, fetchFn);
  await patchTask('at', 'l1', 't1', { due: null }, fetchFn);
  assertEquals(bodies, [{ status: 'needsAction', completed: null }, { due: null }]);
});

Deno.test('deleting a task already gone is fine; other failures surface', async () => {
  const gone = fakeFetch({
    [`${TASKS_API}/lists/l1/tasks/t1`]: () => new Response('{}', { status: 404 }),
  });
  await deleteTask('at', 'l1', 't1', gone);
  const denied = fakeFetch({
    [`${TASKS_API}/lists/l1/tasks/t1`]: () =>
      Response.json({ error: { errors: [{ reason: 'forbidden' }] } }, { status: 403 }),
  });
  await assertRejects(() => deleteTask('at', 'l1', 't1', denied), GoogleError);
});
