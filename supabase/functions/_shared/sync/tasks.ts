// Section 3.13: what one Google task change means for the item it maps to. Pure: no I/O.
// Tasks have a due date but no time, so the start of the logical day stands in for a start time
// when a move is judged (M1 to M4); completion is two-way; deletes follow D1 and D2.
import { classifyMove, dayStart, type ItemStatus, logicalDate, parseTitle } from '@mjolnir/domain';
import type { AuditEvent, Expect } from './types.ts';

/** The parts of a Google task the sync reads (Tasks API v1). */
export interface GTask {
  id: string;
  etag?: string;
  title?: string;
  status?: 'needsAction' | 'completed';
  /** RFC 3339, but only the date is meaningful: Google drops the time. */
  due?: string;
  completed?: string;
  deleted?: boolean;
  /** Completed and then cleared from the list. */
  hidden?: boolean;
  updated?: string;
}

/** What the planner knows about the item a task maps to now (`google_active`). */
export interface TaskSnapshot {
  id: string;
  google_task_id: string;
  status: ItemStatus;
  finalized: boolean;
  logical_date: string | null;
  start_at: string | null;
  points: number;
  raw_title: string | null;
  google_etag: string | null;
}

export interface TaskContext {
  timeZone: string;
  boundaryHour: number;
  /** The list's points, for new items. The app may change an item's points afterwards. */
  points: number;
  now: Date;
  /** Logical date Tasks mode began: earlier tasks are not imported (3.13). */
  since: string | null;
}

export interface TaskFields {
  id?: string;
  title: string;
  raw_title: string;
  points: number;
  logical_date: string | null;
  start_at: string | null;
  status: ItemStatus;
  completed_at: string | null;
  google_task_id: string;
  google_etag: string | null;
  google_updated_at: string | null;
}

export type TaskOp =
  | { op: 'create'; item: TaskFields; tags: string[]; events: AuditEvent[] }
  | {
      op: 'update';
      id: string;
      expect: Expect;
      patch: Partial<TaskFields>;
      tags?: string[];
      events: AuditEvent[];
    }
  | {
      op: 'replace';
      id: string;
      expect: Expect;
      old_patch: { status?: ItemStatus; miss_reason?: string; finalized?: boolean };
      old_events: AuditEvent[];
      item: TaskFields;
      tags: string[];
      events: AuditEvent[];
    };

export interface TaskPlan {
  ops: TaskOp[];
  seen: string[];
}

const iso = (t: string | Date) => new Date(t).toISOString();

const expectOf = (i: TaskSnapshot): Expect => ({ status: i.status, finalized: i.finalized });

function fieldsFor(t: GTask, ctx: TaskContext, points: number, base: ItemStatus) {
  const parsed = parseTitle(t.title);
  const date = t.due ? t.due.slice(0, 10) : null;
  const done = t.status === 'completed';
  const status: ItemStatus = base === 'ignored' ? 'ignored' : done ? 'done' : 'pending';
  const fields: TaskFields = {
    title: parsed.title,
    raw_title: t.title ?? '',
    points,
    logical_date: date,
    start_at: date ? iso(dayStart(date, ctx.timeZone, ctx.boundaryHour)) : null,
    status,
    completed_at: status === 'done' ? iso(t.completed ?? ctx.now) : null,
    google_task_id: t.id,
    google_etag: t.etag ?? null,
    google_updated_at: t.updated ? iso(t.updated) : null,
  };
  return { fields, tags: parsed.tags };
}

export function planTask(t: GTask, item: TaskSnapshot | null, ctx: TaskContext): TaskPlan {
  const seen = (): TaskPlan => ({ ops: [], seen: item ? [item.id] : [] });

  if (t.deleted) {
    if (!item || item.status === 'deleted') return { ops: [], seen: [] };
    return {
      ops: [
        item.finalized
          ? {
              op: 'update',
              id: item.id,
              expect: expectOf(item),
              patch: t.etag ? { google_etag: t.etag } : {},
              events: [{ kind: 'task_delete_after_close' }],
            }
          : {
              op: 'update',
              id: item.id,
              expect: expectOf(item),
              patch: { status: 'deleted', ...(t.etag ? { google_etag: t.etag } : {}) },
              events: [{ kind: 'deleted', payload: { previous_status: item.status } }],
            },
      ],
      seen: [],
    };
  }

  // Echo of our own write, or a change already applied.
  if (item && item.status !== 'deleted' && t.etag && item.google_etag === t.etag) return seen();

  if (!item) {
    const { fields, tags } = fieldsFor(t, ctx, ctx.points, ctx.points > 0 ? 'pending' : 'ignored');
    const old =
      fields.logical_date !== null && ctx.since !== null && fields.logical_date < ctx.since;
    const stale = t.status === 'completed' && (fields.logical_date === null || t.hidden);
    if (old || stale || t.hidden) return { ops: [], seen: [] };
    return { ops: [{ op: 'create', item: fields, tags, events: [{ kind: 'created' }] }], seen: [] };
  }

  const restoring = item.status === 'deleted';
  const current: ItemStatus = restoring ? (item.points > 0 ? 'pending' : 'ignored') : item.status;
  const { fields, tags } = fieldsFor(t, ctx, item.points, current);
  const dateChanged = fields.logical_date !== item.logical_date;
  const today = logicalDate(ctx.now, ctx.timeZone, ctx.boundaryHour);

  // Finalized items never change status from Google (3.3).
  if (item.finalized) {
    if (dateChanged && fields.logical_date !== null && fields.logical_date >= today) {
      return {
        ops: [
          {
            op: 'replace',
            id: item.id,
            expect: expectOf(item),
            old_patch: {},
            old_events: [
              { kind: 'task_edit_after_close', payload: { moved_to: fields.logical_date } },
            ],
            item: { ...fields, status: item.points > 0 ? fields.status : 'ignored' },
            tags,
            events: [{ kind: 'created', payload: { rescheduled_from: item.id } }],
          },
        ],
        seen: [],
      };
    }
    return {
      ops: [
        {
          op: 'update',
          id: item.id,
          expect: expectOf(item),
          patch: { google_etag: fields.google_etag },
          events: [{ kind: 'task_edit_after_close' }],
        },
      ],
      seen: [],
    };
  }

  const events: AuditEvent[] = restoring ? [{ kind: 'restored' }] : [];

  if (dateChanged) {
    let rule = 'M2';
    if (item.logical_date && item.start_at && fields.start_at) {
      // Judge the move by when it was made in Google, not when this poll happens to run.
      const movedAt = t.updated && Date.parse(t.updated) <= ctx.now.getTime() ? t.updated : ctx.now;
      const move = classifyMove(
        { status: current, startAt: item.start_at, logicalDate: item.logical_date },
        fields.start_at,
        movedAt,
        ctx.timeZone,
        ctx.boundaryHour,
      );
      if (move === 'miss_and_recreate') {
        return {
          ops: [
            {
              op: 'replace',
              id: item.id,
              expect: expectOf(item),
              old_patch: { status: 'missed', miss_reason: 'moved_after_start', finalized: true },
              old_events: [{ kind: 'missed', payload: { reason: 'moved_after_start' } }],
              item: fields,
              tags,
              events: [{ kind: 'rescheduled', payload: { rescheduled_from: item.id } }],
            },
          ],
          seen: [],
        };
      }
      rule = move === 'same_day' ? 'M1' : 'M2';
    }
    events.push({
      kind: 'moved',
      payload: { from: item.logical_date, to: fields.logical_date, rule },
    });
  }

  const patch: Partial<TaskFields> = {
    google_etag: fields.google_etag,
    google_updated_at: fields.google_updated_at,
  };
  if (dateChanged) {
    patch.logical_date = fields.logical_date;
    patch.start_at = fields.start_at;
  }
  const titleChanged = restoring || item.raw_title !== fields.raw_title;
  if (titleChanged) {
    patch.title = fields.title;
    patch.raw_title = fields.raw_title;
  }
  // Completion is two-way (3.13): Google's status wins until the day closes.
  if (fields.status !== item.status) {
    patch.status = fields.status;
    patch.completed_at = fields.completed_at;
    if (fields.status === 'done') events.push({ kind: 'completed', payload: { via: 'google' } });
    else if (item.status === 'done')
      events.push({ kind: 'uncompleted', payload: { via: 'google' } });
  }

  return {
    ops: [
      {
        op: 'update',
        id: item.id,
        expect: expectOf(item),
        patch,
        ...(titleChanged ? { tags } : {}),
        events,
      },
    ],
    seen: [],
  };
}

export function planTaskPage(tasks: GTask[], items: TaskSnapshot[], ctx: TaskContext): TaskPlan {
  const byTask = new Map(items.map((i) => [i.google_task_id, i]));
  const plan: TaskPlan = { ops: [], seen: [] };
  for (const t of tasks) {
    const p = planTask(t, byTask.get(t.id) ?? null, ctx);
    plan.ops.push(...p.ops);
    plan.seen.push(...p.seen);
  }
  return plan;
}
