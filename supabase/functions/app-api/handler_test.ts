import { assertEquals, assertMatch } from '@std/assert';
import { defaultColorRules, setRulePoints } from '@mjolnir/domain';
import { pkceChallenge } from '../_shared/crypto.ts';
import { CALENDAR_API, ReconnectNeededError } from '../_shared/google.ts';
import { fakeFetch } from '../_shared/testing.ts';
import { type AppApiDeps, createAppApi, type PreparedReschedule, RpcError } from './handler.ts';

const ITEM = '00000000-0000-4000-8000-000000000001';
const EVENTS = `${CALENDAR_API}/calendars/me%40x.com/events`;
const rules = setRulePoints(defaultColorRules(), '11', 3);

interface Setup {
  user?: { id: string; email: string | null } | null;
  google?: (body: Record<string, unknown>) => Response;
  inbox?: unknown[];
  token?: () => Promise<string>;
  prepareError?: RpcError;
}

function setup(o: Setup = {}) {
  const log: string[] = [];
  const states: { userId: string; nonce: string; verifier: string }[] = [];
  const fetchFn = fakeFetch({
    [EVENTS]: (req) =>
      (o.google ?? (() => Response.json({ id: 'x', etag: '"e1"' })))(JSON.parse(req.body)),
  });
  let n = 0;
  const deps: AppApiDeps = {
    appUrl: 'http://app.test',
    cfg: { clientId: 'cid', clientSecret: 'cs', redirectUri: 'http://cb.test' },
    fetchFn,
    now: () => new Date('2026-10-21T10:00:00+05:30'),
    authenticate: () =>
      Promise.resolve(o.user === undefined ? { id: 'u1', email: 'a@x.com' } : o.user),
    saveOAuthState: (userId, nonce, verifier) => {
      states.push({ userId, nonce, verifier });
      return Promise.resolve();
    },
    userRpc: <T>(_req: Request, name: string, args?: Record<string, unknown>) => {
      log.push(`rpc ${name} ${JSON.stringify(args ?? {})}`);
      if (name === 'missed_inbox') return Promise.resolve((o.inbox ?? []) as T);
      if (name === 'dismiss_all_missed') return Promise.resolve(3 as T);
      return Promise.resolve(null as T);
    },
    profile: () => Promise.resolve({ timezone: 'Asia/Kolkata', day_boundary_hour: 4 }),
    accessToken: o.token ?? (() => Promise.resolve('at')),
    reschedule: {
      prepare: (_u, itemId, start, end): Promise<PreparedReschedule> => {
        log.push(`prepare ${itemId} ${start} ${end}`);
        if (o.prepareError) return Promise.reject(o.prepareError);
        return Promise.resolve({
          item_id: `new-${++n}`,
          original_id: itemId,
          google_event_id: `0123456789abcdef0123456789abcde${n}`,
          google_calendar_id: 'me@x.com',
          summary: 'PR review #lfx',
          points: 3,
          time_zone: 'Asia/Kolkata',
          tags: ['lfx'],
          color_rules: rules,
        });
      },
      commit: (itemId, etag) => {
        log.push(`commit ${itemId} ${etag}`);
        return Promise.resolve();
      },
      abort: (itemId) => {
        log.push(`abort ${itemId}`);
        return Promise.resolve();
      },
    },
  };
  return { api: createAppApi(deps), states, log, fetchFn };
}

const url = (path: string) => `http://localhost/functions/v1/app-api${path}`;
const post = (path: string, body?: unknown) =>
  new Request(url(path), {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

Deno.test('POST /google/connect stores a state and returns a consent URL bound to it', async () => {
  const { api, states } = setup();
  const res = await api(post('/google/connect'));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('access-control-allow-origin'), 'http://app.test');
  const text = await res.text();
  const consent = new URL(JSON.parse(text).url);
  assertEquals(states.length, 1);
  assertEquals(consent.searchParams.get('state'), states[0]!.nonce);
  assertEquals(
    consent.searchParams.get('code_challenge'),
    await pkceChallenge(states[0]!.verifier),
  );
  assertEquals(consent.searchParams.get('login_hint'), 'a@x.com');
  assertMatch(states[0]!.verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assertEquals(text.includes(states[0]!.verifier), false);
});

Deno.test('requests without a signed-in user are rejected', async () => {
  const { api, states } = setup({ user: null });
  assertEquals((await api(post('/google/connect'))).status, 401);
  assertEquals(states.length, 0);
});

Deno.test('CORS preflight is answered without auth; unknown routes are 404', async () => {
  const { api } = setup({ user: null });
  assertEquals((await api(new Request(url('/google/connect'), { method: 'OPTIONS' }))).status, 204);
  assertEquals((await api(post('/nope'))).status, 404);
  assertEquals((await api(new Request(url('/google/connect')))).status, 404);
});

Deno.test(
  'rescheduling creates the Google event with the title, colour, times and app properties',
  async () => {
    let sent: Record<string, unknown> = {};
    const { api, log } = setup({
      google: (body) => {
        sent = body;
        return Response.json({ id: body.id, etag: '"e1"' });
      },
    });
    const res = await api(
      post(`/missed/${ITEM}/reschedule`, {
        start: '2026-10-22T18:00:00+05:30',
        end: '2026-10-22T20:00:00+05:30',
      }),
    );
    assertEquals(res.status, 201);
    assertEquals(await res.json(), { item_id: 'new-1' });
    assertEquals(sent, {
      id: '0123456789abcdef0123456789abcde1',
      summary: 'PR review #lfx',
      start: { dateTime: '2026-10-22T12:30:00.000Z', timeZone: 'Asia/Kolkata' },
      end: { dateTime: '2026-10-22T14:30:00.000Z', timeZone: 'Asia/Kolkata' },
      colorId: '11',
      extendedProperties: {
        private: { pt_app: '1', pt_item: 'new-1', pt_tags: 'lfx', pt_deadlines: '' },
      },
    });
    assertEquals(log.at(-1), 'commit new-1 "e1"');
  },
);

Deno.test('a Google failure undoes the reschedule', async () => {
  const { api, log } = setup({
    google: () => Response.json({ error: { status: 'FORBIDDEN' } }, { status: 403 }),
  });
  const res = await api(
    post(`/missed/${ITEM}/reschedule`, {
      start: '2026-10-22T18:00:00Z',
      end: '2026-10-22T19:00:00Z',
    }),
  );
  assertEquals(res.status, 502);
  assertEquals(log.at(-1), 'abort new-1');
});

Deno.test('a database refusal is passed on with its status', async () => {
  const { api } = setup({
    prepareError: new RpcError('22023', 'only missed tasks can be rescheduled'),
  });
  const res = await api(
    post(`/missed/${ITEM}/reschedule`, {
      start: '2026-10-22T18:00:00Z',
      end: '2026-10-22T19:00:00Z',
    }),
  );
  assertEquals(res.status, 400);
  assertEquals(await res.json(), { error: 'only missed tasks can be rescheduled' });
});

Deno.test(
  'a Google account needing reconnection is reported before anything is created',
  async () => {
    const { api, log } = setup({ token: () => Promise.reject(new ReconnectNeededError()) });
    const res = await api(
      post(`/missed/${ITEM}/reschedule`, {
        start: '2026-10-22T18:00:00Z',
        end: '2026-10-22T19:00:00Z',
      }),
    );
    assertEquals(res.status, 409);
    assertEquals(log, []);
  },
);

Deno.test('bad times are rejected', async () => {
  const { api } = setup();
  const res = await api(
    post(`/missed/${ITEM}/reschedule`, {
      start: '2026-10-22T19:00:00Z',
      end: '2026-10-22T18:00:00Z',
    }),
  );
  assertEquals(res.status, 400);
});

Deno.test('reschedule all to tomorrow keeps each block at the same local time', async () => {
  const { api, log } = setup({
    inbox: [
      // Missed on the 20th at 18:00 and 01:30 (the latter belongs to the 20th's logical day).
      {
        id: 'a',
        source: 'calendar',
        logical_date: '2026-10-20',
        start_at: '2026-10-20T12:30:00Z',
        end_at: '2026-10-20T14:30:00Z',
      },
      {
        id: 'b',
        source: 'calendar',
        logical_date: '2026-10-20',
        start_at: '2026-10-20T20:00:00Z',
        end_at: '2026-10-20T21:00:00Z',
      },
      { id: 'c', source: 'manual', logical_date: '2026-10-20', start_at: null, end_at: null },
    ],
  });
  const res = await api(post('/missed/bulk', { action: 'reschedule_tomorrow' }));
  assertEquals(await res.json(), { rescheduled: 3, failed: 0 });
  // Today is the 21st, so tomorrow is the 22nd: two days after the 20th.
  assertEquals(
    log.filter((l) => l.startsWith('prepare')),
    [
      'prepare a 2026-10-22T12:30:00.000Z 2026-10-22T14:30:00.000Z',
      'prepare b 2026-10-22T20:00:00.000Z 2026-10-22T21:00:00.000Z',
    ],
  );
  assertEquals(log.at(-1), 'rpc reschedule_manual {"p_id":"c","p_date":"2026-10-22"}');
});

Deno.test('bulk reschedule counts failures and carries on', async () => {
  let calls = 0;
  const { api } = setup({
    inbox: [
      {
        id: 'a',
        source: 'calendar',
        logical_date: '2026-10-20',
        start_at: '2026-10-20T12:30:00Z',
        end_at: '2026-10-20T14:30:00Z',
      },
      {
        id: 'b',
        source: 'calendar',
        logical_date: '2026-10-20',
        start_at: '2026-10-20T15:30:00Z',
        end_at: '2026-10-20T16:30:00Z',
      },
    ],
    google: () =>
      ++calls === 1 ? new Response('no', { status: 500 }) : Response.json({ id: 'x', etag: '"e"' }),
  });
  assertEquals(await (await api(post('/missed/bulk', { action: 'reschedule_tomorrow' }))).json(), {
    rescheduled: 1,
    failed: 1,
  });
});

Deno.test('dismiss all goes through the user RPC', async () => {
  const { api } = setup();
  assertEquals(await (await api(post('/missed/bulk', { action: 'dismiss_all' }))).json(), {
    dismissed: 3,
  });
  assertEquals((await api(post('/missed/bulk', { action: 'nope' }))).status, 400);
});
