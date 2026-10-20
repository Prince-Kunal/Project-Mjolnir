// worker: drains the queues (plan 8.2). Woken by the SQL dispatcher through pg_net, answers at
// once, and works in the background until it has used 100 seconds of the 150-second limit.
import { timingSafeEqual } from '../_shared/crypto.ts';
import { json } from '../_shared/http.ts';
import type { SyncOutcome } from '../_shared/sync/run.ts';

export interface QueueMessage {
  msg_id: number;
  read_ct: number;
  message: { source_id?: string };
}

export interface WorkerDeps {
  secret: string;
  read(queue: string, visibilitySeconds: number, qty: number): Promise<QueueMessage[]>;
  remove(queue: string, msgId: number): Promise<void>;
  dead(queue: string, msg: QueueMessage, error: string): Promise<void>;
  syncSource(sourceId: string, deadline: number): Promise<SyncOutcome>;
  now?: () => number;
  log?: (line: string) => void;
}

/** Stop taking new messages after this, inside the free plan's 150 s wall clock. */
export const WORKER_BUDGET_MS = 100_000;
/** Each job gets at most this long, under the 60 s visibility timeout. */
export const JOB_BUDGET_MS = 45_000;
export const VISIBILITY_SECONDS = 60;
export const MAX_ATTEMPTS = 5;
const BATCH = 5;

export async function drain(deps: WorkerDeps): Promise<{ handled: number }> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((l: string) => console.log(l));
  const stopAt = now() + WORKER_BUDGET_MS;
  let handled = 0;

  while (now() < stopAt) {
    const batch = await deps.read('sync_jobs', VISIBILITY_SECONDS, BATCH);
    if (batch.length === 0) break;
    for (const msg of batch) {
      if (now() >= stopAt) break; // unread work reappears after the visibility timeout
      const sourceId = msg.message.source_id;
      if (!sourceId || msg.read_ct > MAX_ATTEMPTS) {
        await deps.dead('sync_jobs', msg, sourceId ? 'too_many_attempts' : 'bad_message');
        continue;
      }
      try {
        const outcome = await deps.syncSource(sourceId, Math.min(stopAt, now() + JOB_BUDGET_MS));
        await deps.remove('sync_jobs', msg.msg_id);
        log(`sync ${sourceId} ${outcome}`);
        handled++;
      } catch (err) {
        // Left in the queue: it becomes visible again after the timeout and is retried.
        log(`sync ${sourceId} error ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }
  }
  return { handled };
}

export function createWorker(deps: WorkerDeps, waitUntil: (p: Promise<unknown>) => void) {
  return (req: Request): Response => {
    const given = req.headers.get('x-worker-secret') ?? '';
    if (!timingSafeEqual(given, deps.secret)) return json({ error: 'unauthorized' }, 401);
    waitUntil(drain(deps));
    return json({ accepted: true }, 202);
  };
}
