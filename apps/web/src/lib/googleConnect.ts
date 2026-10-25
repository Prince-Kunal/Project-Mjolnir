import { supabase } from './supabase.ts';

const RETURN_KEY = 'mjolnir.googleConnectReturn';

export interface ConnectReturn {
  /** Where to land after Google connects. */
  ok: string;
  /** Where to land, with the reason, if it fails. */
  error: string;
}

export type ConnectResult = { status: 'ok' } | { status: 'error'; reason: string };

/** Asks app-api for Google's consent URL and leaves the app for it (plan 8.1). */
export async function startGoogleConnect(returnTo: ConnectReturn, opts: { tasks?: boolean } = {}) {
  const { data, error } = await supabase.functions.invoke<{ url: string }>(
    'app-api/google/connect',
    { method: 'POST', body: { tasks: opts.tasks === true } },
  );
  if (error || !data?.url) throw new Error('Could not start the Google connection');
  try {
    sessionStorage.setItem(RETURN_KEY, JSON.stringify(returnTo));
  } catch {
    // Storage blocked: the callback page falls back to settings.
  }
  window.location.assign(data.url);
}

export function takeConnectReturn(): ConnectReturn {
  try {
    const raw = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    if (raw) return JSON.parse(raw) as ConnectReturn;
  } catch {
    // Fall through to the default.
  }
  return { ok: '/more', error: '/more' };
}

const MESSAGES: Record<string, string> = {
  denied: 'You cancelled on Google’s consent screen.',
  invalid_state: 'That connection link expired. Try again.',
  missing_scopes:
    'Mjolnir needs both calendar permissions. Tick both boxes on Google’s consent screen.',
  account_in_use: 'That Google account is already connected to another Mjolnir user.',
  task_lists: 'Connected, but your Google task lists could not be read. Try Refresh lists.',
};

export function connectErrorMessage(reason: string): string {
  return MESSAGES[reason] ?? 'Google didn’t finish connecting. Try again.';
}
