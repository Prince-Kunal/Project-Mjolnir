import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  enqueueTick,
  forgetTick,
  isNetworkError,
  loadQueueCount,
  type QueuedTick,
  replayTicks,
  useOfflineQueue,
} from './offlineTicks.ts';

const tick = (itemId: string, done = true, userId = 'u1'): QueuedTick => ({
  itemId,
  userId,
  title: `Task ${itemId}`,
  done,
  actualMinutes: null,
  at: new Date().toISOString(),
});

async function drain() {
  await replayTicks('u1', () => Promise.resolve());
  await replayTicks('u2', () => Promise.resolve());
}

describe('offline ticks', () => {
  beforeEach(drain);

  it('keeps one entry per item, the latest winning', async () => {
    await enqueueTick(tick('a', true));
    await enqueueTick(tick('a', false));
    await enqueueTick(tick('b'));
    expect(useOfflineQueue.getState().waiting).toBe(2);
    const sent: string[] = [];
    await replayTicks('u1', (t) => (sent.push(`${t.itemId}:${t.done}`), Promise.resolve()));
    expect(sent).toEqual(['a:false', 'b:true']);
    expect(useOfflineQueue.getState().waiting).toBe(0);
  });

  it('a tick that reached the server replaces a queued one', async () => {
    await enqueueTick(tick('a'));
    await forgetTick('a');
    await loadQueueCount();
    expect(useOfflineQueue.getState().waiting).toBe(0);
  });

  it('stops at the first network failure and keeps the rest for later', async () => {
    await enqueueTick(tick('a'));
    await enqueueTick(tick('b'));
    const send = vi.fn().mockRejectedValue(new Error('TypeError: Failed to fetch'));
    expect(await replayTicks('u1', send)).toEqual({ saved: 0, refused: [] });
    expect(send).toHaveBeenCalledTimes(1);
    expect(useOfflineQueue.getState().waiting).toBe(2);
  });

  it('drops ticks the server refuses and reports them', async () => {
    await enqueueTick(tick('a'));
    const result = await replayTicks('u1', () => Promise.reject(new Error('this item is closed')));
    expect(result.refused.map((r) => r.error)).toEqual(['this item is closed']);
    expect(useOfflineQueue.getState().waiting).toBe(0);
  });

  it('never replays another account’s ticks', async () => {
    await enqueueTick(tick('a', true, 'u2'));
    const send = vi.fn().mockResolvedValue(undefined);
    await replayTicks('u1', send);
    expect(send).not.toHaveBeenCalled();
    expect(useOfflineQueue.getState().waiting).toBe(1);
  });

  it('recognises network errors', () => {
    expect(isNetworkError(new Error('TypeError: Failed to fetch'))).toBe(true);
    expect(isNetworkError(new Error('Load failed'))).toBe(true);
    expect(isNetworkError(new Error('this item is closed'))).toBe(false);
  });
});
