// Plan 8.5 against section 3.4: moves M1–M4, deletes D1–D2, edits E1–E2, recurring R1.
import { assertEquals, assertExists } from '@std/assert';
import { defaultColorRules, setRulePoints } from '@mjolnir/domain';
import { planEvent, planPage, planUnseen } from './plan.ts';
import type { GEvent, ItemSnapshot, PlanContext, SyncOp } from './types.ts';

let rules = defaultColorRules(); // default = 1 point
rules = setRulePoints(rules, '11', 3); // Tomato = 3
rules = setRulePoints(rules, '8', 0); // Graphite = 0

// "Now" is 19:00 on Tue 20 Oct 2026 in India, after the 18:00 block started.
const ctx = (now = '2026-10-20T19:00:00+05:30'): PlanContext => ({
  timeZone: 'Asia/Kolkata',
  boundaryHour: 4,
  includeAllDay: false,
  rules,
  now: new Date(now),
  window: { from: new Date('2026-09-20T00:00:00Z'), to: new Date('2027-01-18T00:00:00Z') },
});

const event = (over: Partial<GEvent> = {}): GEvent => ({
  id: 'ev1',
  status: 'confirmed',
  etag: '"2"',
  summary: 'PR review #lfx',
  colorId: '11',
  start: { dateTime: '2026-10-20T18:00:00+05:30' },
  end: { dateTime: '2026-10-20T20:00:00+05:30' },
  ...over,
});

const item = (over: Partial<ItemSnapshot> = {}): ItemSnapshot => ({
  id: 'item-1',
  google_event_id: 'ev1',
  status: 'pending',
  finalized: false,
  logical_date: '2026-10-20',
  start_at: '2026-10-20T12:30:00.000Z',
  end_at: '2026-10-20T14:30:00.000Z',
  points: 3,
  raw_title: 'PR review #lfx',
  planned_minutes: 120,
  google_etag: '"1"',
  color_key: '11',
  ...over,
});

const only = (ops: SyncOp[]) => {
  assertEquals(ops.length, 1);
  return ops[0]!;
};

Deno.test('a new event becomes a pending item with points from its colour and parsed tags', () => {
  const op = only(planEvent(event(), null, ctx()).ops);
  assertEquals(op.op, 'create');
  if (op.op !== 'create') return;
  assertEquals(op.item.title, 'PR review');
  assertEquals(op.item.points, 3);
  assertEquals(op.item.status, 'pending');
  assertEquals(op.item.logical_date, '2026-10-20');
  assertEquals(op.item.start_at, '2026-10-20T12:30:00.000Z');
  assertEquals(op.item.planned_minutes, 120);
  assertEquals(op.tags, ['lfx']);
});

Deno.test('a 0-point colour is stored as ignored (3.2)', () => {
  const op = only(planEvent(event({ colorId: '8' }), null, ctx()).ops);
  assertEquals(op.op === 'create' && op.item.status, 'ignored');
});

Deno.test('no colorId means calendar default', () => {
  const op = only(planEvent(event({ colorId: undefined }), null, ctx()).ops);
  assertEquals(op.op === 'create' && op.item.points, 1);
});

Deno.test('a session at 01:30 belongs to the previous logical day', () => {
  const op = only(
    planEvent(
      event({
        start: { dateTime: '2026-10-21T01:30:00+05:30' },
        end: { dateTime: '2026-10-21T02:30:00+05:30' },
      }),
      null,
      ctx(),
    ).ops,
  );
  assertEquals(op.op === 'create' && op.item.logical_date, '2026-10-20');
});

Deno.test('the ✓ prefix is stripped from the display title', () => {
  const op = only(planEvent(event({ summary: '✓ PR review #lfx' }), null, ctx()).ops);
  assertEquals(op.op === 'create' && op.item.title, 'PR review');
});

Deno.test('a recurring instance keeps its series id (R1)', () => {
  const op = only(
    planEvent(event({ id: 'ev1_20261020', recurringEventId: 'ev1' }), null, ctx()).ops,
  );
  assertEquals(op.op === 'create' && op.item.recurring_event_id, 'ev1');
});

Deno.test('all-day events are ignored by default and included when the setting is on', () => {
  const allDay = event({ start: { date: '2026-10-22' }, end: { date: '2026-10-23' } });
  assertEquals(planEvent(allDay, null, ctx()).ops, []);
  const op = only(planEvent(allDay, null, { ...ctx(), includeAllDay: true }).ops);
  if (op.op !== 'create') throw new Error('expected create');
  assertEquals(op.item.logical_date, '2026-10-22');
  assertEquals(op.item.is_all_day, true);
  assertEquals(op.item.planned_minutes, null);
});

Deno.test('an event outside the sync window with no item is dropped', () => {
  const far = event({
    start: { dateTime: '2027-06-01T10:00:00+05:30' },
    end: { dateTime: '2027-06-01T11:00:00+05:30' },
  });
  assertEquals(planEvent(far, null, ctx()).ops, []);
});

Deno.test('an echo of an unchanged event is only marked seen', () => {
  const plan = planEvent(event({ etag: '"1"' }), item(), ctx());
  assertEquals(plan.ops, []);
  assertEquals(plan.seen, ['item-1']);
});

Deno.test('M1: a move within the same logical day updates the times only', () => {
  const op = only(
    planEvent(
      event({
        start: { dateTime: '2026-10-20T21:00:00+05:30' },
        end: { dateTime: '2026-10-20T23:00:00+05:30' },
      }),
      item(),
      ctx(),
    ).ops,
  );
  if (op.op !== 'update') throw new Error('expected update');
  assertEquals(op.patch.start_at, '2026-10-20T15:30:00.000Z');
  assertEquals(op.patch.logical_date, undefined);
  assertEquals(op.patch.status, undefined);
  assertEquals(
    op.events.map((e) => e.kind),
    ['moved'],
  );
});

Deno.test('M2: moving to another day before the original start is a plain move', () => {
  const moved = event({
    start: { dateTime: '2026-10-21T18:00:00+05:30' },
    end: { dateTime: '2026-10-21T20:00:00+05:30' },
  });
  const op = only(planEvent(moved, item(), ctx('2026-10-20T10:00:00+05:30')).ops);
  if (op.op !== 'update') throw new Error('expected update');
  assertEquals(op.patch.logical_date, '2026-10-21');
  assertEquals(op.patch.status, undefined);
});

Deno.test('M3: moving an unfinished task to another day after its start records a miss', () => {
  const moved = event({
    start: { dateTime: '2026-10-21T18:00:00+05:30' },
    end: { dateTime: '2026-10-21T20:00:00+05:30' },
  });
  const op = only(planEvent(moved, item(), ctx()).ops);
  if (op.op !== 'replace') throw new Error('expected replace');
  assertEquals(op.id, 'item-1');
  assertEquals(op.old_patch, {
    status: 'missed',
    miss_reason: 'moved_after_start',
    finalized: true,
  });
  assertEquals(op.item.status, 'pending');
  assertEquals(op.item.logical_date, '2026-10-21');
  assertEquals(op.expect, { status: 'pending', finalized: false });
});

Deno.test('a move is judged by when it was made in Google, not when the sync runs', () => {
  const moved = event({
    start: { dateTime: '2026-10-21T18:00:00+05:30' },
    end: { dateTime: '2026-10-21T20:00:00+05:30' },
  });
  // Dragged at 17:50, before the 18:00 start; the poll only sees it at 19:00.
  const early = only(planEvent({ ...moved, updated: '2026-10-20T12:20:00Z' }, item(), ctx()).ops);
  assertEquals(early.op, 'update');
  // Dragged at 18:30, after the start.
  const late = only(planEvent({ ...moved, updated: '2026-10-20T13:00:00Z' }, item(), ctx()).ops);
  assertEquals(late.op, 'replace');
});

Deno.test('M4: a done item that is not finalized moves and stays done', () => {
  const moved = event({
    start: { dateTime: '2026-10-21T18:00:00+05:30' },
    end: { dateTime: '2026-10-21T20:00:00+05:30' },
  });
  const op = only(planEvent(moved, item({ status: 'done' }), ctx()).ops);
  if (op.op !== 'update') throw new Error('expected update');
  assertEquals(op.patch.logical_date, '2026-10-21');
  assertEquals(op.patch.status, undefined);
  assertEquals(op.expect.status, 'done');
});

Deno.test(
  'M4: a finalized item moved into today or later leaves history and creates a new item',
  () => {
    const past = item({
      status: 'done',
      finalized: true,
      logical_date: '2026-10-19',
      start_at: '2026-10-19T12:30:00.000Z',
    });
    const op = only(planEvent(event(), past, ctx()).ops);
    if (op.op !== 'replace') throw new Error('expected replace');
    assertEquals(op.old_patch, {});
    assertEquals(op.item.status, 'pending');
    assertEquals(op.item.logical_date, '2026-10-20');
  },
);

Deno.test('a finalized item moved to another past day keeps its status', () => {
  const past = item({
    status: 'missed',
    finalized: true,
    logical_date: '2026-10-18',
    start_at: '2026-10-18T12:30:00.000Z',
  });
  const moved = event({
    start: { dateTime: '2026-10-19T18:00:00+05:30' },
    end: { dateTime: '2026-10-19T20:00:00+05:30' },
  });
  const op = only(planEvent(moved, past, ctx()).ops);
  if (op.op !== 'update') throw new Error('expected update');
  assertEquals(op.patch, { google_etag: '"2"' });
  assertEquals(
    op.events.map((e) => e.kind),
    ['calendar_edit_after_close'],
  );
});

Deno.test('D1: an event deleted before day close drops the item, whatever its status', () => {
  for (const status of ['pending', 'done', 'ignored'] as const) {
    const op = only(planEvent(event({ status: 'cancelled' }), item({ status }), ctx()).ops);
    if (op.op !== 'update') throw new Error('expected update');
    assertEquals(op.patch.status, 'deleted');
  }
});

Deno.test('D1: an event the owner declined is treated as deleted', () => {
  const declined = event({ attendees: [{ self: true, responseStatus: 'declined' }] });
  const op = only(planEvent(declined, item(), ctx()).ops);
  assertEquals(op.op === 'update' && op.patch.status, 'deleted');
});

Deno.test('D2: an event deleted after day close keeps the final status', () => {
  const op = only(
    planEvent(event({ status: 'cancelled' }), item({ status: 'missed', finalized: true }), ctx())
      .ops,
  );
  if (op.op !== 'update') throw new Error('expected update');
  assertEquals(op.patch.status, undefined);
  assertEquals(
    op.events.map((e) => e.kind),
    ['calendar_delete_after_close'],
  );
});

Deno.test('a cancelled event with no item does nothing', () => {
  assertEquals(planEvent(event({ status: 'cancelled' }), null, ctx()).ops, []);
});

Deno.test('a deleted event that comes back is restored', () => {
  const op = only(planEvent(event(), item({ status: 'deleted' }), ctx()).ops);
  if (op.op !== 'update') throw new Error('expected update');
  assertEquals(op.patch.status, 'pending');
  assertExists(op.tags);
});

Deno.test('E1: a title edit re-parses tags', () => {
  const op = only(planEvent(event({ summary: 'PR review #lfx #oss' }), item(), ctx()).ops);
  if (op.op !== 'update') throw new Error('expected update');
  assertEquals(op.tags, ['lfx', 'oss']);
  assertEquals(op.patch.title, 'PR review');
});

Deno.test('E1: an unchanged title leaves tag links alone', () => {
  const op = only(planEvent(event({ colorId: undefined }), item(), ctx()).ops);
  assertEquals(op.op === 'update' && op.tags, undefined);
});

Deno.test('E2: a colour change re-scores and crossing 0 toggles ignored', () => {
  const toZero = only(planEvent(event({ colorId: '8' }), item(), ctx()).ops);
  if (toZero.op !== 'update') throw new Error('expected update');
  assertEquals(toZero.patch.points, 0);
  assertEquals(toZero.patch.status, 'ignored');
  assertEquals(
    toZero.events.map((e) => e.kind),
    ['points_changed'],
  );

  const back = only(planEvent(event(), item({ status: 'ignored', points: 0 }), ctx()).ops);
  if (back.op !== 'update') throw new Error('expected update');
  assertEquals(back.patch.points, 3);
  assertEquals(back.patch.status, 'pending');
});

Deno.test('E2: a done item recoloured to 0 stays done', () => {
  const op = only(planEvent(event({ colorId: '8' }), item({ status: 'done' }), ctx()).ops);
  if (op.op !== 'update') throw new Error('expected update');
  assertEquals(op.patch.points, 0);
  assertEquals(op.patch.status, undefined);
});

Deno.test('E2: a duration edit updates planned minutes', () => {
  const op = only(
    planEvent(event({ end: { dateTime: '2026-10-20T21:00:00+05:30' } }), item(), ctx()).ops,
  );
  assertEquals(op.op === 'update' && op.patch.planned_minutes, 180);
});

Deno.test('planPage pairs events with their items', () => {
  const plan = planPage(
    [event({ etag: '"1"' }), event({ id: 'ev2', etag: '"9"' })],
    [item()],
    ctx(),
  );
  assertEquals(plan.seen, ['item-1']);
  assertEquals(
    plan.ops.map((o) => o.op),
    ['create'],
  );
});

Deno.test('planUnseen deletes items that vanished, following D1 and D2', () => {
  const ops = planUnseen(
    [item(), item({ id: 'item-2', status: 'missed', finalized: true })],
    ctx(),
  );
  assertEquals(ops.length, 2);
  assertEquals(ops[0]!.op === 'update' && ops[0]!.patch.status, 'deleted');
  assertEquals(ops[1]!.op === 'update' && ops[1]!.patch.status, undefined);
});

Deno.test('every event records its Google colour; no colour means the calendar default', () => {
  const op = only(planEvent(event(), null, ctx()).ops);
  assertEquals(op.op === 'create' && op.item.color_key, '11');
  const plain = only(planEvent(event({ colorId: undefined }), null, ctx()).ops);
  assertEquals(plain.op === 'create' && plain.item.color_key, 'default');
});

Deno.test('an unchanged event still fills in a colour missing from older items, once', () => {
  const backfill = only(planEvent(event({ etag: '"1"' }), item({ color_key: null }), ctx()).ops);
  assertEquals(backfill.op === 'update' && backfill.patch.color_key, '11');
  assertEquals(planEvent(event({ etag: '"1"' }), item(), ctx()).ops, []);
});

// Links in private properties (3.8) ---------------------------------------------------------------

Deno.test("a new item takes its links back from the event's private properties", () => {
  const op = only(
    planEvent(
      event({
        extendedProperties: {
          private: { pt_app: '1', pt_item: 'old', pt_tags: 'lfx,gsoc', pt_deadlines: 'd1' },
        },
      }),
      null,
      ctx(),
    ).ops,
  );
  assertEquals(op.op === 'create' && op.links, { tags: ['lfx', 'gsoc'], deadlines: ['d1'] });
});

Deno.test('an event with no links, or empty ones, carries none', () => {
  for (const e of [
    event(),
    event({ extendedProperties: { private: { pt_app: '1', pt_tags: '', pt_deadlines: '' } } }),
  ]) {
    const op = only(planEvent(e, null, ctx()).ops);
    assertEquals(op.op === 'create' && 'links' in op, false);
  }
});

Deno.test('an existing item ignores the properties: the database owns its links', () => {
  const op = only(
    planEvent(
      event({ etag: '"3"', extendedProperties: { private: { pt_tags: 'other' } } }),
      item(),
      ctx(),
    ).ops,
  );
  assertEquals(op.op, 'update');
  assertEquals('links' in op, false);
});

Deno.test(
  'after switching back from Tasks mode, events before the switch make no new items',
  () => {
    const c = { ...ctx(), createFrom: '2026-10-21' };
    assertEquals(planEvent(event(), null, c).ops, []);
    // An item that already exists still follows its event.
    assertEquals(only(planEvent(event({ summary: 'Renamed' }), item(), c).ops).op, 'update');
  },
);
