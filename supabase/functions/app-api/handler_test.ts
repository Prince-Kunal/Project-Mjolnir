import { assertEquals, assertMatch } from '@std/assert';
import { defaultColorRules, setRulePoints } from '@mjolnir/domain';
import { pkceChallenge } from '../_shared/crypto.ts';
import { CALENDAR_API, ReconnectNeededError } from '../_shared/google.ts';
import { fakeFetch } from '../_shared/testing.ts';
import {
  type AppApiDeps,
  createAppApi,
  type EditContext,
  type PreparedReschedule,
  RpcError,
} from './handler.ts';
import type { SyncOp } from '../_shared/sync/types.ts';

const ITEM = '00000000-0000-4000-8000-000000000001';
const EVENTS = `${CALENDAR_API}/calendars/me%40x.com/events`;
const rules = setRulePoints(defaultColorRules(), '11', 3);

interface Setup {
  user?: { id: string; email: string | null } | null;
  google?: (body: Record<string, unknown>) => Response;
  inbox?: unknown[];
  token?: () => Promise<string>;
  prepareError?: RpcError;
  /** The item PATCH and DELETE act on; null means not found. */
  item?: Partial<EditContext> | null;
  /** Answers PATCH and DELETE on the event. */
  eventWrite?: (req: { method: string; body: Record<string, unknown> }) => Response;
  noCalendar?: boolean;
  applyError?: RpcError;
}

const baseItem: EditContext = {
  id: '00000000-0000-4000-8000-0000000000aa',
  source: 'calendar',
  google_event_id: 'ev1',
  status: 'pending',
  finalized: false,
  logical_date: '2026-10-21',
  start_at: '2026-10-21T12:30:00.000Z', // 18:00 in India
  end_at: '2026-10-21T14:30:00.000Z',
  points: 3,
  raw_title: 'PR review #lfx',
  planned_minutes: 120,
  google_etag: '"e1"',
  google_active: true,
  calendar_id: 'cal-1',
  google_calendar_id: 'me@x.com',
  access_role: 'owner',
};

function setup(o: Setup = {}) {
  const log: string[] = [];
  const states: { userId: string; nonce: string; verifier: string }[] = [];
  const applied: SyncOp[] = [];
  const fetchFn = fakeFetch({
    [EVENTS]: (req) =>
      (o.google ?? ((b) => Response.json({ etag: '"e1"', ...b })))(JSON.parse(req.body)),
    [`${EVENTS}/ev1`]: (req) => {
      log.push(`google ${req.method} ${req.body}`);
      return (o.eventWrite ?? (() => new Response(null, { status: 204 })))({
        method: req.method,
        body: req.body ? JSON.parse(req.body) : {},
      });
    },
  });
  let n = 0;
  let k = 0;
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
    items: {
      appContext: () =>
        Promise.resolve({
          timezone: 'Asia/Kolkata',
          day_boundary_hour: 4,
          include_all_day: false,
          writeback_checkmark: true,
          color_rules: rules,
          calendar: o.noCalendar ? null : { id: 'cal-1', google_calendar_id: 'me@x.com' },
        }),
      editContext: () => Promise.resolve(o.item === null ? null : { ...baseItem, ...o.item }),
      applyOps: (cal, ops) => {
        log.push(`apply ${cal} ${ops.map((op) => op.op).join(',')}`);
        if (o.applyError) return Promise.reject(o.applyError);
        applied.push(...ops);
        return Promise.resolve({ applied: ops.length, skipped: 0 });
      },
      schedulePrepare: (_u, itemId) =>
        Promise.resolve({
          item_id: itemId,
          google_event_id: 'abc123abc123abc123abc123abc123ab',
          google_calendar_id: 'me@x.com',
          summary: 'Call bank #admin',
          points: 1,
          time_zone: 'Asia/Kolkata',
          previous_date: '2026-10-21',
          previous_minutes: null,
          tags: ['admin'],
          color_rules: rules,
        }),
      scheduleAbort: (itemId, date) => {
        log.push(`schedule-abort ${itemId} ${date}`);
        return Promise.resolve();
      },
      newItemId: () => `00000000-0000-4000-8000-00000000000${++k}`,
    },
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
          deadlines: ['d1'],
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
  return { api: createAppApi(deps), states, log, fetchFn, applied };
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
  'rescheduling creates the Google event with the title, colour, times and app properties, links included',
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
        private: { pt_app: '1', pt_item: 'new-1', pt_tags: 'lfx', pt_deadlines: 'd1' },
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

// Events made and changed in the app --------------------------------------------------------------

const ITEM_ID = baseItem.id;
const req = (method: string, path: string, body?: unknown) =>
  new Request(url(path), { method, body: body === undefined ? undefined : JSON.stringify(body) });

Deno.test(
  'POST /items creates the event with the colour for its points and maps it to a new item',
  async () => {
    let sent: Record<string, unknown> = {};
    const { api, applied } = setup({
      google: (b) => {
        sent = b;
        return Response.json({
          ...b,
          etag: '"n1"',
          status: 'confirmed',
          updated: '2026-10-21T04:30:00Z',
        });
      },
    });
    const res = await api(
      req('POST', '/items', {
        title: 'Deep work #ml',
        points: 3,
        start: '2026-10-22T09:00:00+05:30',
        end: '2026-10-22T11:00:00+05:30',
      }),
    );
    assertEquals(res.status, 201);
    const { item_id } = await res.json();
    assertEquals(sent.id, item_id.replaceAll('-', ''));
    assertEquals(sent.colorId, '11');
    assertEquals(
      (sent.extendedProperties as { private: Record<string, string> }).private.pt_item,
      item_id,
    );
    const create = applied[0]!;
    assertEquals(create.op, 'create');
    if (create.op !== 'create') return;
    assertEquals(
      [create.item.id, create.item.title, create.item.points, create.item.logical_date],
      [item_id, 'Deep work', 3, '2026-10-22'],
    );
    assertEquals(create.tags, ['ml']);
  },
);

Deno.test('a calendar-default colour is written as no colour', async () => {
  let sent: Record<string, unknown> = {};
  const { api } = setup({ google: (b) => ((sent = b), Response.json({ ...b, etag: '"n1"' })) });
  await api(
    req('POST', '/items', {
      title: 'Gym',
      points: 1,
      start: '2026-10-22T07:00:00Z',
      end: '2026-10-22T08:00:00Z',
    }),
  );
  assertEquals('colorId' in sent, false);
});

Deno.test('creating needs a writable calendar and a colour for the points', async () => {
  const none = setup({ noCalendar: true });
  assertEquals(
    (
      await none.api(
        req('POST', '/items', {
          title: 'x',
          points: 1,
          start: '2026-10-22T07:00:00Z',
          end: '2026-10-22T08:00:00Z',
        }),
      )
    ).status,
    400,
  );
  const { api } = setup();
  const res = await api(
    req('POST', '/items', {
      title: 'x',
      points: 2,
      start: '2026-10-22T07:00:00Z',
      end: '2026-10-22T08:00:00Z',
    }),
  );
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, 'No colour is worth 2 points. Map one in Settings.');
});

Deno.test('if the webhook sync created the item first, creating still succeeds', async () => {
  const { api } = setup({ applyError: new RpcError('23505', 'duplicate key') });
  const res = await api(
    req('POST', '/items', {
      title: 'Gym',
      points: 1,
      start: '2026-10-22T07:00:00Z',
      end: '2026-10-22T08:00:00Z',
    }),
  );
  assertEquals(res.status, 201);
});

Deno.test(
  'moving a started block to tomorrow from the app records a miss and a new item (M3)',
  async () => {
    // The block ran 08:00-10:00 in India; "now" is 10:00 and Google stamps the move 09:30.
    const { api, log, applied } = setup({
      item: { start_at: '2026-10-21T02:30:00.000Z', end_at: '2026-10-21T04:30:00.000Z' },
      eventWrite: ({ body }) =>
        Response.json({
          id: 'ev1',
          etag: '"e2"',
          status: 'confirmed',
          summary: 'PR review #lfx',
          colorId: '11',
          start: { dateTime: body.start && (body.start as { dateTime: string }).dateTime },
          end: { dateTime: body.end && (body.end as { dateTime: string }).dateTime },
          updated: '2026-10-21T04:00:00Z', // 09:30 in India, after the 08:00 start
        }),
    });
    const res = await api(
      req('PATCH', `/items/${ITEM_ID}`, {
        start: '2026-10-22T18:00:00+05:30',
        end: '2026-10-22T20:00:00+05:30',
      }),
    );
    assertEquals(res.status, 200);
    assertEquals(
      log.filter((l) => l.startsWith('google'))[0],
      'google PATCH {"start":{"dateTime":"2026-10-22T12:30:00.000Z","timeZone":"Asia/Kolkata"},"end":{"dateTime":"2026-10-22T14:30:00.000Z","timeZone":"Asia/Kolkata"}}',
    );
    const op = applied[0]!;
    assertEquals(op.op, 'replace');
    if (op.op !== 'replace') return;
    assertEquals(op.old_patch.status, 'missed');
    assertEquals((await res.json()).item_id, op.item.id);
  },
);

Deno.test('renaming a done item keeps its ✓; repointing changes its colour', async () => {
  const done = setup({
    item: { status: 'done' },
    eventWrite: ({ body }) => Response.json({ ...baseEvent(), ...body }),
  });
  await done.api(req('PATCH', `/items/${ITEM_ID}`, { title: 'Code review #lfx' }));
  assertEquals(
    done.log.find((l) => l.startsWith('google')),
    'google PATCH {"summary":"✓ Code review #lfx"}',
  );
  const re = setup({ eventWrite: ({ body }) => Response.json({ ...baseEvent(), ...body }) });
  await re.api(req('PATCH', `/items/${ITEM_ID}`, { points: 1 }));
  assertEquals(
    re.log.find((l) => l.startsWith('google')),
    'google PATCH {"colorId":null}',
  );
});

function baseEvent() {
  return {
    id: 'ev1',
    etag: '"e2"',
    status: 'confirmed',
    summary: 'PR review #lfx',
    colorId: '11',
    start: { dateTime: '2026-10-21T18:00:00+05:30' },
    end: { dateTime: '2026-10-21T20:00:00+05:30' },
    updated: '2026-10-21T04:30:00Z',
  };
}

Deno.test('deleting from the app deletes in Google, then follows D1', async () => {
  const { api, log, applied } = setup();
  assertEquals((await api(req('DELETE', `/items/${ITEM_ID}`))).status, 200);
  assertEquals(
    log.find((l) => l.startsWith('google')),
    'google DELETE ',
  );
  const op = applied[0]!;
  assertEquals(op.op === 'update' && op.patch.status, 'deleted');
});

Deno.test('a read-only calendar is reported plainly; a missing item is 404', async () => {
  const ro = setup({
    eventWrite: () =>
      Response.json({ error: { code: 403, errors: [{ reason: 'forbidden' }] } }, { status: 403 }),
  });
  const res = await ro.api(req('DELETE', `/items/${ITEM_ID}`));
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, 'This calendar is read-only in Google.');
  const gone = setup({ item: null });
  assertEquals((await gone.api(req('PATCH', `/items/${ITEM_ID}`, { points: 3 }))).status, 404);
});

Deno.test(
  'scheduling a task inserts its event and commits; a Google failure turns it back',
  async () => {
    const ok = setup({ google: (b) => Response.json({ ...b, etag: '"s1"' }) });
    const res = await ok.api(
      req('POST', `/items/${ITEM_ID}/schedule`, {
        start: '2026-10-22T10:00:00Z',
        end: '2026-10-22T11:00:00Z',
      }),
    );
    assertEquals(res.status, 200);
    assertEquals(ok.log.at(-1), `commit ${ITEM_ID} "s1"`);
    const bad = setup({ google: () => new Response('no', { status: 500 }) });
    const failed = await bad.api(
      req('POST', `/items/${ITEM_ID}/schedule`, {
        start: '2026-10-22T10:00:00Z',
        end: '2026-10-22T11:00:00Z',
      }),
    );
    assertEquals(failed.status, 502);
    assertEquals(bad.log.at(-1), `schedule-abort ${ITEM_ID} 2026-10-21`);
  },
);
