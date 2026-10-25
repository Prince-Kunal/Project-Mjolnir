// Section 3.13 (Google Tasks mode) against the task planner: date-only due dates, list points,
// two-way completion, moves with the day's start as the start time, deletes, and the switch date.
import { assertEquals } from '@std/assert';
import { type GTask, planTask, type TaskContext, type TaskOp, type TaskSnapshot } from './tasks.ts';

// "Now" is 19:00 on Tue 20 Oct 2026 in India; the logical day began at 04:00.
const ctx = (over: Partial<TaskContext> = {}): TaskContext => ({
  timeZone: 'Asia/Kolkata',
  boundaryHour: 4,
  points: 2,
  now: new Date('2026-10-20T19:00:00+05:30'),
  since: '2026-10-01',
  ...over,
});

const task = (over: Partial<GTask> = {}): GTask => ({
  id: 't1',
  etag: '"2"',
  title: 'Read paper #lfx',
  status: 'needsAction',
  due: '2026-10-20T00:00:00.000Z',
  updated: '2026-10-20T13:00:00.000Z', // 18:30 in India
  ...over,
});

const item = (over: Partial<TaskSnapshot> = {}): TaskSnapshot => ({
  id: 'item-1',
  google_task_id: 't1',
  status: 'pending',
  finalized: false,
  logical_date: '2026-10-20',
  start_at: '2026-10-19T22:30:00.000Z', // 04:00 on the 20th in India
  points: 2,
  raw_title: 'Read paper #lfx',
  google_etag: '"1"',
  ...over,
});

const only = (ops: TaskOp[]) => {
  assertEquals(ops.length, 1);
  return ops[0]!;
};

Deno.test('a task due today becomes an item for that date, starting at the day boundary', () => {
  const op = only(planTask(task(), null, ctx()).ops);
  if (op.op !== 'create') throw new Error(op.op);
  assertEquals(
    [op.item.title, op.item.logical_date, op.item.start_at, op.item.points, op.item.status],
    ['Read paper', '2026-10-20', '2026-10-19T22:30:00.000Z', 2, 'pending'],
  );
  assertEquals(op.tags, ['lfx']);
});

Deno.test('the due date is a date: its time and the timezone never shift the day', () => {
  // Google stores midnight UTC; in India that is still the 20th, in New York it is the 19th.
  const op = only(planTask(task(), null, ctx({ timeZone: 'America/New_York' })).ops);
  assertEquals(op.op === 'create' && op.item.logical_date, '2026-10-20');
});

Deno.test('a task with no due date goes to the backlog', () => {
  const op = only(planTask(task({ due: undefined }), null, ctx()).ops);
  if (op.op !== 'create') throw new Error(op.op);
  assertEquals([op.item.logical_date, op.item.start_at], [null, null]);
});

Deno.test('points come from the list; a 0-point list makes non-tasks', () => {
  const op = only(planTask(task(), null, ctx({ points: 0 })).ops);
  assertEquals(op.op === 'create' && [op.item.points, op.item.status], [0, 'ignored']);
});

Deno.test(
  'tasks due before the switch to Tasks mode, and old completed ones, are not imported',
  () => {
    assertEquals(planTask(task({ due: '2026-09-30T00:00:00.000Z' }), null, ctx()).ops, []);
    assertEquals(planTask(task({ due: undefined, status: 'completed' }), null, ctx()).ops, []);
    assertEquals(planTask(task({ hidden: true, status: 'completed' }), null, ctx()).ops, []);
  },
);

Deno.test('a task already completed in Google arrives done', () => {
  const op = only(
    planTask(task({ status: 'completed', completed: '2026-10-20T12:00:00.000Z' }), null, ctx()).ops,
  );
  assertEquals(op.op === 'create' && [op.item.status, op.item.completed_at], [
    'done',
    '2026-10-20T12:00:00.000Z',
  ]);
});

Deno.test('completing a task in Google before day close ticks the item', () => {
  const op = only(
    planTask(task({ status: 'completed', completed: '2026-10-20T13:00:00.000Z' }), item(), ctx())
      .ops,
  );
  if (op.op !== 'update') throw new Error(op.op);
  assertEquals([op.patch.status, op.patch.completed_at], ['done', '2026-10-20T13:00:00.000Z']);
  assertEquals(
    op.events.map((e) => e.kind),
    ['completed'],
  );
});

Deno.test('un-completing it in Google unticks the item', () => {
  const op = only(planTask(task(), item({ status: 'done' }), ctx()).ops);
  if (op.op !== 'update') throw new Error(op.op);
  assertEquals([op.patch.status, op.patch.completed_at], ['pending', null]);
});

Deno.test('the echo of our own status write changes nothing', () => {
  const p = planTask(task({ etag: '"1"' }), item(), ctx());
  assertEquals([p.ops, p.seen], [[], ['item-1']]);
});

Deno.test('a closed day is never reopened by Google', () => {
  const op = only(
    planTask(
      task({ status: 'completed', due: '2026-10-19T00:00:00.000Z' }),
      item({ status: 'missed', finalized: true, logical_date: '2026-10-19' }),
      ctx(),
    ).ops,
  );
  if (op.op !== 'update') throw new Error(op.op);
  assertEquals(op.patch, { google_etag: '"2"' });
  assertEquals(
    op.events.map((e) => e.kind),
    ['task_edit_after_close'],
  );
});

Deno.test('M2: a due date moved before the day began is a plain move', () => {
  const op = only(
    planTask(
      task({ due: '2026-10-21T00:00:00.000Z', updated: '2026-10-19T20:00:00.000Z' }),
      item(),
      ctx(),
    ).ops,
  );
  if (op.op !== 'update') throw new Error(op.op);
  assertEquals(
    [op.patch.logical_date, op.patch.start_at],
    ['2026-10-21', '2026-10-20T22:30:00.000Z'],
  );
  assertEquals(op.events[0]!.payload?.rule, 'M2');
});

Deno.test('M3: a due date moved after the day began records a miss and a new item', () => {
  const op = only(planTask(task({ due: '2026-10-21T00:00:00.000Z' }), item(), ctx()).ops);
  if (op.op !== 'replace') throw new Error(op.op);
  assertEquals(op.old_patch, {
    status: 'missed',
    miss_reason: 'moved_after_start',
    finalized: true,
  });
  assertEquals([op.item.logical_date, op.item.status], ['2026-10-21', 'pending']);
});

Deno.test('moving between a date and the backlog is a plain move', () => {
  const op = only(planTask(task({ due: undefined }), item(), ctx()).ops);
  if (op.op !== 'update') throw new Error(op.op);
  assertEquals([op.patch.logical_date, op.patch.start_at], [null, null]);
});

Deno.test('D1: a task deleted in Google before day close is dropped', () => {
  const op = only(planTask(task({ deleted: true }), item(), ctx()).ops);
  assertEquals(op.op === 'update' && op.patch.status, 'deleted');
});

Deno.test('D2: after day close, the item stays and the delete is only logged', () => {
  const op = only(
    planTask(task({ deleted: true }), item({ status: 'missed', finalized: true }), ctx()).ops,
  );
  if (op.op !== 'update') throw new Error(op.op);
  assertEquals(op.patch.status, undefined);
  assertEquals(
    op.events.map((e) => e.kind),
    ['task_delete_after_close'],
  );
});

Deno.test('a renamed task gets its new title and tags; app-set points are kept', () => {
  const op = only(planTask(task({ title: 'Read paper #gsoc' }), item({ points: 3 }), ctx()).ops);
  if (op.op !== 'update') throw new Error(op.op);
  assertEquals([op.patch.title, op.patch.points, op.tags], ['Read paper', undefined, ['gsoc']]);
});
