// app-api: every user-facing route that touches Google (plan 9.3). One function, one warm isolate.
import {
  addDays,
  type ColorRule,
  colorForPoints,
  logicalDate,
  parseTitle,
  shiftLocalDays,
} from '@mjolnir/domain';
import { pkceChallenge, randomToken } from '../_shared/crypto.ts';
import {
  appProperties,
  buildConsentUrl,
  deleteEvent,
  type EventPatch,
  type FetchFn,
  GoogleError,
  type GoogleOAuthConfig,
  insertEvent,
  patchEvent,
  ReconnectNeededError,
  revokeToken,
  stopChannel,
} from '../_shared/google.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { planEvent } from '../_shared/sync/plan.ts';
import type { ItemSnapshot, PlanContext, SyncOp } from '../_shared/sync/types.ts';
import { withCheckmark } from '../_shared/writes.ts';
import {
  deleteTask,
  insertTask,
  listTaskLists,
  patchTask,
  type TaskPatch,
} from '../_shared/tasks.ts';
import { planTask, type TaskOp, type TaskSnapshot } from '../_shared/sync/tasks.ts';

export interface AppUser {
  id: string;
  email: string | null;
}

/** A Postgres error from an RPC, carrying its SQLSTATE so routes can answer with the right status. */
export class RpcError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface PreparedReschedule {
  item_id: string;
  original_id: string;
  google_event_id: string;
  google_calendar_id: string;
  summary: string;
  points: number;
  time_zone: string;
  tags: string[];
  /** Deadline ids the item is linked to, for pt_deadlines. */
  deadlines?: string[];
  color_rules: ColorRule[];
}

/** Settings and the calendar new events go to (svc_app_context). */
export interface AppContext {
  timezone: string;
  day_boundary_hour: number;
  include_all_day: boolean;
  writeback_checkmark: boolean;
  color_rules: ColorRule[];
  calendar: { id: string; google_calendar_id: string } | null;
}

/** An item app-api is about to change (svc_edit_context). */
export interface EditContext extends ItemSnapshot {
  source: string;
  google_active: boolean;
  calendar_id: string | null;
  google_calendar_id: string | null;
  access_role: string | null;
}

export interface PreparedSchedule {
  item_id: string;
  google_event_id: string;
  google_calendar_id: string;
  summary: string;
  points: number;
  time_zone: string;
  previous_date: string | null;
  previous_minutes: number | null;
  tags: string[];
  deadlines?: string[];
  color_rules: ColorRule[];
}

/** Settings and the list new Google tasks go to (svc_task_app_context). */
export interface TaskAppContext {
  timezone: string;
  day_boundary_hour: number;
  google_item_type: string;
  list: { id: string; google_tasklist_id: string; points: number } | null;
}

/** A Google task item app-api is about to change (svc_task_edit_context). */
export interface TaskEditContext extends TaskSnapshot {
  source: string;
  google_active: boolean;
  task_list_id: string | null;
  google_tasklist_id: string | null;
}

interface InboxItem {
  id: string;
  source: string;
  logical_date: string;
  start_at: string | null;
  end_at: string | null;
}

export interface AppApiDeps {
  appUrl: string;
  cfg: GoogleOAuthConfig;
  /** Resolves the Supabase user from the request's bearer token, or null. */
  authenticate(req: Request): Promise<AppUser | null>;
  saveOAuthState(userId: string, nonce: string, codeVerifier: string): Promise<void>;
  /** Calls a Postgres function as the caller, under row-level security. Throws RpcError. */
  userRpc<T>(req: Request, name: string, args?: Record<string, unknown>): Promise<T>;
  profile(userId: string): Promise<{ timezone: string; day_boundary_hour: number }>;
  accessToken(userId: string): Promise<string>;
  items: {
    appContext(userId: string): Promise<AppContext>;
    editContext(userId: string, itemId: string): Promise<EditContext | null>;
    /** Applies planner ops like a sync does. Throws RpcError. */
    applyOps(calendarId: string, ops: SyncOp[]): Promise<{ applied: number; skipped: number }>;
    schedulePrepare(
      userId: string,
      itemId: string,
      start: string,
      end: string,
    ): Promise<PreparedSchedule>;
    scheduleAbort(itemId: string, date: string | null, minutes: number | null): Promise<void>;
    newItemId(): string;
  };
  reschedule: {
    prepare(
      userId: string,
      itemId: string,
      start: string,
      end: string,
    ): Promise<PreparedReschedule>;
    commit(itemId: string, etag: string): Promise<void>;
    abort(itemId: string): Promise<void>;
  };
  tasks: {
    appContext(userId: string): Promise<TaskAppContext>;
    editContext(userId: string, itemId: string): Promise<TaskEditContext | null>;
    /** Applies task planner ops like a poll does. Throws RpcError. */
    applyOps(listId: string, ops: TaskOp[]): Promise<{ applied: number; skipped: number }>;
    upsertLists(userId: string, lists: { id: string; title: string }[]): Promise<void>;
  };
  account: {
    /** Live watch channels to stop before the account goes. */
    channels(userId: string): Promise<{ id: string; resource_id: string }[]>;
    /** The decrypted Google refresh token, or null when Google was never connected. */
    refreshToken(userId: string): Promise<string | null>;
    /** Deletes the auth user; every row cascades. */
    deleteUser(userId: string): Promise<void>;
  };
  fetchFn?: FetchFn;
  now?: () => Date;
}

type Handler = (
  req: Request,
  user: AppUser,
  deps: AppApiDeps,
  params: Record<string, string>,
) => Promise<Response>;

const routes: { method: string; pattern: RegExp; handler: Handler }[] = [
  { method: 'POST', pattern: /^\/google\/connect$/, handler: connectGoogle },
  {
    method: 'POST',
    pattern: /^\/missed\/(?<id>[0-9a-f-]{36})\/reschedule$/,
    handler: rescheduleMissed,
  },
  { method: 'POST', pattern: /^\/missed\/bulk$/, handler: bulkMissed },
  { method: 'POST', pattern: /^\/items$/, handler: createEvent },
  { method: 'PATCH', pattern: /^\/items\/(?<id>[0-9a-f-]{36})$/, handler: editEvent },
  { method: 'DELETE', pattern: /^\/items\/(?<id>[0-9a-f-]{36})$/, handler: deleteItemEvent },
  { method: 'POST', pattern: /^\/items\/(?<id>[0-9a-f-]{36})\/schedule$/, handler: scheduleTask },
  { method: 'DELETE', pattern: /^\/me$/, handler: deleteAccount },
  { method: 'POST', pattern: /^\/google\/task-lists$/, handler: refreshTaskLists },
  { method: 'POST', pattern: /^\/tasks$/, handler: createTask },
  { method: 'PATCH', pattern: /^\/tasks\/(?<id>[0-9a-f-]{36})$/, handler: editTask },
  { method: 'DELETE', pattern: /^\/tasks\/(?<id>[0-9a-f-]{36})$/, handler: deleteTaskItem },
];

/** Path after the function name: `/functions/v1/app-api/google/connect` -> `/google/connect`. */
function routePath(url: URL): string {
  const i = url.pathname.indexOf('/app-api');
  const rest = i === -1 ? url.pathname : url.pathname.slice(i + '/app-api'.length);
  return rest.replace(/\/+$/, '') || '/';
}

const STATUS_FOR_SQLSTATE: Record<string, number> = {
  P0002: 404,
  '22023': 400,
  '42501': 403,
  '23503': 400,
};

export function createAppApi(deps: AppApiDeps) {
  const cors = corsHeaders(deps.appUrl);
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const path = routePath(new URL(req.url));
    let match: { handler: Handler; params: Record<string, string> } | null = null;
    for (const r of routes) {
      const m = r.method === req.method ? r.pattern.exec(path) : null;
      if (m) match = { handler: r.handler, params: m.groups ?? {} };
    }
    if (!match) return json({ error: 'not_found' }, 404, cors);

    const user = await deps.authenticate(req);
    if (!user) return json({ error: 'unauthorized' }, 401, cors);

    try {
      const res = await match.handler(req, user, deps, match.params);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (err) {
      if (err instanceof RpcError && STATUS_FOR_SQLSTATE[err.code]) {
        return json({ error: err.message }, STATUS_FOR_SQLSTATE[err.code], cors);
      }
      if (err instanceof ReconnectNeededError) {
        return json({ error: 'reconnect_needed' }, 409, cors);
      }
      console.error('app-api route failed', err instanceof Error ? err.message : 'unknown');
      return json({ error: 'internal' }, 500, cors);
    }
  };
}

/** Plan 8.1 step 1: store a single-use nonce and PKCE verifier, return Google's consent URL. */
async function connectGoogle(req: Request, user: AppUser, deps: AppApiDeps): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const nonce = randomToken(32);
  const verifier = randomToken(48);
  await deps.saveOAuthState(user.id, nonce, verifier);
  const url = buildConsentUrl(deps.cfg, {
    state: nonce,
    codeChallenge: await pkceChallenge(verifier),
    loginHint: user.email ?? undefined,
    // Tasks mode asks for Google Tasks access too (8.1); Events mode never does.
    tasks: body?.tasks === true,
  });
  return json({ url });
}

function isInstant(v: unknown): v is string {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v));
}

/**
 * Reschedule one missed calendar item (3.5): a new Google event with the same title, tags,
 * colour and duration, and a new pending item linked to the original, which stays missed.
 * The item is created first with a chosen event id; if Google refuses, everything is undone.
 */
async function rescheduleCalendar(
  user: AppUser,
  itemId: string,
  start: string,
  end: string,
  deps: AppApiDeps,
): Promise<string> {
  const token = await deps.accessToken(user.id);
  const p = await deps.reschedule.prepare(user.id, itemId, start, end);
  const color = colorForPoints(p.color_rules, Math.min(3, Math.max(1, p.points)) as 1 | 2 | 3);
  try {
    const created = await insertEvent(
      token,
      p.google_calendar_id,
      {
        id: p.google_event_id,
        summary: p.summary,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        timeZone: p.time_zone,
        colorId: color && color !== 'default' ? color : null,
        privateProperties: appProperties(p.item_id, p.tags, p.deadlines),
      },
      deps.fetchFn,
    );
    await deps.reschedule.commit(p.item_id, created.etag);
    return p.item_id;
  } catch (err) {
    await deps.reschedule.abort(p.item_id);
    throw err;
  }
}

async function rescheduleMissed(
  req: Request,
  user: AppUser,
  deps: AppApiDeps,
  params: Record<string, string>,
): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  if (
    !isInstant(body.start) ||
    !isInstant(body.end) ||
    Date.parse(body.end) <= Date.parse(body.start)
  ) {
    return json({ error: 'start and end must be times, with end after start' }, 400);
  }
  try {
    const id = await rescheduleCalendar(user, params.id!, body.start, body.end, deps);
    return json({ item_id: id }, 201);
  } catch (err) {
    if (err instanceof RpcError || err instanceof ReconnectNeededError) throw err;
    return json({ error: 'google_failed' }, 502);
  }
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** "Reschedule all to tomorrow, same times" and "Dismiss all" (3.5). */
async function bulkMissed(req: Request, user: AppUser, deps: AppApiDeps): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  if (body.action === 'dismiss_all') {
    const count = await deps.userRpc<number>(req, 'dismiss_all_missed');
    return json({ dismissed: count });
  }
  if (body.action !== 'reschedule_tomorrow') {
    return json({ error: 'action must be reschedule_tomorrow or dismiss_all' }, 400);
  }

  const profile = await deps.profile(user.id);
  const now = deps.now?.() ?? new Date();
  const tomorrow = addDays(logicalDate(now, profile.timezone, profile.day_boundary_hour), 1);
  const inbox = await deps.userRpc<InboxItem[]>(req, 'missed_inbox');
  let rescheduled = 0;
  let failed = 0;

  for (const item of inbox) {
    try {
      if (item.source === 'calendar' && item.start_at && item.end_at) {
        const shift = daysBetween(item.logical_date, tomorrow);
        await rescheduleCalendar(
          user,
          item.id,
          shiftLocalDays(item.start_at, shift, profile.timezone).toISOString(),
          shiftLocalDays(item.end_at, shift, profile.timezone).toISOString(),
          deps,
        );
      } else {
        await deps.userRpc(req, 'reschedule_manual', { p_id: item.id, p_date: tomorrow });
      }
      rescheduled++;
    } catch (err) {
      if (err instanceof ReconnectNeededError) throw err;
      failed++;
    }
  }
  return json({ rescheduled, failed });
}

// Events created and edited in the app (plan 9.3, Phase 6) ---------------------------------------
// Each route writes to Google first, then runs Google's answer through the same planner the sync
// uses, so moves, deletes and colour changes follow section 3.4 exactly as edits made in Google.
// The stored etag makes the sync skip the echo of our own write.

/** Events made in the app are never too far off to keep, unlike sync's 30/90-day window. */
const APP_WINDOW_MS = 10 * 365 * 86_400_000;

function planContext(ctx: AppContext, now: Date): PlanContext {
  return {
    timeZone: ctx.timezone,
    boundaryHour: ctx.day_boundary_hour,
    includeAllDay: ctx.include_all_day,
    rules: ctx.color_rules,
    now,
    window: {
      from: new Date(now.getTime() - APP_WINDOW_MS),
      to: new Date(now.getTime() + APP_WINDOW_MS),
    },
  };
}

/** Google colour for points, or null for the calendar default. Throws when no colour maps to it. */
function colorFor(rules: ColorRule[], points: number): string | null {
  const key = colorForPoints(rules, points as 1 | 2 | 3);
  if (!key)
    throw new RpcError('22023', `No colour is worth ${points} points. Map one in Settings.`);
  return key === 'default' ? null : key;
}

function validPoints(v: unknown): v is 1 | 2 | 3 {
  return v === 1 || v === 2 || v === 3;
}

/** Gives new items (create, or the new slot of a replace) ids chosen here. */
function withNewIds(
  ops: SyncOp[],
  newId: () => string,
  first?: string,
): { ops: SyncOp[]; itemId: string | null } {
  let itemId: string | null = null;
  const out = ops.map((op) => {
    if (op.op === 'update') return op;
    const id = itemId ?? first ?? newId();
    itemId = id;
    return { ...op, item: { ...op.item, id } };
  });
  return { ops: out, itemId };
}

/** Google refused because the calendar is read-only or the event is gone: say so plainly. */
function googleRefusal(err: unknown): Response | null {
  if (!(err instanceof GoogleError)) return null;
  if (err.status === 403 && !/rate|quota/i.test(err.code)) {
    return json({ error: 'This calendar is read-only in Google.' }, 403);
  }
  if (err.status === 404 || err.status === 410) {
    return json({ error: 'This event no longer exists in Google Calendar.' }, 404);
  }
  return json({ error: 'google_failed' }, 502);
}

async function createEvent(req: Request, user: AppUser, deps: AppApiDeps): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (
    !title ||
    !validPoints(body.points) ||
    !isInstant(body.start) ||
    !isInstant(body.end) ||
    Date.parse(body.end) <= Date.parse(body.start)
  ) {
    return json(
      { error: 'title, points (1 to 3), start and end are required, with end after start' },
      400,
    );
  }
  const ctx = await deps.items.appContext(user.id);
  if (!ctx.calendar) return json({ error: 'Enable a calendar Mjolnir can write to first.' }, 400);

  const token = await deps.accessToken(user.id);
  const itemId = deps.items.newItemId();
  let event;
  try {
    event = await insertEvent(
      token,
      ctx.calendar.google_calendar_id,
      {
        // The item id doubles as the event id: hex, so valid base32hex for Google.
        id: itemId.replaceAll('-', ''),
        summary: title,
        start: new Date(body.start).toISOString(),
        end: new Date(body.end).toISOString(),
        timeZone: ctx.timezone,
        colorId: colorFor(ctx.color_rules, body.points),
        privateProperties: appProperties(itemId, parseTitle(title).tags),
      },
      deps.fetchFn,
    );
  } catch (err) {
    const refusal = googleRefusal(err);
    if (refusal) return refusal;
    throw err;
  }

  const plan = planEvent(event, null, planContext(ctx, deps.now?.() ?? new Date()));
  const { ops } = withNewIds(plan.ops, deps.items.newItemId, itemId);
  try {
    await deps.items.applyOps(ctx.calendar.id, ops);
  } catch (err) {
    // The webhook sync got there first and already created the item: nothing left to do.
    if (!(err instanceof RpcError && err.code === '23505')) throw err;
  }
  return json({ item_id: itemId }, 201);
}

async function editEvent(
  req: Request,
  user: AppUser,
  deps: AppApiDeps,
  params: Record<string, string>,
): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const item = await deps.items.editContext(user.id, params.id!);
  if (
    !item ||
    item.source !== 'calendar' ||
    !item.google_active ||
    item.status === 'deleted' ||
    !item.google_calendar_id ||
    !item.calendar_id
  ) {
    return json({ error: 'event not found' }, 404);
  }
  const ctx = await deps.items.appContext(user.id);

  const patch: EventPatch = {};
  if (body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return json({ error: 'the title cannot be empty' }, 400);
    // Keep the ✓ a done item already shows.
    patch.summary = withCheckmark(title, item.status === 'done' && ctx.writeback_checkmark);
  }
  if (body.points !== undefined) {
    if (!validPoints(body.points)) return json({ error: 'points must be 1 to 3' }, 400);
    patch.colorId = colorFor(ctx.color_rules, body.points);
  }
  if (body.start !== undefined || body.end !== undefined) {
    if (
      !isInstant(body.start) ||
      !isInstant(body.end) ||
      Date.parse(body.end) <= Date.parse(body.start)
    ) {
      return json({ error: 'start and end must be times, with end after start' }, 400);
    }
    patch.start = { dateTime: new Date(body.start).toISOString(), timeZone: ctx.timezone };
    patch.end = { dateTime: new Date(body.end).toISOString(), timeZone: ctx.timezone };
  }
  if (Object.keys(patch).length === 0) return json({ error: 'nothing to change' }, 400);

  let event;
  try {
    event = await patchEvent(
      await deps.accessToken(user.id),
      item.google_calendar_id,
      item.google_event_id,
      patch,
      {},
      deps.fetchFn,
    );
  } catch (err) {
    const refusal = googleRefusal(err);
    if (refusal) return refusal;
    throw err;
  }

  // A move to another day after the start becomes a miss plus a new item (M3), as in Google.
  const plan = planEvent(event, item, planContext(ctx, deps.now?.() ?? new Date()));
  const { ops, itemId } = withNewIds(plan.ops, deps.items.newItemId);
  const result = await deps.items.applyOps(item.calendar_id, ops);
  if (result.skipped > 0) return json({ error: 'The item changed meanwhile. Try again.' }, 409);
  return json({ item_id: itemId ?? item.id });
}

async function deleteItemEvent(
  _req: Request,
  user: AppUser,
  deps: AppApiDeps,
  params: Record<string, string>,
): Promise<Response> {
  const item = await deps.items.editContext(user.id, params.id!);
  if (
    !item ||
    item.source !== 'calendar' ||
    !item.google_active ||
    item.status === 'deleted' ||
    !item.google_calendar_id ||
    !item.calendar_id
  ) {
    return json({ error: 'event not found' }, 404);
  }
  try {
    await deleteEvent(
      await deps.accessToken(user.id),
      item.google_calendar_id,
      item.google_event_id,
      deps.fetchFn,
    );
  } catch (err) {
    const refusal = googleRefusal(err);
    if (refusal) return refusal;
    throw err;
  }
  // Before day close the item drops out of the score (D1); after, it keeps its final status (D2).
  const ctx = await deps.items.appContext(user.id);
  const plan = planEvent(
    { id: item.google_event_id, status: 'cancelled' },
    item,
    planContext(ctx, deps.now?.() ?? new Date()),
  );
  await deps.items.applyOps(item.calendar_id, plan.ops);
  return json({ item_id: item.id });
}

/** Schedule a manual task: it becomes an event in Google and a calendar item in place. */
async function scheduleTask(
  req: Request,
  user: AppUser,
  deps: AppApiDeps,
  params: Record<string, string>,
): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  if (
    !isInstant(body.start) ||
    !isInstant(body.end) ||
    Date.parse(body.end) <= Date.parse(body.start)
  ) {
    return json({ error: 'start and end must be times, with end after start' }, 400);
  }
  const token = await deps.accessToken(user.id);
  const p = await deps.items.schedulePrepare(user.id, params.id!, body.start, body.end);
  try {
    const event = await insertEvent(
      token,
      p.google_calendar_id,
      {
        id: p.google_event_id,
        summary: p.summary,
        start: new Date(body.start).toISOString(),
        end: new Date(body.end).toISOString(),
        timeZone: p.time_zone,
        colorId: colorFor(p.color_rules, p.points),
        privateProperties: appProperties(p.item_id, p.tags, p.deadlines),
      },
      deps.fetchFn,
    );
    await deps.reschedule.commit(p.item_id, event.etag);
    return json({ item_id: p.item_id });
  } catch (err) {
    await deps.items.scheduleAbort(p.item_id, p.previous_date, p.previous_minutes);
    const refusal = googleRefusal(err);
    if (refusal) return refusal;
    throw err;
  }
}

/**
 * Account deletion (section 13): stop watch channels, revoke the Google token, then delete the
 * auth user, which removes every row. Google steps are best effort: a failure there never keeps
 * the account alive.
 */
async function deleteAccount(req: Request, user: AppUser, deps: AppApiDeps): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  if (body.confirm !== 'delete') {
    return json({ error: 'send {"confirm": "delete"} to delete the account' }, 400);
  }
  const steps: string[] = [];
  const token = await deps.accessToken(user.id).catch(() => null);
  if (token) {
    for (const c of await deps.account.channels(user.id)) {
      await stopChannel(token, c.id, c.resource_id, deps.fetchFn).then(
        () => steps.push('channel_stopped'),
        () => steps.push('channel_stop_failed'),
      );
    }
  }
  const refresh = await deps.account.refreshToken(user.id).catch(() => null);
  if (refresh) {
    await revokeToken(refresh, deps.fetchFn).then(
      () => steps.push('google_revoked'),
      () => steps.push('google_revoke_failed'),
    );
  }
  await deps.account.deleteUser(user.id);
  return json({ deleted: true, steps });
}

// Google Tasks mode (3.13, 8.9): the same pattern as events. Google first; its answer then runs
// through the task planner, so app edits follow the same rules as edits made in Google.

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function taskContext(ctx: TaskAppContext, points: number, now: Date) {
  return {
    timeZone: ctx.timezone,
    boundaryHour: ctx.day_boundary_hour,
    points,
    now,
    since: null,
  };
}

async function refreshTaskLists(_req: Request, user: AppUser, deps: AppApiDeps): Promise<Response> {
  const lists = await listTaskLists(await deps.accessToken(user.id), deps.fetchFn).catch((err) => {
    if (err instanceof GoogleError && err.status === 403) return null;
    throw err;
  });
  if (!lists) return json({ error: 'Connect Google Tasks first.' }, 409);
  await deps.tasks.upsertLists(user.id, lists);
  return json({ lists: lists.length });
}

async function createTask(req: Request, user: AppUser, deps: AppApiDeps): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const date = body.date ?? null;
  const points = body.points ?? null;
  if (!title || (date !== null && !DATE.test(date))) {
    return json({ error: 'a task needs a title and a YYYY-MM-DD date or none' }, 400);
  }
  if (points !== null && ![1, 2, 3].includes(points)) {
    return json({ error: 'points must be 1 to 3' }, 400);
  }
  const ctx = await deps.tasks.appContext(user.id);
  if (!ctx.list) return json({ error: 'Turn on a Google Tasks list in Settings first.' }, 409);

  const task = await insertTask(
    await deps.accessToken(user.id),
    ctx.list.google_tasklist_id,
    { title, due: date },
    deps.fetchFn,
  ).catch((err) => {
    throw googleRefusalError(err);
  });
  const plan = planTask(
    task,
    null,
    taskContext(ctx, points ?? ctx.list.points, deps.now?.() ?? new Date()),
  );
  await deps.tasks.applyOps(ctx.list.id, plan.ops);
  return json({ created: plan.ops.length }, 201);
}

async function editTask(
  req: Request,
  user: AppUser,
  deps: AppApiDeps,
  params: Record<string, string>,
): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const patch: TaskPatch = {};
  if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim();
  if (body.date === null || (typeof body.date === 'string' && DATE.test(body.date))) {
    patch.due = body.date;
  }
  if (!Object.keys(patch).length) return json({ error: 'nothing to change' }, 400);

  const item = await deps.tasks.editContext(user.id, params.id!);
  if (!item || item.source !== 'gtask' || !item.google_active || !item.task_list_id) {
    return json({ error: 'task not found' }, 404);
  }
  if (item.finalized) return json({ error: 'this day is closed' }, 400);
  const ctx = await deps.tasks.appContext(user.id);
  const task = await patchTask(
    await deps.accessToken(user.id),
    item.google_tasklist_id!,
    item.google_task_id,
    patch,
    deps.fetchFn,
  ).catch((err) => {
    throw googleRefusalError(err);
  });
  const plan = planTask(task, item, taskContext(ctx, item.points, deps.now?.() ?? new Date()));
  await deps.tasks.applyOps(item.task_list_id, plan.ops);
  return json({ item_id: item.id });
}

async function deleteTaskItem(
  _req: Request,
  user: AppUser,
  deps: AppApiDeps,
  params: Record<string, string>,
): Promise<Response> {
  const item = await deps.tasks.editContext(user.id, params.id!);
  if (!item || item.source !== 'gtask' || !item.google_active || !item.task_list_id) {
    return json({ error: 'task not found' }, 404);
  }
  await deleteTask(
    await deps.accessToken(user.id),
    item.google_tasklist_id!,
    item.google_task_id,
    deps.fetchFn,
  ).catch((err) => {
    throw googleRefusalError(err);
  });
  const ctx = await deps.tasks.appContext(user.id);
  const plan = planTask(
    { id: item.google_task_id, deleted: true },
    item,
    taskContext(ctx, item.points, deps.now?.() ?? new Date()),
  );
  await deps.tasks.applyOps(item.task_list_id, plan.ops);
  return json({ item_id: item.id });
}

/** Google's refusal, as the RpcError routes already map to a 400 with a readable message. */
function googleRefusalError(err: unknown): unknown {
  if (err instanceof GoogleError && err.status < 500 && err.status !== 401 && err.status !== 429) {
    return new RpcError('22023', `Google Tasks refused the change (${err.code}).`);
  }
  return err;
}
