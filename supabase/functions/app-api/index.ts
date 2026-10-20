import { adminClient, appUrl, googleConfig } from '../_shared/env.ts';
import { createAppApi } from './handler.ts';

const admin = adminClient();

Deno.serve(
  createAppApi({
    appUrl: appUrl(),
    cfg: googleConfig(),
    async authenticate(req) {
      const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      if (!token) return null;
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) return null;
      return { id: data.user.id, email: data.user.email ?? null };
    },
    async saveOAuthState(userId, nonce, codeVerifier) {
      const { error } = await admin.rpc('svc_create_oauth_state', {
        p_user_id: userId,
        p_nonce: nonce,
        p_code_verifier: codeVerifier,
      });
      if (error) throw new Error(`svc_create_oauth_state: ${error.code}`);
    },
  }),
);
