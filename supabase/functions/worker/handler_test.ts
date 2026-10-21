import { assertEquals } from '@std/assert';
import {
  BadMessage,
  createWorker,
  drain,
  JOB_BUDGET_MS,
  type JobHandler,
  type QueueMessage,
  type WorkerDeps,
  WORKER_BUDGET_MS,
} from './handler.ts';

function setup(
  queues: Record<string, QueueMessage[][]>,
  handler: (queue: string) => JobHandler = () => () => Promise.resolve('done'),
) {
  const log: string[] = [];
  let clock = 0;
  const handlers: Record<string, JobHandler> = {};
  for (const q of Object.keys(queues)) {
    const h = handler(q);
    handlers[q] = (m, deadline) => {
      log.push(`${q} ${JSON.stringify(m)} budget ${deadline - clock}`);
      return h(m, deadline);
    };
  }
  const deps: WorkerDeps = {
    secret: 's3cret',
    now: () => clock,
    log: () => {},
    read: (q) => Promise.resolve(queues[q]!.shift() ?? []),
    remove: (q, id) => {
      log.push(`remove ${q} ${id}`);
      return Promise.resolve();
    },
    dead: (q, msg, error) => {
      log.push(`dead ${q} ${msg.msg_id} ${error}`);
      return Promise.resolve();
    },
    handlers,
  };
  return { deps, log, tick: (ms: number) => (clock += ms) };
}

const msg = (
  id: number,
  message: Record<string, unknown> = { source_id: `cal-${id}` },
  read_ct = 1,
): QueueMessage => ({
  msg_id: id,
  read_ct,
  message,
});

Deno.test('drains every queue until all are empty and removes handled messages', async () => {
  const { deps, log } = setup({
    sync_jobs: [[msg(1), msg(2)], [msg(3)]],
    jobs: [[msg(10, { kind: 'watch' })]],
  });
  assertEquals(await drain(deps), { handled: 4 });
  assertEquals(
    log.filter((l) => l.startsWith('remove')),
    ['remove sync_jobs 1', 'remove sync_jobs 2', 'remove jobs 10', 'remove sync_jobs 3'],
  );
  assertEquals(log[0], `sync_jobs {"source_id":"cal-1"} budget ${JOB_BUDGET_MS}`);
});

Deno.test('a message read more than 5 times goes to dead jobs', async () => {
  const { deps, log } = setup({ sync_jobs: [[msg(1, { source_id: 'x' }, 6)]] });
  await drain(deps);
  assertEquals(log, ['dead sync_jobs 1 too_many_attempts']);
});

Deno.test('a malformed message goes to dead jobs at once', async () => {
  const { deps, log } = setup(
    { jobs: [[msg(1, { kind: 'nope' })]] },
    () => () => Promise.reject(new BadMessage('kind nope')),
  );
  await drain(deps);
  assertEquals(log.at(-1), 'dead jobs 1 bad_message: kind nope');
});

Deno.test('a failing job stays in the queue for retry', async () => {
  const { deps, log } = setup(
    { sync_jobs: [[msg(1), msg(2)]] },
    () => (m) =>
      m.source_id === 'cal-1' ? Promise.reject(new Error('boom')) : Promise.resolve('done'),
  );
  assertEquals(await drain(deps), { handled: 1 });
  assertEquals(
    log.filter((l) => l.startsWith('remove')),
    ['remove sync_jobs 2'],
  );
});

Deno.test('stops taking messages after the 100-second budget', async () => {
  let tick = (_: number) => 0;
  const s = setup({ sync_jobs: [[msg(1), msg(2)], [msg(3)]] }, () => () => {
    tick(WORKER_BUDGET_MS - 1000);
    return Promise.resolve('continued');
  });
  tick = s.tick;
  await drain(s.deps);
  assertEquals(s.log.filter((l) => l.startsWith('sync_jobs')).length, 2);
});

Deno.test('the HTTP handler rejects a wrong secret and answers 202 at once otherwise', async () => {
  const started: Promise<unknown>[] = [];
  const { deps } = setup({ sync_jobs: [] });
  const handler = createWorker(deps, (p) => started.push(p));
  const bad = handler(
    new Request('http://x/worker', { method: 'POST', headers: { 'x-worker-secret': 'nope' } }),
  );
  assertEquals(bad.status, 401);
  assertEquals(started.length, 0);
  const ok = handler(
    new Request('http://x/worker', { method: 'POST', headers: { 'x-worker-secret': 's3cret' } }),
  );
  assertEquals(ok.status, 202);
  await Promise.all(started);
});
