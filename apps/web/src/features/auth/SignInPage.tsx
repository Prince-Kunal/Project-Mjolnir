import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Button, Notice } from '../../components/ui.tsx';
import { signInWithGoogle, useAuth } from '../../lib/auth.ts';
import { isSupabaseConfigured } from '../../lib/supabase.ts';

export function SignInPage() {
  const session = useAuth((s) => s.session);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function signIn() {
    setBusy(true);
    setError(null);
    const { error } = await signInWithGoogle();
    if (error) {
      setError('Google sign-in could not start. Try again.');
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-full items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <img src="/icon.svg" alt="" className="mx-auto size-16" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Mjolnir</h1>
        <p className="mt-2 text-sm text-muted">Plan in Google Calendar. Score the day here.</p>
        <div className="mt-8 flex flex-col gap-3">
          {!isSupabaseConfigured && (
            <Notice tone="error">
              Supabase is not configured. Copy apps/web/.env.example to .env.local.
            </Notice>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          <Button
            onClick={signIn}
            disabled={busy || !isSupabaseConfigured}
            className="w-full py-2.5"
          >
            {busy ? 'Opening Google…' : 'Sign in with Google'}
          </Button>
        </div>
      </div>
    </main>
  );
}
