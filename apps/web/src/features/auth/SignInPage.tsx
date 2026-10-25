import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { HammerMark } from '../../components/Mark.tsx';
import { Notice } from '../../components/ui.tsx';
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
    <main className="grid min-h-svh gap-3 bg-bg p-3 lg:grid-cols-2">
      <figure className="relative hidden overflow-hidden rounded-[20px] bg-bone lg:block">
        <img
          src="/landing/thor-s-hammer-erikstorp-east-gotland.jpg"
          width={1357}
          height={1400}
          alt="Engraving of a Viking-age silver hammer amulet on its chain"
          className="on-bone size-full object-contain p-[10%] mix-blend-multiply"
        />
        <figcaption className="absolute bottom-6 left-7 text-[14px] text-[#4a4640]">
          Thor’s hammer amulet, silver, Erikstorp. Engraving, 1878.
        </figcaption>
      </figure>
      <section className="flex flex-col rounded-[20px] bg-surface px-6 py-6 md:px-12">
        <Link
          to="/welcome"
          className="flex items-center gap-2.5 self-start font-display text-[24px]"
        >
          <HammerMark className="size-[0.95em] text-bone" />
          Mjölnir
        </Link>
        <div className="my-auto w-full max-w-[400px] py-16">
          <h1 className="text-[clamp(36px,3.4vw,52px)] leading-[1.02] tracking-[-0.02em]">
            Sign in to start the day
          </h1>
          <p className="mt-5 text-[18px] leading-relaxed text-muted">
            Plan in Google Calendar, score the day here. Your Google tokens stay on the server.
          </p>
          <div className="mt-9 flex flex-col gap-3">
            {!isSupabaseConfigured && (
              <Notice tone="error">
                Supabase is not configured. Copy apps/web/.env.example to .env.local.
              </Notice>
            )}
            {error && <Notice tone="error">{error}</Notice>}
            <button
              onClick={signIn}
              disabled={busy || !isSupabaseConfigured}
              className="flex h-[52px] w-full items-center justify-center gap-3 rounded-full bg-primary text-[17px] font-semibold text-on-primary transition hover:bg-bone active:scale-[0.98] disabled:opacity-45"
            >
              <svg viewBox="0 0 18 18" className="size-[18px]" aria-hidden>
                <path
                  fill="#4285F4"
                  d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62Z"
                />
                <path
                  fill="#34A853"
                  d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
                />
                <path
                  fill="#FBBC05"
                  d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33Z"
                />
                <path
                  fill="#EA4335"
                  d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
                />
              </svg>
              {busy ? 'Opening Google…' : 'Sign in with Google'}
            </button>
          </div>
        </div>
        <Link to="/welcome" className="self-start text-[15px] text-muted hover:text-text">
          What is Mjölnir?
        </Link>
      </section>
    </main>
  );
}
