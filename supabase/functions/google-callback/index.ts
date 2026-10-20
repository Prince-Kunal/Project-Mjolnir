import { importTokenKey, encryptToken } from '../_shared/crypto.ts';
import { adminClient, appUrl, googleConfig, requireEnv } from '../_shared/env.ts';
import { redirect } from '../_shared/http.ts';
import { AccountInUseError, handleCallback } from './handler.ts';

const admin = adminClient();
const key = await importTokenKey(requireEnv('TOKEN_ENCRYPTION_KEY'));
const app = appUrl();

Deno.serve(async (req) => {
  try {
    return await handleCallback(new URL(req.url), {
      appUrl: app,
      cfg: googleConfig(),
      encrypt: (plain) => encryptToken(key, plain),
      async consumeState(nonce) {
        const { data, error } = await admin.rpc('svc_consume_oauth_state', { p_nonce: nonce });
        if (error) throw new Error(`svc_consume_oauth_state: ${error.code}`);
        return data?.[0] ?? null;
      },
      async saveAccount(a) {
        const { error } = await admin.rpc('svc_save_google_account', {
          p_user_id: a.userId,
          p_google_sub: a.googleSub,
          p_email: a.email ?? undefined,
          p_scopes: a.scopes,
          p_refresh_token_enc: a.refreshTokenEnc ?? undefined,
          p_access_token_enc: a.accessTokenEnc,
          p_access_expires_at: a.accessExpiresAt,
        });
        if (error?.code === '23505') throw new AccountInUseError();
        if (error) throw new Error(`svc_save_google_account: ${error.code}`);
      },
      async upsertCalendars(userId, calendars) {
        const { error } = await admin.rpc('svc_upsert_calendars', {
          p_user_id: userId,
          p_calendars: calendars,
        });
        if (error) throw new Error(`svc_upsert_calendars: ${error.code}`);
      },
    });
  } catch (err) {
    console.error('google-callback failed', err instanceof Error ? err.message : 'unknown');
    return redirect(`${app}/google/connected?status=error&reason=internal`);
  }
});
