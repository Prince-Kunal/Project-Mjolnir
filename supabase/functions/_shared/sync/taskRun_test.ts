import { assertEquals } from '@std/assert';
import { TASKS_API } from '../tasks.ts';
import { fakeFetch } from '../testing.ts';
import { syncTaskList, type TaskLease, type TaskStore } from './taskRun.ts';
import type { GTask, TaskOp } from './tasks.ts';

const NOW = new Date('2026-10-20T19:00:00+05:30');
const LIST_URL = `${TASKS_API}/lists/list-1/tasks`;

const lease = (over: Partial<TaskLease> = {}): TaskLease => ({
  source_id: 'L1',
  user_id: 'u1',
  google_tasklist_id: 'list-1',
  run_kind: 'full',
  run_started_at: NOW.toISOString(),
  updated_min: null,
  page_token: null,
  attempts: 0,
  points: 1,
  since: '2026-10-01',
  profile: { timezone: 'Asia/Kolkata', day_boundary_hour: 4 },
  ...over,
});

const task = (id: string, over: Partial<GTask> = {}): GTask => ({
  id,
  etag: `"${id}"`,
  title: `Task ${id}`,
  status: 'needsAction',
  due: '2026-10-20T00:00:00.000Z',
  ...over,
});

function setup(
  pages: Record<string, { items: GTask[]; nextPageToken?: string } | number>,
  o: { lease?: TaskLease | null; skipped?: number; deadline?: number } = {},
) {
  const log: string[] = [];
  const store: TaskStore = {
    lease: () => Promise.resolve(o.lease === undefined ? lease() : o.lease),
    items: () => Promise.resolve([]),
    apply: (_l, ops: TaskOp[]) => {
      log.push(`apply ${ops.map((op) => op.op).join(',')}`);
      return Promise.resolve({ applied: ops.length, skipped: o.skipped ?? 0 });
    },
    checkpoint: (_l, page) => (log.push(`checkpoint ${page}`), Promise.resolve()),
    finish: () => (log.push('finish'), Promise.resolve()),
    fail: (_l, err, retry) => (log.push(`fail ${err} ${retry}`), Promise.resolve()),
  };
  const fetchFn = fakeFetch({
    [LIST_URL]: (req) => {
      const params = req.url.searchParams;
      log.push(`list ${params.get('pageToken') ?? '-'} ${params.get('updatedMin') ?? '-'}`);
      const page = pages[params.get('pageToken') ?? 'first']!;
      return typeof page === 'number' ? new Response('{}', { status: page }) : Response.json(page);
    },
  });
  const run = () =>
    syncTaskList('L1', {
      store,
      accessToken: () => Promise.resolve('at'),
      fetchFn,
      now: () => NOW,
      deadline: o.deadline ?? NOW.getTime() + 60_000,
    });
  return { run, log };
}

Deno.test(
  'a full run reads every page, completed and deleted tasks included, then finishes',
  async () => {
    const { run, log } = setup({
      first: { items: [task('a')], nextPageToken: 'p2' },
      p2: { items: [task('b')] },
    });
    assertEquals(await run(), 'done');
    assertEquals(log, ['list - -', 'apply create', 'list p2 -', 'apply create', 'finish']);
  },
);

Deno.test('a poll asks only for tasks updated since the last run', async () => {
  const { run, log } = setup(
    { first: { items: [] } },
    { lease: lease({ run_kind: 'incremental', updated_min: '2026-10-20T13:00:00Z' }) },
  );
  assertEquals(await run(), 'done');
  assertEquals(log[0], 'list - 2026-10-20T13:00:00Z');
});

Deno.test('rate limits retry with backoff; a gone list waits for the next poll', async () => {
  assertEquals(await setup({ first: 429 }).run(), 'retry');
  const limited = setup({ first: 429 });
  await limited.run();
  assertEquals(limited.log.at(-1), 'fail google_429 30');
  const gone = setup({ first: 404 });
  await gone.run();
  assertEquals(gone.log.at(-1), 'fail google_404 600');
});

Deno.test('a page planned against stale items is run again', async () => {
  const { run, log } = setup({ first: { items: [task('a')] } }, { skipped: 1 });
  assertEquals(await run(), 'continued');
  assertEquals(log.at(-1), 'checkpoint null');
});

Deno.test('a run out of time saves its place', async () => {
  const { run, log } = setup({ first: { items: [] } }, { deadline: NOW.getTime() });
  assertEquals(await run(), 'continued');
  assertEquals(log, ['checkpoint null']);
});

Deno.test('a list that cannot sync (not Tasks mode, disabled) is skipped', async () => {
  assertEquals(await setup({}, { lease: null }).run(), 'skipped');
});
