// worker: drains the queues (plan 8.2). Woken by the SQL dispatcher through pg_net, answers at
// once, and works in the background until it has used 100 seconds of the 150-second limit.
import { timingSafeEqual } from "../_shared/crypto.ts";
import { json } from "../_shared/http.ts";

export interface QueueMessage {
  msg_id: number;
  read_ct: number;
  message: Record<string, unknown>;
}

/** Thrown by a handler for a message it can never process; it goes straight to dead jobs. */
export class BadMessage extends Error {}

/** Handles one message; returns a short outcome for the log. Throwing leaves it for a retry. */
export type JobHandler = (
  message: Record<string, unknown>,
  deadline: number,
) => Promise<string>;

export interface WorkerDeps {
  secret: string;
  read(
    queue: string,
    visibilitySeconds: number,
    qty: number,
  ): Promise<QueueMessage[]>;
  remove(queue: string, msgId: number): Promise<void>;
  dead(queue: string, msg: QueueMessage, error: string): Promise<void>;
  /** One handler per queue, drained in this order. */
  handlers: Record<string, JobHandler>;
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
    let read = 0;
    for (const [queue, handle] of Object.entries(deps.handlers)) {
      if (now() >= stopAt) break;
      const batch = await deps.read(queue, VISIBILITY_SECONDS, BATCH);
      read += batch.length;
      for (const msg of batch) {
        if (now() >= stopAt) break; // unread work reappears after the visibility timeout
        if (msg.read_ct > MAX_ATTEMPTS) {
          await deps.dead(queue, msg, "too_many_attempts");
          continue;
        }
        try {
          const outcome = await handle(
            msg.message,
            Math.min(stopAt, now() + JOB_BUDGET_MS),
          );
          await deps.remove(queue, msg.msg_id);
          log(`${queue} ${msg.msg_id} ${outcome}`);
          handled++;
        } catch (err) {
          if (err instanceof BadMessage) {
            await deps.dead(queue, msg, `bad_message: ${err.message}`);
            continue;
          }
          // Left in the queue: it becomes visible again after the timeout and is retried.
          log(
            `${queue} ${msg.msg_id} error ${
              err instanceof Error ? err.message : "unknown"
            }`,
          );
        }
      }
    }
    if (read === 0) break;
  }
  return { handled };
}

export function createWorker(
  deps: WorkerDeps,
  waitUntil: (p: Promise<unknown>) => void,
) {
  return (req: Request): Response => {
    const given = req.headers.get("x-worker-secret") ?? "";
    if (!timingSafeEqual(given, deps.secret)) {
      return json({ error: "unauthorized" }, 401);
    }
    waitUntil(drain(deps));
    return json({ accepted: true }, 202);
  };
}
