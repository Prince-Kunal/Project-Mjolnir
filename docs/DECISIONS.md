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

## Phase 5

- Hosted project `vkgzaxsxobzrummlrmrb` in ap-south-1 (Mumbai), in the owner's personal organisation. Web app on classic Cloudflare Pages as `project-mjolnir` (https://project-mjolnir.pages.dev); wrangler 4 now routes new Pages projects to Workers by default, so the project was created with `--force` once.
- Deploys run from the laptop (`pnpm deploy:db`, `pnpm deploy:functions`, `pnpm deploy:web`); CI deploys can come later with a Cloudflare API token.
- Production web settings live in the committed `apps/web/.env.production`: the publishable key is meant for browsers.
- Hosted auth settings (site URL, redirect list, Google provider) were set with the Management API, not `supabase config push`, which would also have pushed local development defaults (email confirmations and MFA off).
- Production secrets stay out of git: `supabase/.env.production` (database password and URL) and `supabase/.env.functions.production` (function secrets), with a token encryption key and worker secret separate from local ones.
- Checked on deploy: `supabase functions deploy` bundles `packages/domain` and `packages/db-types` through the import map (plan section 6, **verify**).
- Checked: `app-api` keeps `verify_jwt = true`; the gateway accepts the hosted project's ES256 user tokens.
- Checked 2026-10-21: Google push needs only HTTPS with a valid certificate (no domain verification), channels have no auto-renewal, and the first `sync` message can be ignored. Channels ask for 7 days; the hourly job renews them 24 hours before expiry by creating the new channel first, then stopping the old one.
- Channel work goes through a `jobs` queue drained by `worker`, and is queued only when Vault holds `google_webhook_url`, so local development keeps polling and never calls `events.watch`.
- A reconcile keeps the incremental sync token, so changes outside its window still reach the next incremental sync.
- Checked: refresh tokens issued while the OAuth app is in Testing expire after 7 days. The app is published to Production unverified, which shows Google's "unverified app" screen and caps it at 100 new users.
- Backups are encrypted with `age` to a key whose private half lives only at `~/.config/mjolnir/backup-age-key.txt` on the owner's laptop; artifacts are kept 90 days. Restore: `age -d -i <key> mjolnir-<date>.tar.gz.age | tar xz`, then `psql` the three files in order roles, schema, data.

## Phase 6

- Edits made in the app (create, rename, recolour, move, delete, schedule a task) go to Google first in `app-api`; Google's answer then runs through the sync planner, so app edits follow section 3.4 (M1 to M4, D1, D2) exactly as edits made in Google, and the stored etag makes the later sync skip the echo.
- When Google refuses such a write the user sees the error and nothing changes locally; only the "✓ " write-back is queued for retries (`google_writes`). A queued retry with a "sync issue" badge for user writes can come with the offline queue in Phase 8.
- Only user actions write to Google; a sync never does. This is what rules out sync loops.
- The "✓ " write uses If-Match with the stored etag: if the event changed in Google meanwhile, Google answers 412 and the job retries after the sync has caught up, instead of overwriting the newer title.
- Events created in the app use their item id (hex) as the Google event id and as `pt_item`, so the item exists before the sync sees the event.
- Quick add is parsed in the browser with `chrono-node` against the user's profile timezone, independent of the device's.
- Calendar tab (owner request, not in section 11): Day, Week and Month views in Google Calendar's style, with 0-point blocks shown (unlike Today's checklist), drag to create, drag to move (mouse; touch taps), and the item sheet on click. Items now store their Google colour (`color_key`); items synced earlier get it on the next full sync.
- The calendar lays blocks out by local calendar date (Google's view), while Today and the tables stay on logical dates.

## Phase 7

- Deadline stats and warnings are computed in SQL (`deadline_stats`), not in `packages/domain`, because Phase 8's deadline push warnings need them in the database. They are tested in pgTAP.
- Counting (3.9): deleted and 0-point items never count. A direct link counts whatever the item's date; a tag counts only inside the window. An item with several of a deadline's tags counts once. Sessions are "upcoming" when pending and not yet started (a task with no time counts while its day has not passed); backlog tasks are planned but not upcoming. Hours done use actual minutes, falling back to planned.
- "No sessions scheduled" shows from the due day back to `deadline_warning_days` before it; once overdue, only "Overdue" shows. Done and Dropped deadlines have no warnings.
- The start date defaults to the creation day, or the due date if that is earlier. Marking Done stamps `completed_at` (the window then ends on that day); reopening clears it.
- The item dropdown writes through a new RPC, `set_item_links(item, tags, deadlines)`, which replaces the item's whole set of explicit links. This replaces the plan's tag and deadline keys on `update_item_local`. Hashtag links stay, since only the title can remove them; unknown tags are created.
- Link changes queue a `links` job on `google_writes`, which rewrites `pt_tags` (every linked tag) and `pt_deadlines` with If-Match, like the ✓ write. The sync reads these properties only when it creates a new item for an event (an event moved between synced calendars), and then only for the user's existing tags and deadlines. After that, the database owns links.
- Rescheduled copies keep their deadline links, as they keep their tags (a trigger on `rescheduled_from_id`).
- Suggestions: a "whole word" is a run of letters, digits, `_` and `-`, so "lfx-2" and "lfx_notes" do not name `lfx`. The rule lives in `suggestions.ts` and `private.title_has_tag`, sharing one case table. Suggestions are only for untagged calendar events and manual tasks that are still tasks. They are rechecked whenever a title is set, and a new tag is suggested for untagged items from the last 30 days. Link adds the tag (source `suggestion`) and leaves the item's other suggestions open; Dismiss is remembered.
- The Unassigned tray is reached from the Deadlines page, with a count badge, rather than adding a tab.
- Tags can be given an area or deleted under More. They cannot be renamed, since a title that still says the old name would bring it back.

## Phase 8

- **Analytics** are SQL functions run at request time (`analytics_trend`, `analytics_areas`, `analytics_misses`, `analytics_heatmap`).
  - Trend rows start at onboarding, so a new account shows no empty history.
  - The 7-day average is points-weighted over the 7 days ending each day (decision 11).
  - The miss grid uses closed calendar blocks by local start hour.
  - A reschedule chain starts at a missed task with no predecessor, inside the range.
  - Estimate accuracy is actual ÷ planned minutes over done items where actual minutes were entered.
- Charts use Recharts, loaded only with the Analytics page. Area colours are a fixed categorical order validated on the app's dark surface (#141821); a colour follows an area's place in the user's list, so filtering never repaints an area. Rates use the band colours. The miss grid uses one hue whose strength is the miss share. Chart animation is off.
- The year heatmap sits under Week → Months, one column per week, Monday first, coloured by band.
- **Plan tomorrow** shows tomorrow's blocks, tasks and habits; open deadlines with no upcoming session; and the backlog with a "Tomorrow" button. Today links to it after 18:00.
- **Sunday review** opens on the week ending today, otherwise the last full week. It is built from closed days and saves one reflection per week in a new `weekly_notes` table. Today links to it on the week's last day.
- **Web Push** uses `@negrel/webpush` 0.5.0 (JSR), which runs on WebCrypto alone; a test checks that it encrypts (aes128gcm) and signs (VAPID) on the Deno runtime.
  - The VAPID subject is the app's URL, not an email address.
  - Notifications expire after 6 hours rather than arriving stale.
  - A device that sends the same endpoint again takes it over, so a shared browser follows whoever turned notifications on last.
- **When notifications go out:** `queue_push_prompts` (run every 5 minutes) sends each prompt at most once per local day, within 3 hours after its time, and only when it has something to say:
  - Morning: open missed tasks.
  - Deadlines: overdue, or no sessions scheduled, sent at the morning time.
  - Evening: points still open today.

  Each kind can be turned off. A job that reached no device is retried; one that reached some is not, so no device gets a duplicate. Gone devices (404, 410) are deleted.

- **Offline ticks** queue in IndexedDB (`idb-keyval`), one entry per item, tagged with the user, and are replayed when the browser comes back online and on app start. A tick that reaches the server removes any queued one for that item. Ticks the server refuses (for example, the day closed meanwhile) are dropped with a message. While offline, a banner shows how many ticks are waiting.
- **Export** is a read-only database function (`export_data`) that runs as the user under row-level security, instead of `GET /export` on app-api, since it involves no Google calls. The page builds the JSON file and two CSVs (items, days) from it.
- **Account deletion** is `DELETE /me` on app-api, with `{ "confirm": "delete" }`. It stops watch channels, revokes the Google refresh token, then deletes the auth user, which cascades to every row. Google failures never block the deletion.
- **Tasks mode** (3.13, 8.9):
  - The `tasks` scope is requested only when a user connects Google Tasks from Settings in Tasks mode.
  - Task lists are stored on connect, and from Settings → Refresh lists.
  - Switching modes records `google_item_type_since`. The old source stops syncing (leases refuse it, polls skip it), and the new one creates items only from that logical date on. This covers switching back to events too.
  - Tasks are polled every 10 minutes and on foreground, using `updatedMin` set a minute before the last run began. Echoes are skipped by etag.
  - A due date is a date: its time and the user's timezone never shift the day.
  - A task's start time for move rules is its logical day's start, so moving a task after its day began records a miss and creates a new item (M3).
  - A task's points come from its list when it is created. After that the app owns them, and an estimate set in the app is kept, including on M3 copies.
  - Completion is two-way until day close. Changes the sync applies are marked in the transaction (`mjolnir.from_google`), so they are not written back to Google.
  - Ticking in the app queues a `task_status` write without If-Match; the write is idempotent because it reads the item's current state.
  - In Tasks mode, quick add creates Google tasks: a time is ignored, with a note in the preview.
  - Nothing stays to backfill: tasks due before the switch, completed tasks with no date, and hidden ones are not imported.

## After Phase 8

- **Noon freeze** (decision 16): `private.freeze_at(user, date)` is 12:00 local on the day after, or the day's end if the boundary is later. `schedule_due_jobs(p_now)` closes a day only once it passes that time, so ticks, edits and sync on yesterday keep working through the morning. The morning prompt leads with yesterday's unticked points while it is open, Today shows a "Yesterday is open until 12:00" note, and an open past day reads "Open until 12:00 today". "Mark done (forgot to tick)" still covers the 48 hours after the freeze.
