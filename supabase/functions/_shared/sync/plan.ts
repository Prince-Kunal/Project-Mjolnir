// Plan 8.5: what one Google event change means for the item it maps to. Pure: no I/O.
// The worker reads the current items, plans a page, and applies the ops in one transaction.
import {
  classifyMove,
  dayStart,
  type ItemStatus,
  logicalDate,
  parseTitle,
  pointsForColor,
} from '@mjolnir/domain';
import type {
  AuditEvent,
  GEvent,
  ItemFields,
  ItemSnapshot,
  PagePlan,
  PlanContext,
  SyncOp,
} from './types.ts';

const iso = (t: string | Date) => new Date(t).toISOString();

function isAllDay(e: GEvent): boolean {
  return !e.start?.dateTime && Boolean(e.start?.date);
}

/** Cancelled, declined, all-day while excluded, or not a schedulable block. */
function isGone(e: GEvent, ctx: PlanContext): boolean {
  if (e.status === 'cancelled') return true;
  if (e.attendees?.some((a) => a.self && a.responseStatus === 'declined')) return true;
  if (isAllDay(e) && !ctx.includeAllDay) return true;
  // Working-location markers are not tasks.
  return e.eventType === 'workingLocation';
}

function activeStatus(points: number): ItemStatus {
  return points > 0 ? 'pending' : 'ignored';
}

function fieldsFor(e: GEvent, ctx: PlanContext): { fields: ItemFields; tags: string[] } {
  const parsed = parseTitle(e.summary);
  const points = pointsForColor(ctx.rules, e.colorId);
  let start: string, end: string, logical: string, minutes: number | null;
  if (isAllDay(e)) {
    logical = e.start!.date!;
    start = iso(dayStart(logical, ctx.timeZone, ctx.boundaryHour));
    end = iso(dayStart(e.end?.date ?? logical, ctx.timeZone, ctx.boundaryHour));
    minutes = null;
  } else {
    start = iso(e.start!.dateTime!);
    end = iso(e.end?.dateTime ?? e.start!.dateTime!);
    logical = logicalDate(start, ctx.timeZone, ctx.boundaryHour);
    minutes = Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 60_000));
  }
  return {
    tags: parsed.tags,
    fields: {
      title: parsed.title,
      raw_title: e.summary ?? '',
      points,
      logical_date: logical,
      start_at: start,
      end_at: end,
      is_all_day: isAllDay(e),
      planned_minutes: minutes,
      status: activeStatus(points),
      google_event_id: e.id,
      recurring_event_id: e.recurringEventId ?? null,
      google_etag: e.etag ?? null,
      google_updated_at: e.updated ? iso(e.updated) : null,
      color_key: e.colorId ?? 'default',
    },
  };
}

function expectOf(item: ItemSnapshot) {
  return { status: item.status, finalized: item.finalized };
}

/** D1 and D2: an event that is gone. Before day close the item is dropped; after, it stays. */
function planGone(item: ItemSnapshot, etag: string | null | undefined): SyncOp | null {
  if (item.status === 'deleted') return null;
  if (item.finalized) {
    return {
      op: 'update',
      id: item.id,
      expect: expectOf(item),
      patch: etag ? { google_etag: etag } : {},
      events: [{ kind: 'calendar_delete_after_close' }],
    };
  }
  return {
    op: 'update',
    id: item.id,
    expect: expectOf(item),
    patch: { status: 'deleted', ...(etag ? { google_etag: etag } : {}) },
    events: [{ kind: 'deleted', payload: { previous_status: item.status } }],
  };
}

export function planEvent(e: GEvent, item: ItemSnapshot | null, ctx: PlanContext): PagePlan {
  const seen = (): PagePlan => ({ ops: [], seen: item ? [item.id] : [] });

  if (isGone(e, ctx)) {
    if (!item) return { ops: [], seen: [] };
    const op = planGone(item, e.etag);
    return op ? { ops: [op], seen: [] } : seen();
  }

  // Echo of our own write, or a change we already applied.
  // An item synced before colours were stored is updated once even when unchanged.
  if (
    item &&
    item.status !== 'deleted' &&
    e.etag &&
    item.google_etag === e.etag &&
    item.color_key != null
  ) {
    return seen();
  }

  const { fields, tags } = fieldsFor(e, ctx);

  if (!item) {
    // Incremental syncs cannot be bounded by time; drop new events outside the window.
    const outside =
      Date.parse(fields.end_at) <= ctx.window.from.getTime() ||
      Date.parse(fields.start_at) >= ctx.window.to.getTime();
    if (outside) return { ops: [], seen: [] };
    return { ops: [{ op: 'create', item: fields, tags, events: [{ kind: 'created' }] }], seen: [] };
  }

  const startChanged = Date.parse(item.start_at) !== Date.parse(fields.start_at);
  const today = logicalDate(ctx.now, ctx.timeZone, ctx.boundaryHour);

  // Finalized items never change status from a calendar edit (3.3).
  if (item.finalized) {
    if (startChanged && fields.logical_date >= today) {
      return {
        ops: [
          {
            op: 'replace',
            id: item.id,
            expect: expectOf(item),
            old_patch: {},
            old_events: [
              { kind: 'calendar_edit_after_close', payload: { moved_to: fields.logical_date } },
            ],
            item: fields,
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
          events: [{ kind: 'calendar_edit_after_close' }],
        },
      ],
      seen: [],
    };
  }

  const restoring = item.status === 'deleted';
  const status: ItemStatus = restoring ? activeStatus(fields.points) : item.status;
  const events: AuditEvent[] = restoring ? [{ kind: 'restored' }] : [];

  if (startChanged) {
    // Judge the move by when it was made in Google, not when this sync happens to run.
    const movedAt = e.updated && Date.parse(e.updated) <= ctx.now.getTime() ? e.updated : ctx.now;
    const move = classifyMove(
      { status, startAt: item.start_at, logicalDate: item.logical_date },
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
    events.push({
      kind: 'moved',
      payload: {
        from: item.start_at,
        to: fields.start_at,
        rule: move === 'same_day' ? 'M1' : 'M2',
      },
    });
  }

  const titleChanged = restoring || item.raw_title !== fields.raw_title;
  const patch: Partial<ItemFields> = {
    is_all_day: fields.is_all_day,
    recurring_event_id: fields.recurring_event_id,
    google_etag: fields.google_etag,
    google_updated_at: fields.google_updated_at,
    color_key: fields.color_key,
  };
  if (titleChanged) {
    patch.title = fields.title;
    patch.raw_title = fields.raw_title;
  }
  if (fields.points !== item.points) patch.points = fields.points;
  if (fields.logical_date !== item.logical_date) patch.logical_date = fields.logical_date;
  if (startChanged) patch.start_at = fields.start_at;
  if (item.end_at === null || Date.parse(item.end_at) !== Date.parse(fields.end_at)) {
    patch.end_at = fields.end_at;
  }
  if (fields.planned_minutes !== item.planned_minutes) {
    patch.planned_minutes = fields.planned_minutes;
  }

  // Points crossing 0 switch between a task and a non-task (E2). A done item stays done.
  let nextStatus = status;
  if (status === 'pending' && fields.points === 0) nextStatus = 'ignored';
  if (status === 'ignored' && fields.points > 0) nextStatus = 'pending';
  if (nextStatus !== item.status) patch.status = nextStatus;
  if (fields.points !== item.points) {
    events.push({ kind: 'points_changed', payload: { from: item.points, to: fields.points } });
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

export function planPage(events: GEvent[], items: ItemSnapshot[], ctx: PlanContext): PagePlan {
  const byEvent = new Map(items.map((i) => [i.google_event_id, i]));
  const plan: PagePlan = { ops: [], seen: [] };
  for (const e of events) {
    const p = planEvent(e, byEvent.get(e.id) ?? null, ctx);
    plan.ops.push(...p.ops);
    plan.seen.push(...p.seen);
  }
  return plan;
}

/** End of a full sync: active items Google no longer returns are deleted (D1, D2). */
export function planUnseen(items: ItemSnapshot[], _ctx: PlanContext): SyncOp[] {
  return items.map((i) => planGone(i, null)).filter((op): op is SyncOp => op !== null);
}
