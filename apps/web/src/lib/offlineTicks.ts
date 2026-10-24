// Offline ticks (section 6: IndexedDB queue, replayed on reconnect). A tick that cannot reach the
// server is kept here, one entry per item (the latest wins), and sent when the browser is back
// online or the app next starts.
import { createStore, get, set, type UseStore } from 'idb-keyval';
import { create } from 'zustand';

export interface QueuedTick {
  itemId: string;
  /** Whose session made it: a queue is never replayed into another account. */
  userId: string;
  title: string;
  done: boolean;
  actualMinutes: number | null;
  at: string;
}

const KEY = 'ticks';
let store: UseStore | null = null;
const db = () => (store ??= createStore('mjolnir-offline', 'queue'));

/** How many ticks are waiting, for the offline banner. */
export const useOfflineQueue = create<{ waiting: number }>(() => ({ waiting: 0 }));

// Reads and writes run one at a time, so a replay never races an enqueue.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

async function read(): Promise<QueuedTick[]> {
  return (await get<QueuedTick[]>(KEY, db())) ?? [];
}

async function write(ticks: QueuedTick[]) {
  await set(KEY, ticks, db());
  useOfflineQueue.setState({ waiting: ticks.length });
}

export function enqueueTick(tick: QueuedTick): Promise<void> {
  return serial(async () => {
    const ticks = (await read()).filter((t) => t.itemId !== tick.itemId);
    await write([...ticks, tick]);
  });
}

/** A tick that reached the server supersedes any older one still queued for the item. */
export function forgetTick(itemId: string): Promise<void> {
  return serial(async () => {
    const ticks = await read();
    if (ticks.some((t) => t.itemId === itemId))
      await write(ticks.filter((t) => t.itemId !== itemId));
  });
}

/** True when an error means the request never reached the server. */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /failed to fetch|networkerror|load failed|fetch failed|network request failed/i.test(
    message,
  );
}

/**
 * Sends this user's queued ticks in the order they were made. Ticks the server refuses (the day
 * closed meanwhile, say) are dropped and returned; network failures stay for the next try.
 */
export function replayTicks(
  userId: string,
  send: (tick: QueuedTick) => Promise<void>,
): Promise<{ saved: number; refused: { tick: QueuedTick; error: string }[] }> {
  return serial(async () => {
    const ticks = await read();
    const keep: QueuedTick[] = [];
    const refused: { tick: QueuedTick; error: string }[] = [];
    let saved = 0;
    let offline = false;
    for (const tick of ticks) {
      if (tick.userId !== userId || offline) {
        keep.push(tick);
        continue;
      }
      try {
        await send(tick);
        saved++;
      } catch (err) {
        if (isNetworkError(err)) {
          offline = true;
          keep.push(tick);
        } else {
          refused.push({ tick, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }
    await write(keep);
    return { saved, refused };
  });
}

/** Loads the waiting count at start-up. */
export function loadQueueCount(): Promise<void> {
  return serial(async () => useOfflineQueue.setState({ waiting: (await read()).length }));
}
