// app-api: every user-facing route that touches Google (plan 9.3). One function, one warm isolate.
import {
  addDays,
  type ColorRule,
  colorForPoints,
  logicalDate,
  shiftLocalDays,
} from '@mjolnir/domain';
import { pkceChallenge, randomToken } from '../_shared/crypto.ts';
import {
  appProperties,
  buildConsentUrl,
  type FetchFn,
  type GoogleOAuthConfig,
  insertEvent,
  ReconnectNeededError,
} from '../_shared/google.ts';
import { corsHeaders, json } from '../_shared/http.ts';

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
  color_rules: ColorRule[];
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
async function connectGoogle(_req: Request, user: AppUser, deps: AppApiDeps): Promise<Response> {
  const nonce = randomToken(32);
  const verifier = randomToken(48);
  await deps.saveOAuthState(user.id, nonce, verifier);
  const url = buildConsentUrl(deps.cfg, {
    state: nonce,
    codeChallenge: await pkceChallenge(verifier),
    loginHint: user.email ?? undefined,
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
        privateProperties: appProperties(p.item_id, p.tags),
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
