import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && publishableKey);

// The web app only ever holds the publishable key (section 13).
// Typed with generated DB types once Phase 1 adds the first migration.
export const supabase = isSupabaseConfigured ? createClient(url!, publishableKey!) : null;
