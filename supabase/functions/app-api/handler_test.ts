import { assertEquals, assertMatch } from '@std/assert';
import { pkceChallenge } from '../_shared/crypto.ts';
import { type AppApiDeps, createAppApi } from './handler.ts';

function setup(user: { id: string; email: string | null } | null = { id: 'u1', email: 'a@x.com' }) {
  const states: { userId: string; nonce: string; verifier: string }[] = [];
  const deps: AppApiDeps = {
    appUrl: 'http://app.test',
    cfg: { clientId: 'cid', clientSecret: 'cs', redirectUri: 'http://cb.test' },
    authenticate: () => Promise.resolve(user),
    saveOAuthState: (userId, nonce, verifier) => {
      states.push({ userId, nonce, verifier });
      return Promise.resolve();
    },
  };
  return { api: createAppApi(deps), states };
}

const url = (path: string) => `http://localhost/functions/v1/app-api${path}`;

Deno.test('POST /google/connect stores a state and returns a consent URL bound to it', async () => {
  const { api, states } = setup();
  const res = await api(new Request(url('/google/connect'), { method: 'POST' }));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('access-control-allow-origin'), 'http://app.test');

  const consent = new URL((await res.json()).url);
  assertEquals(states.length, 1);
  assertEquals(states[0]!.userId, 'u1');
  assertEquals(consent.searchParams.get('state'), states[0]!.nonce);
  assertEquals(
    consent.searchParams.get('code_challenge'),
    await pkceChallenge(states[0]!.verifier),
  );
  assertEquals(consent.searchParams.get('login_hint'), 'a@x.com');
  assertMatch(states[0]!.verifier, /^[A-Za-z0-9_-]{43,128}$/);
});

Deno.test('the consent URL never carries the PKCE verifier', async () => {
  const { api, states } = setup();
  const res = await api(new Request(url('/google/connect'), { method: 'POST' }));
  const body = await res.text();
  assertEquals(body.includes(states[0]!.verifier), false);
});

Deno.test('requests without a signed-in user are rejected', async () => {
  const { api, states } = setup(null);
  const res = await api(new Request(url('/google/connect'), { method: 'POST' }));
  assertEquals(res.status, 401);
  assertEquals(states.length, 0);
});

Deno.test('CORS preflight is answered without auth', async () => {
  const { api } = setup(null);
  const res = await api(new Request(url('/google/connect'), { method: 'OPTIONS' }));
  assertEquals(res.status, 204);
  assertEquals(res.headers.get('access-control-allow-origin'), 'http://app.test');
});

Deno.test('unknown routes return 404', async () => {
  const { api } = setup();
  assertEquals((await api(new Request(url('/nope'), { method: 'POST' }))).status, 404);
  assertEquals((await api(new Request(url('/google/connect'), { method: 'GET' }))).status, 404);
});
