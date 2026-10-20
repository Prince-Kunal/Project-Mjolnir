import type { ColorRule } from '@mjolnir/domain';
import { decryptToken, encryptToken, importTokenKey } from '../_shared/crypto.ts';
import { adminClient, googleConfig, requireEnv } from '../_shared/env.ts';
import { accessTokenFor } from '../_shared/google.ts';
import { type Lease, type SyncStore, syncSource } from '../_shared/sync/run.ts';
import type { ItemSnapshot } from '../_shared/sync/types.ts';
import { createWorker, type QueueMessage } from './handler.ts';

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
          p_message: msg.message,
          p_error: error,
        }),
      );
    },
    syncSource: (sourceId, deadline) => syncSource(sourceId, { store, accessToken, deadline }),
  },
  (p) => (typeof EdgeRuntime !== 'undefined' ? EdgeRuntime.waitUntil(p) : void p),
);

Deno.serve(handler);
