// google-callback: Google redirects here after consent (plan 8.1 steps 2 and 3).
// No Supabase JWT arrives; the single-use, expiring state nonce identifies the user.
import {
  type CalendarListEntry,
  exchangeCode,
  type FetchFn,
  type GoogleOAuthConfig,
  listCalendars,
  missingScopes,
  readIdToken,
  SCOPE_TASKS,
} from '../_shared/google.ts';
import { listTaskLists } from '../_shared/tasks.ts';
import { redirect } from '../_shared/http.ts';

export class AccountInUseError extends Error {}

export interface SaveAccountArgs {
  userId: string;
  googleSub: string;
  email: string | null;
  scopes: string[];
  refreshTokenEnc: string | null;
  accessTokenEnc: string;
  accessExpiresAt: string;
}

export interface CallbackDeps {
  appUrl: string;
  cfg: GoogleOAuthConfig;
  consumeState(nonce: string): Promise<{ user_id: string; code_verifier: string } | null>;
  /** Throws AccountInUseError when the Google account is linked to another app user. */
  saveAccount(args: SaveAccountArgs): Promise<void>;
  upsertCalendars(userId: string, calendars: CalendarListEntry[]): Promise<void>;
  upsertTaskLists(userId: string, lists: { id: string; title: string }[]): Promise<void>;
  encrypt(plain: string): Promise<string>;
  now?: () => Date;
  fetchFn?: FetchFn;
}

export type CallbackOutcome =
  | 'ok'
  | 'denied'
  | 'invalid_state'
  | 'missing_scopes'
  | 'account_in_use'
  | 'token_exchange'
  | 'calendar_list'
  | 'task_lists';

/** Sends the browser back to the app only, never to a URL taken from the request. */
function backToApp(appUrl: string, outcome: CallbackOutcome): Response {
  const params = new URLSearchParams(
    outcome === 'ok' ? { status: 'ok' } : { status: 'error', reason: outcome },
  );
  return redirect(`${appUrl}/google/connected?${params}`);
}

export async function handleCallback(url: URL, deps: CallbackDeps): Promise<Response> {
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');

  // Consume the state even when the user declined, so it cannot be replayed.
  const pending = state ? await deps.consumeState(state) : null;
  if (url.searchParams.get('error')) return backToApp(deps.appUrl, 'denied');
  if (!pending || !code) return backToApp(deps.appUrl, 'invalid_state');

  let tokens;
  try {
    tokens = await exchangeCode(deps.cfg, code, pending.code_verifier, deps.fetchFn);
  } catch {
    return backToApp(deps.appUrl, 'token_exchange');
  }
  if (missingScopes(tokens.scope).length > 0 || !tokens.id_token) {
    return backToApp(deps.appUrl, 'missing_scopes');
  }

  const { sub, email } = readIdToken(tokens.id_token);
  const now = deps.now?.() ?? new Date();
  try {
    await deps.saveAccount({
      userId: pending.user_id,
      googleSub: sub,
      email,
      scopes: tokens.scope.split(' '),
      refreshTokenEnc: tokens.refresh_token ? await deps.encrypt(tokens.refresh_token) : null,
      accessTokenEnc: await deps.encrypt(tokens.access_token),
      accessExpiresAt: new Date(now.getTime() + tokens.expires_in * 1000).toISOString(),
    });
  } catch (err) {
    if (err instanceof AccountInUseError) return backToApp(deps.appUrl, 'account_in_use');
    throw err;
  }

  try {
    await deps.upsertCalendars(
      pending.user_id,
      await listCalendars(tokens.access_token, deps.fetchFn),
    );
  } catch {
    return backToApp(deps.appUrl, 'calendar_list');
  }
  // Tasks mode (3.13): with the Tasks scope granted, store the task lists too.
  if (tokens.scope.split(' ').includes(SCOPE_TASKS)) {
    try {
      await deps.upsertTaskLists(
        pending.user_id,
        await listTaskLists(tokens.access_token, deps.fetchFn),
      );
    } catch {
      return backToApp(deps.appUrl, 'task_lists');
    }
  }
  return backToApp(deps.appUrl, 'ok');
}
