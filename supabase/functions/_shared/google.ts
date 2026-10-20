// Google OAuth and Calendar API over plain fetch (plan section 6: no SDK).
// Never log tokens, event titles or notes (section 13).
import { base64UrlToBytes } from './crypto.ts';

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

export const SCOPE_EVENTS = 'https://www.googleapis.com/auth/calendar.events';
export const SCOPE_CALENDAR_LIST = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly';

/** Minimum set for Events mode, checked against Google's method references (DECISIONS.md). */
export const CONNECT_SCOPES = ['openid', 'email', SCOPE_EVENTS, SCOPE_CALENDAR_LIST];
export const REQUIRED_SCOPES = [SCOPE_EVENTS, SCOPE_CALENDAR_LIST];

export type FetchFn = typeof fetch;

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;
  token_type: string;
}

// A type alias, not an interface, so it is assignable to the generated Json type.
export type CalendarListEntry = {
  google_calendar_id: string;
  summary: string;
  color: string | null;
  is_primary: boolean;
  access_role: string;
};

export class GoogleError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`Google request failed: ${status} ${code}`);
  }
}

export function buildConsentUrl(
  cfg: GoogleOAuthConfig,
  opts: { state: string; codeChallenge: string; loginHint?: string },
): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: CONNECT_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: 'S256',
  });
  if (opts.loginHint) params.set('login_hint', opts.loginHint);
  return `${GOOGLE_AUTH_URL}?${params}`;
}

async function tokenRequest(body: URLSearchParams, fetchFn: FetchFn): Promise<TokenResponse> {
  const res = await fetchFn(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleError(res.status, String(json.error ?? 'token_error'));
  return json as TokenResponse;
}

export function exchangeCode(
  cfg: GoogleOAuthConfig,
  code: string,
  codeVerifier: string,
  fetchFn: FetchFn = fetch,
): Promise<TokenResponse> {
  return tokenRequest(
    new URLSearchParams({
      code,
      code_verifier: codeVerifier,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: 'authorization_code',
    }),
    fetchFn,
  );
}

export function refreshAccessToken(
  cfg: GoogleOAuthConfig,
  refreshToken: string,
  fetchFn: FetchFn = fetch,
): Promise<TokenResponse> {
  return tokenRequest(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: 'refresh_token',
    }),
    fetchFn,
  );
}

/**
 * Reads `sub` and `email` from the ID token. The token came straight from Google's token
 * endpoint over TLS, so OpenID Connect allows skipping signature checks here.
 */
export function readIdToken(idToken: string): { sub: string; email: string | null } {
  const payload = idToken.split('.')[1];
  if (!payload) throw new Error('malformed id_token');
  const claims = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload)));
  if (typeof claims.sub !== 'string') throw new Error('id_token has no sub');
  return { sub: claims.sub, email: typeof claims.email === 'string' ? claims.email : null };
}

export function missingScopes(granted: string): string[] {
  const have = new Set(granted.split(' '));
  return REQUIRED_SCOPES.filter((s) => !have.has(s));
}

export async function listCalendars(
  accessToken: string,
  fetchFn: FetchFn = fetch,
): Promise<CalendarListEntry[]> {
  const out: CalendarListEntry[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      maxResults: '250',
      fields: 'nextPageToken,items(id,summary,summaryOverride,backgroundColor,primary,accessRole)',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetchFn(`${CALENDAR_API}/users/me/calendarList?${params}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new GoogleError(res.status, String(json.error?.status ?? 'calendar_list'));
    for (const c of json.items ?? []) {
      out.push({
        google_calendar_id: c.id,
        summary: c.summaryOverride ?? c.summary ?? c.id,
        color: c.backgroundColor ?? null,
        is_primary: c.primary === true,
        access_role: c.accessRole,
      });
    }
    pageToken = json.nextPageToken;
  } while (pageToken);
  return out;
}

export interface StoredAccount {
  refresh_token_enc: string | null;
  access_token_enc: string | null;
  access_expires_at: string | null;
  status: string;
}

export interface AccessTokenDeps {
  cfg: GoogleOAuthConfig;
  getAccount(): Promise<StoredAccount | null>;
  saveAccessToken(accessTokenEnc: string, expiresAt: string): Promise<void>;
  markReconnectNeeded(): Promise<void>;
  encrypt(plain: string): Promise<string>;
  decrypt(sealed: string): Promise<string>;
  now?: () => Date;
  fetchFn?: FetchFn;
}

export class ReconnectNeededError extends Error {
  constructor() {
    super('Google connection needs to be renewed');
  }
}

/** Refresh margin, so a token never expires mid-request. */
const EXPIRY_SKEW_MS = 60_000;

/**
 * A valid access token for the account, refreshed when expired (plan 8.1).
 * On `invalid_grant` the account is marked `reconnect_needed` and sync pauses.
 */
export async function accessTokenFor(deps: AccessTokenDeps): Promise<string> {
  const now = deps.now?.() ?? new Date();
  const account = await deps.getAccount();
  if (!account || account.status !== 'ok' || !account.refresh_token_enc) {
    throw new ReconnectNeededError();
  }
  if (
    account.access_token_enc &&
    account.access_expires_at &&
    new Date(account.access_expires_at).getTime() - EXPIRY_SKEW_MS > now.getTime()
  ) {
    return await deps.decrypt(account.access_token_enc);
  }
  try {
    const refreshToken = await deps.decrypt(account.refresh_token_enc);
    const tokens = await refreshAccessToken(deps.cfg, refreshToken, deps.fetchFn);
    const expiresAt = new Date(now.getTime() + tokens.expires_in * 1000).toISOString();
    await deps.saveAccessToken(await deps.encrypt(tokens.access_token), expiresAt);
    return tokens.access_token;
  } catch (err) {
    if (err instanceof GoogleError && err.code === 'invalid_grant') {
      await deps.markReconnectNeeded();
      throw new ReconnectNeededError();
    }
    throw err;
  }
}

// Writes (plan 8.7) -------------------------------------------------------------------------------

export interface NewEvent {
  /** Client-chosen id (base32hex), so the sync recognises the event at once. */
  id: string;
  summary: string;
  start: string;
  end: string;
  timeZone: string;
  /** Google colour id, or null for the calendar default. */
  colorId: string | null;
  privateProperties: Record<string, string>;
}

/** Google cuts private property values at 1024 characters; keep whole tags under it. */
const MAX_PROPERTY_VALUE = 1024;

export function appProperties(
  itemId: string,
  tags: string[],
  deadlines: string[] = [],
): Record<string, string> {
  const join = (values: string[]) => {
    let out = '';
    for (const v of values) {
      const next = out ? `${out},${v}` : v;
      if (next.length > MAX_PROPERTY_VALUE) break;
      out = next;
    }
    return out;
  };
  return { pt_app: '1', pt_item: itemId, pt_tags: join(tags), pt_deadlines: join(deadlines) };
}

export async function insertEvent(
  accessToken: string,
  calendarId: string,
  e: NewEvent,
  fetchFn: FetchFn = fetch,
): Promise<{ id: string; etag: string }> {
  const res = await fetchFn(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      id: e.id,
      summary: e.summary,
      start: { dateTime: e.start, timeZone: e.timeZone },
      end: { dateTime: e.end, timeZone: e.timeZone },
      ...(e.colorId ? { colorId: e.colorId } : {}),
      extendedProperties: { private: e.privateProperties },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleError(res.status, String(json.error?.status ?? 'insert_failed'));
  return { id: json.id, etag: json.etag };
}
