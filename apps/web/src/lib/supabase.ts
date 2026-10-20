import { createClient } from '@supabase/supabase-js';
import type { Database } from '@mjolnir/db-types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && publishableKey);

// The web app only ever holds the publishable key (section 13).
export const supabase = createClient<Database>(
  url ?? 'http://supabase.invalid',
  publishableKey ?? 'missing',
  { auth: { flowType: 'pkce' } },
);

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
