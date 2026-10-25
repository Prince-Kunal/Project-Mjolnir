import { useState } from 'react';
import { Link } from 'react-router-dom';
import { HammerMark } from '../components/Mark.tsx';

/** The hammer flew off. Click it and it comes back, as it always does. */
export function NotFound() {
  const [gone, setGone] = useState(true);
  return (
    <section className="flex min-h-[60svh] flex-col items-start justify-center gap-6">
      <button
        type="button"
        onClick={() => setGone(false)}
        aria-label="Call the hammer back"
        className="text-bone"
      >
        <HammerMark
          className={`size-16 transition duration-700 ease-[var(--ease-out-quint)] ${gone ? 'translate-x-[40vw] -rotate-[540deg] opacity-0' : ''}`}
        />
      </button>
      <h1 className="text-[32px] leading-tight">This page flew off</h1>
      <p className="max-w-[46ch] text-[17px] text-muted">
        {gone
          ? 'Like the hammer, it may come back if you call it. Click where it was.'
          : 'The hammer came back. The page did not.'}
      </p>
      <Link
        to="/"
        className="flex h-10 items-center rounded-full bg-primary px-5 text-[15px] font-medium text-on-primary transition hover:bg-bone"
      >
        Back to today
      </Link>
    </section>
  );
}
