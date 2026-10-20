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

## Phase 3

- Score maths has one shared case table, `packages/domain/src/scoring.cases.json`; `pnpm gen:shared-tests` writes the pgTAP version and CI fails if it is stale.
- Habit items are created only for the logical today (when `day_view` opens it), never back-filled for past days. Editing a habit updates today's open item; pausing or removing it deletes today's pending one.
- Manual tasks parse `#tags` from their title in the app (`parseTitle`) and store them as hashtag links, like calendar titles.
- Ticks recompute the day's score in the browser with `scoreDay` for the optimistic update; the server's `day_view` stays the source of truth on refetch.
- Realtime refetches the cached days on any change to the user's items (debounced 150 ms) instead of patching rows, because a sync can change many rows at once and the score must follow.
- `request_sync()` runs when the app returns to the foreground, at most once a minute per device.
- New RPCs beyond section 9.2: `delete_manual_task` (calendar deletes stay in `app-api`, Phase 6) and `update_item_local` also moves manual tasks between days and the backlog.
- Swipe gestures and the "✓ " write-back queue on tick come with Phases 4 (reschedule) and 6 (writes to Google).
- Playwright end-to-end tests (`pnpm e2e`) run locally against the stack with throwaway password users. They join CI in Phase 5, when the pipeline gets a full Supabase stack.

## Phase 4

- Day close and the streak walk run as SQL (`private.close_day`, `private.recompute_streak`) from a 5-minute cron job, not through the `jobs` queue and `worker` of section 10: they never touch Google, so this wakes no Edge Function, keeps each close in one transaction, and lets `mark_late_done` re-walk the streak immediately. Like scoring, the walk also lives in `packages/domain/src/streaks.ts`; both are checked against `streaks.cases.json`. The `jobs` queue arrives with the first job that needs Google or Web Push.
- Tracking starts on the logical day the owner finished onboarding (`private.tracking_start`); earlier days are never closed, so they cannot break a streak. The close job looks back at most 30 days.
- A habit missed at day close can also be marked done late (it is the same "forgot to tick"); habits still never enter the inbox.
- Rescheduling a missed calendar item creates the new item first, with a Google event id chosen by us (32 hex characters, valid base32hex), then inserts the event. The sync recognises the event the moment it appears. If Google refuses, the new item is deleted and the original returns to the inbox; a queued retry with a "sync issue" badge comes with the `google_writes` queue in Phase 6.
- The new event goes to the original calendar when it is synced and writable, else the primary calendar.
- Free-slot suggestions are computed in the browser from `busy_blocks()` (the user's synced timed items, 0-point ones included) with `freeSlots` in the domain, instead of an `app-api` route: Google's free/busy API needs a scope we do not request, and the data is already local. Suggestions sit between 07:00 and midnight on the half hour, at most 5, within 14 days, and never overlap each other.
- "Reschedule all to tomorrow, same times" keeps each block's local time on the logical day after today (wall-clock, so 18:00 stays 18:00 across DST).
- Private extended properties: `pt_tags` and `pt_deadlines` keep whole values under Google's 1024-character limit (checked 2026-10-20).
- The week table counts the week rate and "days counted" over closed days only; today shows a live score marked as not yet judged.
