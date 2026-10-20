import { assertEquals } from '@std/assert';
import type { SyncOutcome } from '../_shared/sync/run.ts';
import {
  createWorker,
  drain,
  JOB_BUDGET_MS,
  type QueueMessage,
  type WorkerDeps,
  WORKER_BUDGET_MS,
} from './handler.ts';

function setup(
  batches: QueueMessage[][],
  sync: (id: string) => Promise<SyncOutcome> = () => Promise.resolve('done'),
) {
  const log: string[] = [];
  let clock = 0;
  const deps: WorkerDeps = {
    secret: 's3cret',
    now: () => clock,
    log: () => {},
    read: () => Promise.resolve(batches.shift() ?? []),
    remove: (_q, id) => {
      log.push(`remove ${id}`);
      return Promise.resolve();
    },
    dead: (_q, msg, error) => {
      log.push(`dead ${msg.msg_id} ${error}`);
      return Promise.resolve();
    },
    syncSource: (id, deadline) => {
      log.push(`sync ${id} budget ${deadline - clock}`);
      return sync(id);
    },
  };
  return { deps, log, tick: (ms: number) => (clock += ms) };
}

const msg = (id: number, read_ct = 1, source = `cal-${id}`): QueueMessage => ({
  msg_id: id,
  read_ct,
  message: { source_id: source },
});

Deno.test('drains batches until the queue is empty and removes handled messages', async () => {
  const { deps, log } = setup([[msg(1), msg(2)], [msg(3)]]);
  assertEquals(await drain(deps), { handled: 3 });
  assertEquals(log, [
    `sync cal-1 budget ${JOB_BUDGET_MS}`,
    'remove 1',
    `sync cal-2 budget ${JOB_BUDGET_MS}`,
    'remove 2',
    `sync cal-3 budget ${JOB_BUDGET_MS}`,
    'remove 3',
  ]);
});

Deno.test('a message read more than 5 times goes to dead jobs', async () => {
  const { deps, log } = setup([[msg(1, 6)]]);
  await drain(deps);
  assertEquals(log, ['dead 1 too_many_attempts']);
});

Deno.test('a failing job stays in the queue for retry', async () => {
  const { deps, log } = setup([[msg(1), msg(2)]], (id) =>
    id === 'cal-1' ? Promise.reject(new Error('boom')) : Promise.resolve('done'),
  );
  assertEquals(await drain(deps), { handled: 1 });
  assertEquals(
    log.filter((l) => l.startsWith('remove')),
    ['remove 2'],
  );
});

Deno.test('stops taking messages after the 100-second budget', async () => {
  const { deps, log, tick } = setup([[msg(1), msg(2)], [msg(3)]], () => {
    tick(WORKER_BUDGET_MS - 1000);
    return Promise.resolve('continued');
  });
  await drain(deps);
  assertEquals(log.filter((l) => l.startsWith('sync')).length, 2);
  assertEquals(log.at(-1), 'remove 2');
});

Deno.test('the last job of a run gets only the time left', async () => {
  const { deps, log, tick } = setup([[msg(1), msg(2)]], (id) => {
    if (id === 'cal-1') tick(WORKER_BUDGET_MS - 10_000);
    return Promise.resolve('done');
  });
  await drain(deps);
  assertEquals(log[2], 'sync cal-2 budget 10000');
});

Deno.test('the HTTP handler rejects a wrong secret and answers 202 at once otherwise', async () => {
  const started: Promise<unknown>[] = [];
  const { deps } = setup([]);
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
  assertEquals(started.length, 1);
  await Promise.all(started);
});
