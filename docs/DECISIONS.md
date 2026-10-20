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

## Phase 2

- Sync rules stay in TypeScript: the worker plans each page of events with `packages/domain` and pure `_shared/sync/plan.ts`, then `svc_apply_sync_ops` applies the page in one transaction. SQL only stores results.
- Each planned op carries the item's status and `finalized` as read; if the item changed meanwhile (a tick), the op is skipped and the page re-runs, so a tick is never overwritten.
- `items.google_seen_at` records the last run that saw an event. At the end of a full sync, active items in the window that the run did not see are deleted by D1 and D2, so a 410 resync catches events deleted while the token was lost.
- `items.is_all_day` records all-day items, which start at the logical day's boundary and have no planned minutes.
- `items.calendar_id` and `task_list_id` are `on delete set null`, so history survives a removed calendar; the Phase 1 account-switch note is resolved this way.
- The logical day is computed with `Intl` instead of `date-fns-tz`, so `packages/domain` has no dependencies and runs unchanged in Deno.
- Tags must begin a word: `#` cannot follow a letter, digit or `_ # @ & / -`, and cannot run into `@`, so `a#b@x.com` and `#b@x` are not tags.
- `worker` checks an `x-worker-secret` header (Vault `worker_secret`, function secret `WORKER_SECRET`) instead of the service key, because the new `sb_secret_` keys are not JWTs; JWT verification is off for it.
- The worker answers 202 at once and drains in `EdgeRuntime.waitUntil`, since pg_net times out after 5 seconds.
- `sync_state` keeps one request per calendar (`queued`, `pending_kind`), and the run in progress (`run_kind`, `page_token`, window), so a run that runs out of time continues with the same window. A request left waiting 10 minutes is sent again.
- Failed syncs retry with 30 s doubling to 8 minutes; after 5 attempts the job goes to `private.dead_jobs` and the 10-minute poll picks the calendar up again later.
- Working-location events are not tasks and are treated as deleted.
- The local dispatcher reaches functions at `http://kong:8000`; `seed.sql` stores that URL and a local-only worker secret in Vault.
- M2 and M3 are judged at the event's Google `updated` time (capped at now), not the sync time, so a polled sync gives the same answer as a webhook would.
