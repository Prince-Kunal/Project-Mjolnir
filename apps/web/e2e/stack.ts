import { execSync } from 'node:child_process';
import type { BrowserContext } from '@playwright/test';

interface Stack {
  api: string;
  publishableKey: string;
  secretKey: string;
}

let stack: Stack | undefined;

/** Reads URLs and keys of the running local stack from `supabase status`. */
export function localStack(): Stack {
  if (!stack) {
    const out = execSync('supabase status -o json', {
      cwd: '../..',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const s = JSON.parse(out.toString());
    stack = { api: s.API_URL, publishableKey: s.PUBLISHABLE_KEY, secretKey: s.SECRET_KEY };
  }
  return stack;
}

export interface TestUser {
  id: string;
  session: Record<string, unknown> & { access_token: string };
  /** Calls a Postgres function as this user. */
  rpc<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T>;
  /** Writes rows as the service role (for rows only Edge Functions may write, like items). */
  insertAsService(table: string, rows: Record<string, unknown>[]): Promise<void>;
  remove(): Promise<void>;
}

async function call(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${url}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

/** A throwaway, onboarded user with a password session (Google is not involved). */
export async function createUser(timezone = 'Asia/Kolkata'): Promise<TestUser> {
  const { api, publishableKey, secretKey } = localStack();
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = 'e2e-password-123';
  const admin = {
    apikey: secretKey,
    authorization: `Bearer ${secretKey}`,
    'content-type': 'application/json',
  };

  const user = await call(`${api}/auth/v1/admin/users`, {
    method: 'POST',
    headers: admin,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const session = await call(`${api}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const asUser = {
    apikey: publishableKey,
    authorization: `Bearer ${session.access_token}`,
    'content-type': 'application/json',
  };
  await call(`${api}/rest/v1/profiles?id=eq.${user.id}`, {
    method: 'PATCH',
    headers: asUser,
    body: JSON.stringify({ timezone, onboarded_at: new Date().toISOString() }),
  });

  return {
    id: user.id,
    session,
    rpc: (name, args = {}) =>
      call(`${api}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: asUser,
        body: JSON.stringify(args),
      }),
    insertAsService: async (table, rows) => {
      const body = rows.map((r) => ({ user_id: user.id, ...r }));
      // Rows may set different columns; the rest take their defaults.
      const columns = [...new Set(body.flatMap(Object.keys))].join(',');
      await call(`${api}/rest/v1/${table}?columns=${columns}`, {
        method: 'POST',
        headers: { ...admin, prefer: 'return=minimal, missing=default' },
        body: JSON.stringify(body),
      });
    },
    remove: async () => {
      await call(`${api}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: admin });
    },
  };
}

/** Signs a browser context in by storing the session where supabase-js looks for it. */
export async function signIn(context: BrowserContext, user: TestUser) {
  const ref = new URL(localStack().api).hostname.split('.')[0];
  await context.addInitScript(
    ([key, session]) => {
      if (!localStorage.getItem(key as string))
        localStorage.setItem(key as string, JSON.stringify(session));
    },
    [`sb-${ref}-auth-token`, user.session] as const,
  );
}
