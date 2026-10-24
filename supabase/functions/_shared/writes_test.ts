import { assertEquals, assertRejects } from '@std/assert';
import { CALENDAR_API } from './google.ts';
import { fakeFetch } from './testing.ts';
import { runCheckmark, withCheckmark, type WriteContext, type WriteDeps } from './writes.ts';

const EVENT = `${CALENDAR_API}/calendars/me%40x.com/events/ev1`;

function setup(
  ctx: Partial<WriteContext> | null,
  google?: (body: Record<string, unknown>, headers: Headers) => Response,
) {
  const log: string[] = [];
  const fetchFn = fakeFetch({
    [EVENT]: (req) => {
      const body = JSON.parse(req.body);
      log.push(`patch ${JSON.stringify(body)} if-match ${req.headers.get('if-match')}`);
      return google
        ? google(body, req.headers)
        : Response.json({ id: 'ev1', etag: '"e2"', summary: body.summary });
    },
  });
  const deps: WriteDeps = {
    fetchFn,
    accessToken: () => Promise.resolve('at'),
    context: () =>
      Promise.resolve(
        ctx && {
          user_id: 'u1',
          status: 'done',
          raw_title: 'PR review #lfx',
          google_event_id: 'ev1',
          google_active: true,
          google_etag: '"e1"',
          google_calendar_id: 'me@x.com',
          writeback: true,
          ...ctx,
        },
      ),
    done: (id, etag, raw) => {
      log.push(`done ${id} ${etag} ${raw}`);
      return Promise.resolve();
    },
  };
  return { deps, log };
}

const job = { kind: 'checkmark', item_id: 'i1' } as const;

Deno.test('withCheckmark adds and removes the prefix once', () => {
  assertEquals(withCheckmark('Gym', true), '✓ Gym');
  assertEquals(withCheckmark('✓ Gym', true), '✓ Gym');
  assertEquals(withCheckmark('  ✓  Gym', false), 'Gym');
});

Deno.test(
  'a ticked item gets "✓ " in Google, guarded by its etag, and the new etag is stored',
  async () => {
    const { deps, log } = setup({});
    assertEquals(await runCheckmark(job, deps), 'written');
    assertEquals(log, [
      'patch {"summary":"✓ PR review #lfx"} if-match "e1"',
      'done i1 "e2" ✓ PR review #lfx',
    ]);
  },
);

Deno.test('an unticked item loses it', async () => {
  const { deps, log } = setup({ status: 'pending', raw_title: '✓ PR review #lfx' });
  assertEquals(await runCheckmark(job, deps), 'written');
  assertEquals(log[0], 'patch {"summary":"PR review #lfx"} if-match "e1"');
});

Deno.test('a title already right is not written (repeated jobs converge)', async () => {
  const { deps, log } = setup({ raw_title: '✓ PR review #lfx' });
  assertEquals(await runCheckmark(job, deps), 'unchanged');
  assertEquals(log, []);
});

Deno.test('turning the setting off removes the ✓ instead of adding it', async () => {
  const { deps, log } = setup({ writeback: false, raw_title: '✓ Gym' });
  await runCheckmark(job, deps);
  assertEquals(log[0], 'patch {"summary":"Gym"} if-match "e1"');
});

Deno.test('deleted, missed or unmapped items are skipped', async () => {
  for (const ctx of [{ status: 'deleted' }, { status: 'missed' }, { google_active: false }, null]) {
    const { deps, log } = setup(ctx);
    assertEquals(await runCheckmark(job, deps), 'skipped');
    assertEquals(log, []);
  }
});

Deno.test('an event deleted in Google, or on a read-only calendar, is let go', async () => {
  const gone = setup({}, () =>
    Response.json({ error: { code: 404, errors: [{ reason: 'notFound' }] } }, { status: 404 }),
  );
  assertEquals(await runCheckmark(job, gone.deps), 'gone');
  const ro = setup({}, () =>
    Response.json({ error: { code: 403, errors: [{ reason: 'forbidden' }] } }, { status: 403 }),
  );
  assertEquals(await runCheckmark(job, ro.deps), 'read_only');
});

Deno.test(
  'an event changed in Google since we read it is retried later, not overwritten',
  async () => {
    const { deps, log } = setup({}, () =>
      Response.json(
        { error: { code: 412, errors: [{ reason: 'conditionNotMet' }] } },
        { status: 412 },
      ),
    );
    await assertRejects(() => runCheckmark(job, deps));
    assertEquals(
      log.some((l) => l.startsWith('done')),
      false,
    );
  },
);
