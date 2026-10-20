import { render, screen } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { useAuth } from '../../lib/auth.ts';
import { RequireAuth } from './guards.tsx';

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/sign-in', element: <p>sign-in page</p> },
      { element: <RequireAuth />, children: [{ path: '/', element: <p>private page</p> }] },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
}

afterEach(() => useAuth.setState({ session: null, ready: false }));

describe('RequireAuth', () => {
  it('waits for the session before deciding', () => {
    renderAt('/');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('sends signed-out users to sign-in', () => {
    useAuth.setState({ session: null, ready: true });
    renderAt('/');
    expect(screen.getByText('sign-in page')).toBeInTheDocument();
  });

  it('lets signed-in users through', () => {
    useAuth.setState({ session: { user: { id: 'u1' } } as Session, ready: true });
    renderAt('/');
    expect(screen.getByText('private page')).toBeInTheDocument();
  });
});
