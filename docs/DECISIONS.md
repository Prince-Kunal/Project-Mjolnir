# Decisions

Choices the plan does not cover, one line each, with the reason. Newest at the bottom.

## Phase 0

- TypeScript is pinned to 6.0, not 7: typescript-eslint supports `<6.1` only.
- Tailwind CSS 4 with CSS-first `@theme` tokens instead of a `tailwind.config` file: it is the current major and keeps theme tokens in one CSS file.
- Vite 8 with React 18.3: React 18 is fixed by the plan; Vite 8 is current and supported by `vite-plugin-pwa` 2.
- React Router 7 (`react-router-dom`, data router) for routing: the plan names no router.
- Generated DB types live in `packages/db-types`, so the web app and Edge Functions share one copy.
- Domain files import each other with explicit `.ts` extensions, so Deno loads the same source the web app bundles.
- Edge Functions reach `packages/domain` through the `@mjolnir/domain` entry in `supabase/functions/deno.json`; whether `supabase functions deploy` bundles it is checked in Phase 5 (plan section 6, **verify**).
- Local Supabase ports moved from 543xx to 554xx: the defaults clash with other local Supabase projects on the same machine.
- The Phase 0 migration enables `citext`, `pg_cron`, `pg_net` and `pgmq` and creates the locked-down `private` schema, so later phases only add tables.
- `verify_jwt = false` for `google-callback` and `google-webhook` is added in `config.toml` when those functions are created (Phases 1 and 5).
- The PWA icon is a placeholder hammer mark until the owner supplies a design.

## Phase 1

- Google scopes for Connect are `calendar.events` and `calendar.calendarlist.readonly`, plus `openid email`: Google's method references (checked 2026-10-20) show these cover events list/insert/watch and the calendar list, so the broader `calendar.readonly` is not needed.
- Sign-in uses Supabase Auth's PKCE flow, so the session never travels in a URL fragment.
- `profiles.onboarded_at` records when onboarding finished: the app needs it to decide whether to show onboarding.
- New profiles start on `UTC` because Google sign-up cannot carry the browser's timezone; onboarding suggests the browser's zone and saves it.
- `calendars.access_role` stores Google's access role, so read-only calendars can be labelled now and skipped for writes in Phase 6.
- Edge Functions reach the `private` schema through `svc_*` security-definer functions that only `service_role` may execute: the API cannot see `private`, and this keeps it unexposed.
- The OAuth `state` is a random single-use nonce stored server-side with a 10-minute expiry, standing in for the plan's "signed state".
- `google-callback` sends the browser to `/google/connected` with only a status and reason; where to land next is kept in `sessionStorage`, so no schema change is needed.
- One Google account links to one app user (`google_sub` is unique); a second user gets an "already connected" message.
- Connecting a different Google account replaces the old account's calendars. Revisit in Phase 2, once items reference calendars.
- The single primary colour per points value is enforced by `normalizePrimaries` in `packages/domain`, not by a unique index, so swapping the primary in one upsert cannot fail mid-statement.
- Onboarding splits "connect" and "pick calendars" into two screens; the areas and habits step joins in Phase 3.
- Local Edge Functions read every secret from the gitignored `supabase/.env` via `pnpm functions:serve`; the same file feeds the Google sign-in provider in `config.toml`.
- Per-user rate limits (section 13) start in Phase 2 with the first routes that sync or write; the connect route only stores a short-lived nonce.
