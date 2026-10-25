import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { startAuth } from './lib/auth.ts';
import { queryClient } from './lib/queryClient.ts';
import { supabase } from './lib/supabase.ts';
import { router } from './routes/router.tsx';
import './index.css';

/**
 * Design reviews only: a build made with VITE_INSPECT_SESSION=1 (never production) signs in from
 * `#inspect-session=<base64url {access_token, refresh_token}>`, so a fresh headless browser can
 * photograph signed-in screens. See scripts/demo-user.mjs.
 */
async function inspectSession() {
  if (import.meta.env.VITE_INSPECT_SESSION !== '1') return;
  const m = location.hash.match(/inspect-session=([\w-]+)/);
  if (!m) return;
  const json = atob(m[1]!.replace(/-/g, '+').replace(/_/g, '/'));
  await supabase.auth.setSession(JSON.parse(json));
  history.replaceState(null, '', location.pathname + location.search);
}

void inspectSession().finally(() => {
  startAuth();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
});
