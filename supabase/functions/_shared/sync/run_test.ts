import { assertEquals } from '@std/assert';
import { defaultColorRules } from '@mjolnir/domain';
import { CALENDAR_API, ReconnectNeededError } from '../google.ts';
import { fakeFetch, type RecordedRequest } from '../testing.ts';
import { backoffSeconds, type Lease, type SyncStore, syncSource } from './run.ts';
import type { GEvent, ItemSnapshot, SyncOp } from './types.ts';

const EVENTS_URL = `${CALENDAR_API}/calendars/me%40x.com/events`;

function lease(over: Partial<Lease> = {}): Lease {
  return {
    source_id: 'cal-1',
    user_id: 'u1',
    google_calendar_id: 'me@x.com',
    run_kind: 'full',
    run_started_at: '2026-10-20T13:00:00Z',
    window_from: '2026-09-20T13:00:00Z',
    window_to: '2027-01-18T13:00:00Z',
    sync_token: null,
    page_token: null,
    attempts: 0,
    profile: { timezone: 'Asia/Kolkata', day_boundary_hour: 4, include_all_day: false },
    color_rules: defaultColorRules(),
    ...over,
  };
}

const ev = (id: string, startIst: string, over: Partial<GEvent> = {}): GEvent => ({
  id,
  status: 'confirmed',
  etag: `"${id}-1"`,
  summary: `Task ${id}`,
  start: { dateTime: `${startIst}+05:30` },
  end: {
    dateTime: `${startIst.replace(/T(\d\d)/, (_, h) => `T${String(+h + 1).padStart(2, '0')}`)}+05:30`,
  },
  ...over,
});

/** In-memory stand-in for the svc_* functions, enough to follow state across runs. */
class MemoryStore implements SyncStore {
  rows = new Map<string, ItemSnapshot & { active: boolean }>();
  log: string[] = [];
  next = 1;
  leases: Lease[] = [];
  skipNextApply = false;
  unseenIds: string[] = [];

  lease() {
    return Promise.resolve(this.leases.shift() ?? null);
  }
  items(_c: string, ids: string[]) {
    return Promise.resolve(
      [...this.rows.values()].filter((i) => i.active && ids.includes(i.google_event_id)),
    );
  }
  unseen() {
    return Promise.resolve(this.unseenIds.map((id) => this.rows.get(id)!));
  }
  apply(_c: string, ops: SyncOp[], seen: string[]) {
    if (this.skipNextApply) {
      this.skipNextApply = false;
      return Promise.resolve({ applied: 0, skipped: ops.length || 1 });
    }
    for (const o of ops) {
      if (o.op === 'create' || o.op === 'replace') {
        if (o.op === 'replace') {
          const old = this.rows.get(o.id)!;
          Object.assign(old, o.old_patch, { active: false });
        }
        const id = `item-${this.next++}`;
        this.rows.set(id, { id, active: true, finalized: false, ...o.item });
      } else {
        Object.assign(this.rows.get(o.id)!, o.patch);
      }
      this.log.push(o.op);
    }
    this.log.push(`seen:${seen.length}`);
    return Promise.resolve({ applied: ops.length, skipped: 0 });
  }
  checkpoint(_s: string, page: string | null) {
    this.log.push(`checkpoint:${page}`);
    return Promise.resolve();
  }
  finish(_s: string, token: string | null) {
    this.log.push(`finish:${token}`);
    return Promise.resolve();
  }
  fail(_s: string, error: string, retry: number | null, reset: boolean) {
    this.log.push(`fail:${error}:${retry}:${reset}`);
    return Promise.resolve();
  }
}

function deps(store: MemoryStore, fetchFn: ReturnType<typeof fakeFetch>, deadline = Infinity) {
  return {
    store,
    fetchFn,
    deadline,
    now: () => new Date('2026-10-20T19:00:00+05:30'),
    accessToken: () => Promise.resolve('at'),
  };
}

function pages(...ps: { items: GEvent[]; nextPageToken?: string; nextSyncToken?: string }[]) {
  return (req: RecordedRequest) => {
    const token = req.url.searchParams.get('pageToken');
    const index = token ? Number(token.replace('p', '')) : 0;
    return Response.json(ps[index]);
  };
}

Deno.test('a full sync pages through the window and stores the sync token', async () => {
  const store = new MemoryStore();
  store.leases.push(lease());
  const f = fakeFetch({
    [EVENTS_URL]: pages(
      { items: [ev('a', '2026-10-20T09:00:00')], nextPageToken: 'p1' },
      { items: [ev('b', '2026-10-21T09:00:00')], nextSyncToken: 'sync-1' },
    ),
  });
  assertEquals(await syncSource('cal-1', deps(store, f)), 'done');
  assertEquals(store.rows.size, 2);
  assertEquals(store.log, ['create', 'seen:0', 'create', 'seen:0', 'finish:sync-1']);

  const first = f.calls[0]!.url.searchParams;
  assertEquals(first.get('singleEvents'), 'true');
  assertEquals(first.get('timeMin'), '2026-09-20T13:00:00Z');
  assertEquals(first.get('syncToken'), null);
  assertEquals(f.calls[0]!.headers.get('authorization'), 'Bearer at');
});

Deno.test('a full sync that runs out of time continues in the next run', async () => {
  const store = new MemoryStore();
  let clock = Date.parse('2026-10-20T13:30:00Z');
  const deadline = clock + 1000;
  const f = fakeFetch({
    [EVENTS_URL]: (req) => {
      clock += 2000; // each page takes longer than the budget left
      return pages(
        { items: [ev('a', '2026-10-20T09:00:00')], nextPageToken: 'p1' },
        { items: [ev('b', '2026-10-21T09:00:00')], nextSyncToken: 'sync-1' },
      )(req);
    },
  });
  const d = { ...deps(store, f, deadline), now: () => new Date(clock) };

  store.leases.push(lease());
  assertEquals(await syncSource('cal-1', d), 'continued');
  assertEquals(store.log, ['create', 'seen:0', 'checkpoint:p1']);

  store.leases.push(lease({ page_token: 'p1' }));
  assertEquals(await syncSource('cal-1', { ...d, deadline: Infinity }), 'done');
  assertEquals(f.calls.at(-1)!.url.searchParams.get('pageToken'), 'p1');
  assertEquals(store.rows.size, 2);
  assertEquals(store.log.at(-1), 'finish:sync-1');
});

Deno.test('an incremental sync sends the sync token and no time bounds', async () => {
  const store = new MemoryStore();
  store.leases.push(lease({ run_kind: 'incremental', sync_token: 'sync-1' }));
  const f = fakeFetch({
    [EVENTS_URL]: () => Response.json({ items: [], nextSyncToken: 'sync-2' }),
  });
  assertEquals(await syncSource('cal-1', deps(store, f)), 'done');
  const p = f.calls[0]!.url.searchParams;
  assertEquals(p.get('syncToken'), 'sync-1');
  assertEquals(p.get('showDeleted'), 'true');
  assertEquals(p.get('timeMin'), null);
  assertEquals(p.get('timeMax'), null);
  assertEquals(store.log.at(-1), 'finish:sync-2');
});

Deno.test('moves arriving by incremental sync follow M2 and M3', async () => {
  const store = new MemoryStore();
  store.leases.push(lease());
  let events = [ev('a', '2026-10-20T18:00:00'), ev('b', '2026-10-21T09:00:00')];
  const f = fakeFetch({ [EVENTS_URL]: () => Response.json({ items: events, nextSyncToken: 's' }) });
  await syncSource('cal-1', deps(store, f));

  // At 19:00 on the 20th: 'a' started at 18:00 and moves to tomorrow; 'b' has not started.
  events = [
    ev('a', '2026-10-21T18:00:00', { etag: '"a-2"' }),
    ev('b', '2026-10-22T09:00:00', { etag: '"b-2"' }),
  ];
  store.leases.push(lease({ run_kind: 'incremental', sync_token: 's' }));
  await syncSource('cal-1', deps(store, f));

  const all = [...store.rows.values()];
  const a = all.filter((i) => i.google_event_id === 'a');
  assertEquals(
    a.map((i) => [i.status, i.logical_date, i.active]),
    [
      ['missed', '2026-10-20', false],
      ['pending', '2026-10-21', true],
    ],
  );
  const b = all.filter((i) => i.google_event_id === 'b');
  assertEquals(
    b.map((i) => [i.status, i.logical_date]),
    [['pending', '2026-10-22']],
  );
});

Deno.test('a recurring series gives one item per instance', async () => {
  const store = new MemoryStore();
  store.leases.push(lease());
  const instances = ['2026-10-20', '2026-10-21', '2026-10-22'].map((d) =>
    ev(`gym_${d.replaceAll('-', '')}`, `${d}T07:00:00`, { recurringEventId: 'gym' }),
  );
  const f = fakeFetch({
    [EVENTS_URL]: () => Response.json({ items: instances, nextSyncToken: 's' }),
  });
  await syncSource('cal-1', deps(store, f));
  const items = [...store.rows.values()];
  assertEquals(items.length, 3);
  assertEquals(new Set(items.map((i) => i.logical_date)).size, 3);
});

Deno.test('a 410 drops the sync token and asks for a full sync', async () => {
  const store = new MemoryStore();
  store.leases.push(lease({ run_kind: 'incremental', sync_token: 'old' }));
  const f = fakeFetch({ [EVENTS_URL]: () => new Response('gone', { status: 410 }) });
  assertEquals(await syncSource('cal-1', deps(store, f)), 'reset');
  assertEquals(store.log, ['fail:sync_token_expired:null:true']);
});

Deno.test('429 and 5xx retry with a growing delay', async () => {
  for (const status of [429, 503]) {
    const store = new MemoryStore();
    store.leases.push(lease({ attempts: 2 }));
    const f = fakeFetch({ [EVENTS_URL]: () => new Response('slow down', { status }) });
    assertEquals(await syncSource('cal-1', deps(store, f)), 'retry');
    assertEquals(store.log, [`fail:google_${status}:${backoffSeconds(2)}:false`]);
  }
  assertEquals([0, 1, 2, 3, 4, 5].map(backoffSeconds), [30, 60, 120, 240, 480, 480]);
});

Deno.test('a page whose items changed meanwhile is re-run from the same page', async () => {
  const store = new MemoryStore();
  store.leases.push(lease({ page_token: 'p1' }));
  store.skipNextApply = true;
  const f = fakeFetch({
    [EVENTS_URL]: () =>
      Response.json({ items: [ev('a', '2026-10-20T09:00:00')], nextSyncToken: 's' }),
  });
  assertEquals(await syncSource('cal-1', deps(store, f)), 'continued');
  assertEquals(store.log, ['checkpoint:p1']);
});

Deno.test('the end of a full sync deletes items Google no longer returns', async () => {
  const store = new MemoryStore();
  store.rows.set('old', {
    id: 'old',
    active: true,
    google_event_id: 'gone',
    status: 'pending',
    finalized: false,
    logical_date: '2026-10-21',
    start_at: '2026-10-21T03:30:00Z',
    end_at: '2026-10-21T04:30:00Z',
    points: 1,
    raw_title: 'x',
    planned_minutes: 60,
    google_etag: '"x"',
  });
  store.unseenIds = ['old'];
  store.leases.push(lease());
  const f = fakeFetch({ [EVENTS_URL]: () => Response.json({ items: [], nextSyncToken: 's' }) });
  await syncSource('cal-1', deps(store, f));
  assertEquals(store.rows.get('old')!.status, 'deleted');
});

Deno.test('an account that needs reconnecting stops the run without calling Google', async () => {
  const store = new MemoryStore();
  store.leases.push(lease());
  const f = fakeFetch({});
  const d = { ...deps(store, f), accessToken: () => Promise.reject(new ReconnectNeededError()) };
  assertEquals(await syncSource('cal-1', d), 'reconnect');
  assertEquals(f.calls.length, 0);
  assertEquals(store.log, ['fail:reconnect_needed:null:false']);
});

Deno.test('no lease means nothing to do', async () => {
  const store = new MemoryStore();
  assertEquals(await syncSource('cal-1', deps(store, fakeFetch({}))), 'skipped');
});
