import type { ColorRule } from '@mjolnir/domain';
import type { Json } from '@mjolnir/db-types';
import {
  type ChannelDeps,
  runStop,
  runWatch,
  type StopJob,
  type WatchJob,
} from '../_shared/channels.ts';
import {
  type CheckmarkJob,
  runCheckmark,
  type WriteContext,
  type WriteDeps,
} from '../_shared/writes.ts';
import {
  decryptToken,
  encryptToken,
  importTokenKey,
  randomToken,
  sha256Hex,
} from '../_shared/crypto.ts';
import { adminClient, googleConfig, requireEnv } from '../_shared/env.ts';
import { accessTokenFor } from '../_shared/google.ts';
import { type Lease, type SyncStore, syncSource } from '../_shared/sync/run.ts';
import type { ItemSnapshot } from '../_shared/sync/types.ts';
import { BadMessage, createWorker, type QueueMessage } from './handler.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const admin = adminClient();
const key = await importTokenKey(requireEnv('TOKEN_ENCRYPTION_KEY'));
const cfg = googleConfig();

function check<T>(
  name: string,
  res: { data: T; error: { code?: string; message: string } | null },
): T {
  if (res.error) throw new Error(`${name}: ${res.error.code ?? res.error.message}`);
  return res.data;
}

const store: SyncStore = {
  async lease(sourceId) {
    const data = check(
      'svc_sync_lease',
      await admin.rpc('svc_sync_lease', { p_source_id: sourceId }),
    );
    if (!data) return null;
    const lease = data as unknown as Lease;
    return { ...lease, color_rules: lease.color_rules as ColorRule[] };
  },
  async items(calendarId, eventIds) {
    const data = check(
      'svc_sync_items',
      await admin.rpc('svc_sync_items', { p_calendar_id: calendarId, p_event_ids: eventIds }),
    );
    return (data ?? []) as unknown as ItemSnapshot[];
  },
  async unseen(calendarId) {
    const data = check(
      'svc_sync_unseen',
      await admin.rpc('svc_sync_unseen', { p_calendar_id: calendarId }),
    );
    return (data ?? []) as unknown as ItemSnapshot[];
  },
  async apply(calendarId, ops, seen) {
    const data = check(
      'svc_apply_sync_ops',
      await admin.rpc('svc_apply_sync_ops', {
        p_calendar_id: calendarId,
        p_ops: ops as unknown as never,
        p_seen: seen,
      }),
    );
    return data as unknown as { applied: number; skipped: number };
  },
  async checkpoint(sourceId, pageToken) {
    check(
      'svc_sync_checkpoint',
      await admin.rpc('svc_sync_checkpoint', {
        p_source_id: sourceId,
        p_page_token: pageToken ?? undefined,
      }),
    );
  },
  async finish(sourceId, syncToken) {
    check(
      'svc_sync_finish',
      await admin.rpc('svc_sync_finish', {
        p_source_id: sourceId,
        p_sync_token: syncToken ?? undefined,
      }),
    );
  },
  async fail(sourceId, error, retrySeconds, reset) {
    check(
      'svc_sync_fail',
      await admin.rpc('svc_sync_fail', {
        p_source_id: sourceId,
        p_error: error,
        p_retry_seconds: retrySeconds ?? undefined,
        p_reset: reset,
      }),
    );
  },
};

function accessToken(userId: string) {
  return accessTokenFor({
    cfg,
    encrypt: (plain) => encryptToken(key, plain),
    decrypt: (sealed) => decryptToken(key, sealed),
    async getAccount() {
      const data = check(
        'svc_get_google_account',
        await admin.rpc('svc_get_google_account', { p_user_id: userId }),
      );
      return data?.[0] ?? null;
    },
    async saveAccessToken(accessTokenEnc, expiresAt) {
      check(
        'svc_update_google_tokens',
        await admin.rpc('svc_update_google_tokens', {
          p_user_id: userId,
          p_access_token_enc: accessTokenEnc,
          p_access_expires_at: expiresAt,
          p_status: 'ok',
        }),
      );
    },
    async markReconnectNeeded() {
      check(
        'svc_mark_reconnect_needed',
        await admin.rpc('svc_mark_reconnect_needed', { p_user_id: userId }),
      );
    },
  });
}

const channels: ChannelDeps = {
  accessToken,
  newId: () => crypto.randomUUID(),
  newSecret: () => randomToken(32),
  hash: sha256Hex,
  async context(calendarId) {
    const data = check(
      'svc_watch_context',
      await admin.rpc('svc_watch_context', { p_calendar_id: calendarId }),
    );
    return (data as unknown as Awaited<ReturnType<ChannelDeps['context']>>) ?? null;
  },
  async channel(id) {
    const data = check('svc_channel_get', await admin.rpc('svc_channel_get', { p_id: id }));
    return (data as unknown as Awaited<ReturnType<ChannelDeps['channel']>>) ?? null;
  },
  async save(c) {
    check(
      'svc_channel_save',
      await admin.rpc('svc_channel_save', {
        p_id: c.id,
        p_calendar_id: c.calendar_id,
        p_user_id: c.user_id,
        p_resource_id: c.resource_id,
        p_token_hash: c.token_hash,
        p_expires_at: c.expires_at,
      }),
    );
  },
  async stopped(id) {
    check('svc_channel_stopped', await admin.rpc('svc_channel_stopped', { p_id: id }));
  },
  async pushUnsupported(calendarId, reason) {
    console.log(`watch refused for a calendar: ${reason}`);
    check(
      'svc_mark_push_unsupported',
      await admin.rpc('svc_mark_push_unsupported', { p_calendar_id: calendarId, p_reason: reason }),
    );
  },
};

const writes: WriteDeps = {
  accessToken,
  async context(itemId) {
    const data = check(
      'svc_write_context',
      await admin.rpc('svc_write_context', { p_item_id: itemId }),
    );
    return (data as unknown as WriteContext) ?? null;
  },
  async done(itemId, etag, rawTitle) {
    check(
      'svc_write_done',
      await admin.rpc('svc_write_done', { p_item_id: itemId, p_etag: etag, p_raw_title: rawTitle }),
    );
  },
};

const handler = createWorker(
  {
    secret: requireEnv('WORKER_SECRET'),
    async read(queue, vt, qty) {
      const data = check(
        'svc_queue_read',
        await admin.rpc('svc_queue_read', { p_queue: queue, p_vt: vt, p_qty: qty }),
      );
      return (data ?? []) as unknown as QueueMessage[];
    },
    async remove(queue, msgId) {
      check(
        'svc_queue_delete',
        await admin.rpc('svc_queue_delete', { p_queue: queue, p_msg_id: msgId }),
      );
    },
    async dead(queue, msg, error) {
      check(
        'svc_queue_dead',
        await admin.rpc('svc_queue_dead', {
          p_queue: queue,
          p_msg_id: msg.msg_id,
          p_message: msg.message as Json,
          p_error: error,
        }),
      );
    },
    handlers: {
      sync_jobs: (m, deadline) => {
        if (typeof m.source_id !== 'string') throw new BadMessage('no source_id');
        return syncSource(m.source_id, { store, accessToken, deadline });
      },
      google_writes: (m) => {
        if (m.kind === 'checkmark' && typeof m.item_id === 'string') {
          return runCheckmark(m as unknown as CheckmarkJob, writes);
        }
        throw new BadMessage(`unknown write ${String(m.kind)}`);
      },
      jobs: (m) => {
        if (m.kind === 'watch') return runWatch(m as unknown as WatchJob, channels);
        if (m.kind === 'stop_channel') return runStop(m as unknown as StopJob, channels);
        throw new BadMessage(`unknown kind ${String(m.kind)}`);
      },
    },
  },
  (p) => (typeof EdgeRuntime !== 'undefined' ? EdgeRuntime.waitUntil(p) : void p),
);

Deno.serve(handler);
