import { createClient } from "@supabase/supabase-js";
import type { Database } from "@mjolnir/db-types";
import type { GoogleOAuthConfig } from "./google.ts";

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

/** Service-role client. Lives only in Edge Functions, never in the browser (section 13). */
export function adminClient() {
  return createClient<Database>(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export type AdminClient = ReturnType<typeof adminClient>;

export function googleConfig(): GoogleOAuthConfig {
  return {
    clientId: requireEnv("GOOGLE_CLIENT_ID"),
    clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
    redirectUri: requireEnv("GOOGLE_REDIRECT_URI"),
  };
}

/** The web app's origin: the only place OAuth redirects and CORS allow (section 13). */
export function appUrl(): string {
  return requireEnv("APP_URL").replace(/\/+$/, "");
}
