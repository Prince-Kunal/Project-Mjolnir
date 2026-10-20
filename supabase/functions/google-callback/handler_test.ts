import { assertEquals } from '@std/assert';
import {
  CALENDAR_API,
  GOOGLE_TOKEN_URL,
  SCOPE_CALENDAR_LIST,
  SCOPE_EVENTS,
} from '../_shared/google.ts';
import { fakeFetch, idToken } from '../_shared/testing.ts';
import {
  AccountInUseError,
  type CallbackDeps,
  handleCallback,
  type SaveAccountArgs,
} from './handler.ts';

const FULL_SCOPE = `openid email ${SCOPE_EVENTS} ${SCOPE_CALENDAR_LIST}`;

function setup(opts: { scope?: string; tokenStatus?: number; accountInUse?: boolean } = {}) {
  const states = new Map([['nonce-1', { user_id: 'u1', code_verifier: 'ver-1' }]]);
  const saved: SaveAccountArgs[] = [];
  const calendars: unknown[] = [];
  const fetchFn = fakeFetch({
    [GOOGLE_TOKEN_URL]: () =>
      opts.tokenStatus
        ? Response.json({ error: 'invalid_grant' }, { status: opts.tokenStatus })
        : Response.json({
            access_token: 'at-1',
            refresh_token: 'rt-1',
            expires_in: 3600,
            scope: opts.scope ?? FULL_SCOPE,
            id_token: idToken({ sub: 'g-sub', email: 'a@gmail.com' }),
          }),
    [`${CALENDAR_API}/users/me/calendarList`]: () =>
      Response.json({
        items: [{ id: 'a@gmail.com', summary: 'A', primary: true, accessRole: 'owner' }],
      }),
  });
  const deps: CallbackDeps = {
    appUrl: 'http://app.test',
    cfg: { clientId: 'cid', clientSecret: 'cs', redirectUri: 'http://cb.test' },
    fetchFn,
    now: () => new Date('2026-10-20T10:00:00Z'),
    consumeState: (nonce) => {
      const s = states.get(nonce) ?? null;
      states.delete(nonce);
      return Promise.resolve(s);
    },
    saveAccount: (a) => {
      if (opts.accountInUse) return Promise.reject(new AccountInUseError());
      saved.push(a);
      return Promise.resolve();
    },
    upsertCalendars: (_u, c) => {
      calendars.push(...c);
      return Promise.resolve();
    },
    encrypt: (s) => Promise.resolve(`enc(${s})`),
  };
  return { deps, saved, calendars, fetchFn, states };
}

const cb = (q: string) => new URL(`http://localhost/functions/v1/google-callback?${q}`);

Deno.test(
  'a valid callback stores encrypted tokens, lists calendars and returns to the app',
  async () => {
    const { deps, saved, calendars, fetchFn } = setup();
    const res = await handleCallback(cb('code=c1&state=nonce-1'), deps);
    assertEquals(res.status, 302);
    assertEquals(res.headers.get('location'), 'http://app.test/google/connected?status=ok');
    assertEquals(saved, [
      {
        userId: 'u1',
        googleSub: 'g-sub',
        email: 'a@gmail.com',
        scopes: FULL_SCOPE.split(' '),
        refreshTokenEnc: 'enc(rt-1)',
        accessTokenEnc: 'enc(at-1)',
        accessExpiresAt: '2026-10-20T11:00:00.000Z',
      },
    ]);
    assertEquals(calendars.length, 1);
    assertEquals(new URLSearchParams(fetchFn.calls[0]!.body).get('code_verifier'), 'ver-1');
  },
);

Deno.test('the redirect back to the app never carries a token', async () => {
  const { deps } = setup();
  const res = await handleCallback(cb('code=c1&state=nonce-1'), deps);
  const location = res.headers.get('location')!;
  for (const secret of ['at-1', 'rt-1', 'ver-1', 'c1']) {
    assertEquals(location.includes(secret), false);
  }
});

Deno.test('a state can be used once', async () => {
  const { deps } = setup();
  await handleCallback(cb('code=c1&state=nonce-1'), deps);
  const res = await handleCallback(cb('code=c1&state=nonce-1'), deps);
  assertEquals(
    res.headers.get('location'),
    'http://app.test/google/connected?status=error&reason=invalid_state',
  );
});

Deno.test('an unknown state is rejected without calling Google', async () => {
  const { deps, fetchFn } = setup();
  const res = await handleCallback(cb('code=c1&state=forged'), deps);
  assertEquals(
    res.headers.get('location'),
    'http://app.test/google/connected?status=error&reason=invalid_state',
  );
  assertEquals(fetchFn.calls.length, 0);
});

Deno.test('declining consent returns to the app and burns the state', async () => {
  const { deps, states } = setup();
  const res = await handleCallback(cb('error=access_denied&state=nonce-1'), deps);
  assertEquals(
    res.headers.get('location'),
    'http://app.test/google/connected?status=error&reason=denied',
  );
  assertEquals(states.size, 0);
});

Deno.test('unticked calendar scopes are reported, and nothing is stored', async () => {
  const { deps, saved } = setup({ scope: `openid email ${SCOPE_CALENDAR_LIST}` });
  const res = await handleCallback(cb('code=c1&state=nonce-1'), deps);
  assertEquals(
    res.headers.get('location'),
    'http://app.test/google/connected?status=error&reason=missing_scopes',
  );
  assertEquals(saved.length, 0);
});

Deno.test('a failed code exchange is reported', async () => {
  const { deps } = setup({ tokenStatus: 400 });
  const res = await handleCallback(cb('code=c1&state=nonce-1'), deps);
  assertEquals(
    res.headers.get('location'),
    'http://app.test/google/connected?status=error&reason=token_exchange',
  );
});

Deno.test('a Google account already linked to another user is reported', async () => {
  const { deps, calendars } = setup({ accountInUse: true });
  const res = await handleCallback(cb('code=c1&state=nonce-1'), deps);
  assertEquals(
    res.headers.get('location'),
    'http://app.test/google/connected?status=error&reason=account_in_use',
  );
  assertEquals(calendars.length, 0);
});
