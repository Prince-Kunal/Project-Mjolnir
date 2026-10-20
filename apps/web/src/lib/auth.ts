import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { queryClient } from './queryClient.ts';
import { isSupabaseConfigured, supabase } from './supabase.ts';

interface AuthState {
  session: Session | null;
  ready: boolean;
}

export const useAuth = create<AuthState>(() => ({ session: null, ready: false }));

let started = false;

/** Subscribes the store to Supabase Auth once, at app start. */
export function startAuth() {
  if (started) return;
  started = true;
  if (!isSupabaseConfigured) {
    useAuth.setState({ ready: true });
    return;
  }
  supabase.auth.getSession().then(async ({ data }) => {
    const session = data.session ? await validSession(data.session) : null;
    useAuth.setState({ session, ready: true });
  });
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') queryClient.clear();
    useAuth.setState({ session, ready: true });
  });
}

/**
 * A stored session can outlive its account (deleted, or a rebuilt local database) while its JWT
 * still verifies. Ask the auth server once at start; if it rejects the user, sign out locally.
 * Network errors keep the session, so the app still opens offline.
 */
async function validSession(session: Session): Promise<Session | null> {
  const { error } = await supabase.auth.getUser();
  if (error && (error.status === 401 || error.status === 403 || error.status === 404)) {
    await supabase.auth.signOut({ scope: 'local' });
    return null;
  }
  return session;
}

/** Sign-in asks Google for basic profile scopes only; Calendar is a separate step (plan 8.1). */
export function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/` },
  });
}

export function signOut() {
  return supabase.auth.signOut();
}
