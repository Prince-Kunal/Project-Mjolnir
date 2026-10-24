import { createClient } from '@supabase/supabase-js';
import type { Database, Json } from '@mjolnir/db-types';
import { decryptToken, encryptToken, importTokenKey } from '../_shared/crypto.ts';
import { adminClient, appUrl, googleConfig, requireEnv } from '../_shared/env.ts';
import { accessTokenFor } from '../_shared/google.ts';
import {
  type AppContext,
  createAppApi,
  type EditContext,
  type PreparedReschedule,
  type PreparedSchedule,
  RpcError,
} from './handler.ts';

const admin = adminClient();
const key = await importTokenKey(requireEnv('TOKEN_ENCRYPTION_KEY'));
const cfg = googleConfig();
const supabaseUrl = requireEnv('SUPABASE_URL');
const anonKey = requireEnv('SUPABASE_ANON_KEY');

function check<T>(
  name: string,
  res: { data: T; error: { code?: string; message: string } | null },
): T {
  if (res.error) throw new RpcError(res.error.code ?? 'XX000', res.error.message || name);
  return res.data;
}

Deno.serve(
  createAppApi({
    appUrl: appUrl(),
    cfg,
    async authenticate(req) {
      const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      if (!token) return null;
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) return null;
      return { id: data.user.id, email: data.user.email ?? null };
    },
    async saveOAuthState(userId, nonce, codeVerifier) {
      check(
        'svc_create_oauth_state',
        await admin.rpc('svc_create_oauth_state', {
          p_user_id: userId,
          p_nonce: nonce,
          p_code_verifier: codeVerifier,
        }),
      );
    },
    async userRpc<T>(req: Request, name: string, args: Record<string, unknown> = {}) {
      // A client that carries the caller's JWT, so row-level security and auth.uid() apply.
      const asUser = createClient<Database>(supabaseUrl, anonKey, {
        global: { headers: { authorization: req.headers.get('authorization') ?? '' } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      return check(name, await asUser.rpc(name as never, args as never)) as T;
    },
    async profile(userId) {
      const data = check(
        'profiles',
        await admin
          .from('profiles')
          .select('timezone, day_boundary_hour')
          .eq('id', userId)
          .single(),
      );
      return data!;
    },
    accessToken: (userId) =>
      accessTokenFor({
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
      }),
    items: {
      async appContext(userId) {
        const data = check(
          'svc_app_context',
          await admin.rpc('svc_app_context', { p_user_id: userId }),
        );
        return data as unknown as AppContext;
      },
      async editContext(userId, itemId) {
        const data = check(
          'svc_edit_context',
          await admin.rpc('svc_edit_context', { p_user_id: userId, p_item_id: itemId }),
        );
        return (data as unknown as EditContext) ?? null;
      },
      async applyOps(calendarId, ops) {
        const data = check(
          'svc_apply_app_ops',
          await admin.rpc('svc_apply_app_ops', {
            p_calendar_id: calendarId,
            p_ops: ops as unknown as Json,
          }),
        );
        return data as unknown as { applied: number; skipped: number };
      },
      async schedulePrepare(userId, itemId, start, end) {
        const data = check(
          'svc_schedule_prepare',
          await admin.rpc('svc_schedule_prepare', {
            p_user_id: userId,
            p_item_id: itemId,
            p_start: start,
            p_end: end,
          }),
        );
        return data as unknown as PreparedSchedule;
      },
      async scheduleAbort(itemId, date, minutes) {
        check(
          'svc_schedule_abort',
          await admin.rpc('svc_schedule_abort', {
            p_item_id: itemId,
            p_date: date as string,
            p_minutes: minutes as number,
          }),
        );
      },
      newItemId: () => crypto.randomUUID(),
    },
    reschedule: {
      async prepare(userId, itemId, start, end) {
        const data = check(
          'svc_reschedule_prepare',
          await admin.rpc('svc_reschedule_prepare', {
            p_user_id: userId,
            p_id: itemId,
            p_start: start,
            p_end: end,
          }),
        );
        return data as unknown as PreparedReschedule;
      },
      async commit(itemId, etag) {
        check(
          'svc_reschedule_commit',
          await admin.rpc('svc_reschedule_commit', { p_item_id: itemId, p_etag: etag }),
        );
      },
      async abort(itemId) {
        check(
          'svc_reschedule_abort',
          await admin.rpc('svc_reschedule_abort', { p_item_id: itemId }),
        );
      },
    },
  }),
);
