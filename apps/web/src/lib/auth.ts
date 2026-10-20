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
  supabase.auth.getSession().then(({ data }) => {
    useAuth.setState({ session: data.session, ready: true });
  });
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') queryClient.clear();
    useAuth.setState({ session, ready: true });
  });
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
