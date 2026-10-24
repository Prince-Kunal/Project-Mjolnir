// One sync run for one calendar (plan 8.3 and 8.4). Talks to Google and to the database through
// injected dependencies so tests use fakes.
import type { ColorRule } from '@mjolnir/domain';
import { CALENDAR_API, type FetchFn, ReconnectNeededError } from '../google.ts';
import { planPage, planUnseen } from './plan.ts';
import type { GEvent, ItemSnapshot, PlanContext, SyncOp } from './types.ts';

export interface Lease {
  source_id: string;
  user_id: string;
  google_calendar_id: string;
  run_kind: 'incremental' | 'reconcile' | 'full';
  run_started_at: string;
  window_from: string;
  window_to: string;
  sync_token: string | null;
  page_token: string | null;
  attempts: number;
  profile: { timezone: string; day_boundary_hour: number; include_all_day: boolean };
  color_rules: ColorRule[];
}

export interface SyncStore {
  lease(sourceId: string): Promise<Lease | null>;
  items(calendarId: string, eventIds: string[]): Promise<ItemSnapshot[]>;
  unseen(calendarId: string): Promise<ItemSnapshot[]>;
  apply(
    calendarId: string,
    ops: SyncOp[],
    seen: string[],
  ): Promise<{ applied: number; skipped: number }>;
  checkpoint(sourceId: string, pageToken: string | null): Promise<void>;
  /** A null token makes the next run a full sync. */
  finish(sourceId: string, syncToken: string | null): Promise<void>;
  /** `retrySeconds` null means do not retry; `reset` clears the sync token (HTTP 410). */
  fail(sourceId: string, error: string, retrySeconds: number | null, reset: boolean): Promise<void>;
}

export interface SyncDeps {
  store: SyncStore;
  accessToken(userId: string): Promise<string>;
  fetchFn?: FetchFn;
  now?: () => Date;
  /** Epoch ms after which no new page is started. */
  deadline: number;
}

export type SyncOutcome = 'done' | 'continued' | 'skipped' | 'retry' | 'reset' | 'reconnect';

const PAGE_SIZE = '250';
const FIELDS =
  'nextPageToken,nextSyncToken,items(id,status,etag,summary,colorId,start,end,recurringEventId,' +
  'updated,eventType,attendees(self,responseStatus),extendedProperties(private))';

/** Growing delay for 429 and 5xx: 30 s, 60 s, 2 min, 4 min, 8 min. */
export function backoffSeconds(attempts: number): number {
  return Math.min(30 * 2 ** attempts, 480);
}

function listUrl(lease: Lease, pageToken: string | null): string {
  const params = new URLSearchParams({
    singleEvents: 'true',
    showDeleted: 'true',
    maxResults: PAGE_SIZE,
    fields: FIELDS,
  });
  if (lease.run_kind === 'incremental' && lease.sync_token) {
    // Google forbids timeMin/timeMax with a sync token; the planner drops far-off events instead.
    params.set('syncToken', lease.sync_token);
  } else {
    params.set('timeMin', lease.window_from);
    params.set('timeMax', lease.window_to);
  }
  if (pageToken) params.set('pageToken', pageToken);
  return `${CALENDAR_API}/calendars/${encodeURIComponent(lease.google_calendar_id)}/events?${params}`;
}

export async function syncSource(sourceId: string, deps: SyncDeps): Promise<SyncOutcome> {
  const now = () => deps.now?.() ?? new Date();
  const fetchFn = deps.fetchFn ?? fetch;
  const { store } = deps;

  const lease = await store.lease(sourceId);
  if (!lease) return 'skipped';

  let token: string;
  try {
    token = await deps.accessToken(lease.user_id);
  } catch (err) {
    if (err instanceof ReconnectNeededError) {
      await store.fail(sourceId, 'reconnect_needed', null, false);
      return 'reconnect';
    }
    throw err;
  }

  const ctx = (): PlanContext => ({
    timeZone: lease.profile.timezone,
    boundaryHour: lease.profile.day_boundary_hour,
    includeAllDay: lease.profile.include_all_day,
    rules: lease.color_rules,
    now: now(),
    window: { from: new Date(lease.window_from), to: new Date(lease.window_to) },
  });

  let pageToken = lease.page_token;
  while (true) {
    if (now().getTime() >= deps.deadline) {
      await store.checkpoint(sourceId, pageToken);
      return 'continued';
    }

    const res = await fetchFn(listUrl(lease, pageToken), {
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.status === 410) {
      await res.body?.cancel();
      await store.fail(sourceId, 'sync_token_expired', null, true);
      return 'reset';
    }
    if (!res.ok) {
      await res.body?.cancel();
      const transient = res.status === 429 || res.status >= 500 || res.status === 401;
      await store.fail(
        sourceId,
        `google_${res.status}`,
        transient ? backoffSeconds(lease.attempts) : 600,
        false,
      );
      return 'retry';
    }

    const page = (await res.json()) as {
      items?: GEvent[];
      nextPageToken?: string;
      nextSyncToken?: string;
    };
    const events = page.items ?? [];
    const snapshots = events.length
      ? await store.items(
          sourceId,
          events.map((e) => e.id),
        )
      : [];
    const plan = planPage(events, snapshots, ctx());
    const result = await store.apply(sourceId, plan.ops, plan.seen);
    if (result.skipped > 0) {
      // An item changed while we planned (for example, a tick). Re-run this page fresh.
      await store.checkpoint(sourceId, pageToken);
      return 'continued';
    }

    if (page.nextPageToken) {
      pageToken = page.nextPageToken;
      continue;
    }

    if (lease.run_kind !== 'incremental') {
      const gone = planUnseen(await store.unseen(sourceId), ctx());
      if (gone.length) await store.apply(sourceId, gone, []);
    }
    await store.finish(sourceId, page.nextSyncToken ?? null);
    return 'done';
  }
}
