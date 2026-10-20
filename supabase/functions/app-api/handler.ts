// app-api: every user-facing route that touches Google (plan 9.3). One function, one warm isolate.
import { pkceChallenge, randomToken } from '../_shared/crypto.ts';
import { buildConsentUrl, type GoogleOAuthConfig } from '../_shared/google.ts';
import { corsHeaders, json } from '../_shared/http.ts';

export interface AppUser {
  id: string;
  email: string | null;
}

export interface AppApiDeps {
  appUrl: string;
  cfg: GoogleOAuthConfig;
  /** Resolves the Supabase user from the request's bearer token, or null. */
  authenticate(req: Request): Promise<AppUser | null>;
  saveOAuthState(userId: string, nonce: string, codeVerifier: string): Promise<void>;
}

type Route = (req: Request, user: AppUser, deps: AppApiDeps) => Promise<Response>;

const routes: Record<string, Route> = {
  'POST /google/connect': connectGoogle,
};

/** Path after the function name: `/functions/v1/app-api/google/connect` -> `/google/connect`. */
function routePath(url: URL): string {
  const i = url.pathname.indexOf('/app-api');
  const rest = i === -1 ? url.pathname : url.pathname.slice(i + '/app-api'.length);
  return rest.replace(/\/+$/, '') || '/';
}

export function createAppApi(deps: AppApiDeps) {
  const cors = corsHeaders(deps.appUrl);
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const route = routes[`${req.method} ${routePath(new URL(req.url))}`];
    if (!route) return json({ error: 'not_found' }, 404, cors);

    const user = await deps.authenticate(req);
    if (!user) return json({ error: 'unauthorized' }, 401, cors);

    try {
      const res = await route(req, user, deps);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (err) {
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
