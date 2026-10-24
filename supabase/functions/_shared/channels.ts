// Watch channel jobs from the `jobs` queue (plan 8.6). Talks to Google and the database through
// injected dependencies so tests use fakes.
import {
  type FetchFn,
  GoogleError,
  ReconnectNeededError,
  stopChannel,
  watchEvents,
} from './google.ts';

export interface WatchJob {
  kind: 'watch';
  calendar_id: string;
  /** The expiring channel this one replaces; it is stopped once the new one exists. */
  replace: string | null;
  address: string;
}

export interface StopJob {
  kind: 'stop_channel';
  channel_id: string;
}

export interface WatchContext {
  user_id: string;
  google_calendar_id: string;
  sync_enabled: boolean;
  channels: { id: string; resource_id: string | null; expires_at: string }[];
}

export interface StoredChannel {
  id: string;
  user_id: string;
  resource_id: string | null;
  stopped_at: string | null;
}

export interface ChannelDeps {
  context(calendarId: string): Promise<WatchContext | null>;
  channel(id: string): Promise<StoredChannel | null>;
  save(c: {
    id: string;
    calendar_id: string;
    user_id: string;
    resource_id: string;
    token_hash: string;
    expires_at: string;
  }): Promise<void>;
  stopped(id: string): Promise<void>;
  /** Google refused to watch this calendar; stop asking and let polling cover it. */
  pushUnsupported(calendarId: string, reason: string): Promise<void>;
  accessToken(userId: string): Promise<string>;
  newId(): string;
  newSecret(): string;
  hash(secret: string): Promise<string>;
  fetchFn?: FetchFn;
  now?: () => Date;
}

/** Ask Google for a week; it may give less. Renewals start 24 hours before expiry. */
export const CHANNEL_DAYS = 7;
const DAY = 86_400_000;

export async function runWatch(job: WatchJob, deps: ChannelDeps): Promise<string> {
  const now = deps.now?.() ?? new Date();
  const ctx = await deps.context(job.calendar_id);
  if (!ctx || !ctx.sync_enabled) return 'skipped';

  // Idempotent: a queued job may run twice, and an hourly check may race a renewal.
  const healthy = ctx.channels.some(
    (c) => c.id !== job.replace && Date.parse(c.expires_at) > now.getTime() + DAY,
  );
  if (!healthy) {
    const token = await deps.accessToken(ctx.user_id);
    const id = deps.newId();
    const secret = deps.newSecret();
    let res;
    try {
      res = await watchEvents(
        token,
        ctx.google_calendar_id,
        { id, token: secret, address: job.address, expiration: now.getTime() + CHANNEL_DAYS * DAY },
        deps.fetchFn,
      );
    } catch (err) {
      if (isPermanentRefusal(err)) {
        await deps.pushUnsupported(job.calendar_id, `${err.status} ${err.code}`);
        return 'push_unsupported';
      }
      throw err;
    }
    await deps.save({
      id,
      calendar_id: job.calendar_id,
      user_id: ctx.user_id,
      resource_id: res.resourceId,
      token_hash: await deps.hash(secret),
      expires_at: new Date(res.expiration).toISOString(),
    });
  }
  // Create the new channel first, then stop the old one; they may overlap briefly (Google's advice).
  if (job.replace) await runStop({ kind: 'stop_channel', channel_id: job.replace }, deps);
  return healthy ? 'already_watching' : 'watching';
}

/**
 * A client error that retrying will not fix: 400 and 404, or 403 other than rate limits.
 * Public calendars such as "Holidays in India" are refused this way.
 */
function isPermanentRefusal(err: unknown): err is GoogleError {
  if (!(err instanceof GoogleError)) return false;
  if (err.status === 400 || err.status === 404) return true;
  return err.status === 403 && !/rate|quota/i.test(err.code);
}

export async function runStop(job: StopJob, deps: ChannelDeps): Promise<string> {
  const ch = await deps.channel(job.channel_id);
  if (!ch || ch.stopped_at) return 'skipped';
  if (ch.resource_id) {
    try {
      await stopChannel(await deps.accessToken(ch.user_id), ch.id, ch.resource_id, deps.fetchFn);
    } catch (err) {
      // Without access Google cannot be told; the channel simply expires.
      if (
        !(err instanceof ReconnectNeededError) &&
        !(err instanceof GoogleError && err.status === 401)
      ) {
        throw err;
      }
    }
  }
  await deps.stopped(ch.id);
  return 'stopped';
}
