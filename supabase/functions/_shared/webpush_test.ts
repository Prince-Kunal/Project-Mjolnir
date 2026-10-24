import { assert, assertEquals, assertMatch } from '@std/assert';
import { encodeBase64Url } from '@std/encoding/base64url';
import { exportVapidKeys, generateVapidKeys } from '@negrel/webpush';
import { PushSendError } from './push.ts';
import { createSender } from './webpush.ts';

// A browser's side of a subscription: an ECDH P-256 key and a 16-byte auth secret.
async function browserDevice(endpoint: string) {
  const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));
  return {
    endpoint,
    p256dh: encodeBase64Url(raw),
    auth: encodeBase64Url(crypto.getRandomValues(new Uint8Array(16))),
  };
}

async function withFetch(status: number, run: (seen: Request[]) => Promise<void>) {
  const original = globalThis.fetch;
  const seen: Request[] = [];
  globalThis.fetch = (input, init) => {
    seen.push(new Request(input, init));
    return Promise.resolve(new Response(null, { status }));
  };
  try {
    await run(seen);
  } finally {
    globalThis.fetch = original;
  }
}

const vapid = JSON.stringify(
  await exportVapidKeys(await generateVapidKeys({ extractable: true }), {}),
);

Deno.test(
  'the sender encrypts (aes128gcm) and signs (VAPID) a message on this runtime',
  async () => {
    const send = createSender(vapid, 'https://project-mjolnir.pages.dev');
    await withFetch(201, async (seen) => {
      await send(await browserDevice('https://fcm.googleapis.com/fcm/send/abc'), '{"title":"Hi"}', {
        topic: 'morning',
      });
      const req = seen[0]!;
      assertEquals(req.url, 'https://fcm.googleapis.com/fcm/send/abc');
      assertEquals(req.headers.get('content-encoding'), 'aes128gcm');
      assertEquals(req.headers.get('topic'), 'morning');
      assertEquals(req.headers.get('ttl'), '21600');
      assertMatch(
        req.headers.get('authorization') ?? '',
        /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/,
      );
      // Header (86 bytes for a 65-byte key id) plus ciphertext and its 16-byte tag.
      assert((await req.arrayBuffer()).byteLength > 86 + 16);
    });
  },
);

Deno.test('a refusal from the push service carries its status', async () => {
  const send = createSender(vapid, 'https://project-mjolnir.pages.dev');
  await withFetch(410, async () => {
    const err = await send(await browserDevice('https://push.example/x'), '{}', {
      topic: 'test',
    }).catch((e) => e);
    assert(err instanceof PushSendError);
    assertEquals(err.status, 410);
  });
});
