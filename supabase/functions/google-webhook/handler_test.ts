import { assertEquals } from '@std/assert';
import { sha256Hex } from '../_shared/crypto.ts';
import { handleWebhook, type WebhookChannel, type WebhookDeps } from './handler.ts';

const ID = '11111111-2222-4333-8444-555555555555';

async function setup(channel: Partial<WebhookChannel> | null = {}) {
  const queued: string[] = [];
  const stored: WebhookChannel | null = channel && {
    calendar_id: 'cal-1',
    token_hash: await sha256Hex('right-token'),
    stopped_at: null,
    ...channel,
  };
  const deps: WebhookDeps = {
    channel: (id) => Promise.resolve(id === ID ? stored : null),
    queueSync: (c) => {
      queued.push(c);
      return Promise.resolve();
    },
    hash: sha256Hex,
  };
  return { deps, queued };
}

const notify = (headers: Record<string, string>) =>
  new Request('http://x/google-webhook', { method: 'POST', headers });
const good = {
  'x-goog-channel-id': ID,
  'x-goog-channel-token': 'right-token',
  'x-goog-resource-state': 'exists',
};

Deno.test('a change notification with the right token queues a sync', async () => {
  const { deps, queued } = await setup();
  assertEquals((await handleWebhook(notify(good), deps)).status, 200);
  assertEquals(queued, ['cal-1']);
});

Deno.test('a wrong token is rejected and queues nothing', async () => {
  const { deps, queued } = await setup();
  const res = await handleWebhook(notify({ ...good, 'x-goog-channel-token': 'wrong' }), deps);
  assertEquals(res.status, 401);
  assertEquals(queued, []);
});

Deno.test('the first "sync" message is acknowledged and ignored', async () => {
  const { deps, queued } = await setup();
  assertEquals(
    (await handleWebhook(notify({ ...good, 'x-goog-resource-state': 'sync' }), deps)).status,
    200,
  );
  assertEquals(queued, []);
});

Deno.test('unknown, malformed or stopped channels are refused', async () => {
  const { deps } = await setup();
  assertEquals(
    (await handleWebhook(notify({ ...good, 'x-goog-channel-id': 'not-a-uuid' }), deps)).status,
    404,
  );
  assertEquals(
    (await handleWebhook(notify({ ...good, 'x-goog-channel-id': crypto.randomUUID() }), deps))
      .status,
    404,
  );
  const stopped = await setup({ stopped_at: '2026-10-21T00:00:00Z' });
  assertEquals((await handleWebhook(notify(good), stopped.deps)).status, 404);
});

Deno.test('only POST is accepted', async () => {
  const { deps } = await setup();
  assertEquals((await handleWebhook(new Request('http://x/google-webhook'), deps)).status, 405);
});
