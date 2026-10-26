# Project Mjolnir — Implementation Plan

Oct 20, 2026 · @Kunal

## 1. How to use this plan

Build the app in the nine phases of section 15, stopping after each one for the owner to review.

Instructions for Claude Code:

1. Read the whole plan before writing code. Section 3 (behaviour spec) is the source of truth; if code and spec disagree, the spec wins.
2. Work one phase at a time. At the end of a phase, run the tests, show the acceptance criteria working, and stop for review.
3. Write unit tests for the rules in section 3 before implementing them: day boundary, move and delete rules, scoring, streaks, tag parsing.
4. Keep rule logic as pure functions with no I/O (`packages/domain/`), so it is easy to test and shared by the web app and the Edge Functions. Make every schema change as a Supabase migration file, never in the dashboard.
5. Do not change a decision listed in section 4 without asking the owner.
6. Where this plan says **verify**, check Google's current documentation before coding. Google API limits and scopes change.
7. Record any choice this plan does not cover in `docs/DECISIONS.md`, one line each, with the reason.
8. Commit small, with conventional commit messages, and keep `README.md` setup steps current.

## 2. Product summary

Project Mjolnir is one app that replaces the Notion task list and the manual weekly table. Google Calendar holds the schedule; the app holds everything else: completion, points, tags, deadlines, habits, notes, scores and streaks.

The owner plans the day by putting blocks on Google Calendar, from the app or from Google directly. Each block becomes a task for that day, worth 1 to 3 points by its colour. Ticking tasks fills a live success rate. Days, weeks, months and deadline progress are computed, never typed in. The day is planned as Google Calendar events, not Google Tasks; a setting lets other users switch (3.13).

Principles:

- **Enter once.** Events made in the app are written to Google Calendar. Events made in Google Calendar appear in the app.
- **Google owns time, the app owns state.** Link app records to Google by event ID, never by title.
- **Honest history.** A task not done in its planned slot is recorded as missed, even if it is rescheduled.
- **No manual logging.** Scores, the weekly table, the monthly review and deadline stats are computed.
- **Manual only where software can't know.** Deadline progress and status are set by hand.
- **Built for one owner, ready for many.** Multi-user accounts from day one.
- **Phone and laptop.** An installable web app with real-time sync. Google Calendar widgets and Apple Calendar keep working because the data lives in Google.

### Glossary

| Term | Meaning |
| --- | --- |
| Item | Anything that can be ticked on a day. Sources: a calendar event occurrence, a manual task, or a habit check. |
| Points | 1, 2 or 3. An item with 0 points is not a task (sleep, dinner, buffer) and is hidden and unscored. |
| Logical day | The day an item belongs to, after applying the day boundary (default 04:00). |
| Day close | The moment a logical day is finalized: pending items become missed and the score is frozen. |
| Success rate | Points done divided by points planned for a day, as a percentage. |
| Area | A top-level category, such as Rich, Muscular, Intelligent. |
| Tag | A short label such as `lfx`, used to link items to deadlines. |
| Deadline | A goal with a due date, tags, manual progress and a manual status. |
| Rest pass | One day per week that can fall below 50% without breaking the streak. |

## 3. Behaviour spec

These rules decide what counts, when, and for how many points. Every rule here needs a unit test.

### 3.1 Items

- **Calendar items**: one item per event occurrence on a synced calendar. Each instance of a recurring event is its own item and its own session.
- **Manual tasks**: created in the app without a time. Points 1 to 3, a logical date (default today), or no date (backlog, not scored).
- **Habit items**: one item per active habit per scheduled day, generated automatically (3.10).
- Statuses: `pending`, `done`, `missed`, `deleted`, `ignored` (0 points). There is no "skipped" status. Any non-completion is a miss; the weekly rest pass covers planned rest.
- Planned minutes = event duration (calendar) or an optional estimate (manual). When ticking, the owner may edit actual minutes; the default is the planned value.

### 3.2 Points

- Calendar items get points from the event colour. The owner maps each of Google's 11 event colours, plus "calendar default" (no `colorId`), to 0, 1, 2 or 3.
- 0 points = not a task. The item is stored with status `ignored`, hidden from the checklist and excluded from scores.
- Until the owner maps colours in onboarding: calendar default = 1 point, every other colour = 0.
- Changing an event's colour changes its points, until the item is finalized. Remapping a colour in settings re-scores all non-finalized items.
- Manual tasks and habits: points chosen in the app.
- When the app writes an event (new event, scheduling a manual task, reschedule), it sets the colour mapped to the chosen points. If several colours map to one value, the colour marked primary for that value is used.
- All-day events are ignored by default (setting to include them). Events the owner declined are treated as deleted.

### 3.3 Logical day and day close

- Each user has a timezone and a day boundary hour (default 04:00).
- An item's logical date = the local date of its start time minus the boundary. An event at 01:30 belongs to the previous day.
- Day close happens at the boundary the next morning. All `pending` items of that day become `missed` (reason `day_close`), and the day is finalized.
- Until day close, any item of that day can be ticked, including ones whose time has passed.
- Finalized items never change status because of a later calendar edit. The only change allowed after close is "mark done (forgot to tick)" (3.5).

### 3.4 Moves, deletes and edits

The same rules apply whether the change comes from Google Calendar or from the app.

| Rule | Change | Result |
| --- | --- | --- |
| M1 | Moved, same logical day | Times updated. Nothing else changes. |
| M2 | Moved to another day, before the original start time | Plain move. The item now belongs to the new day only. |
| M3 | Moved to another day after the original start time, not done | Original item becomes `missed` (reason `moved_after_start`) and is frozen. A new `pending` item is created for the new slot, with `rescheduled_from_id` pointing to the original. The Google event now maps to the new item. |
| M4 | Done item moved | Not finalized: it moves and stays done. Finalized: history stays; the new slot becomes a new pending item. |
| D1 | Event deleted before day close | Item set to `deleted` and dropped from scores, whatever its status. |
| D2 | Event deleted after day close | Item keeps its final status, so a miss stays a miss. |
| E1 | Title edited | Tags re-parsed. Links set from the dropdown are kept. |
| E2 | Colour or duration edited | Points and planned minutes updated, if not finalized. |
| R1 | Recurring series edited | Each future instance updates through normal sync. Finalized instances are untouched. |

Implement the move decision as one pure function, `classifyMove(item, newStart, now, tz, boundary)`, returning `same_day`, `plain_move` or `miss_and_recreate`.

### 3.5 Missed tasks and rescheduling

- At day close, missed calendar and manual items enter the **Missed inbox**. Missed habits are counted but do not enter the inbox.
- On the next app open, and in a morning notification, the app shows: "You missed N tasks yesterday. Reschedule?"
- Actions per missed item:
  - **Reschedule**: pick a slot. The app suggests the next free slots that fit the duration. This creates a new Google event (same title, tags, colour, duration) and a new pending item linked by `rescheduled_from_id`. The original item stays missed, and its Google event stays in place as a record.
  - **Dismiss**: leaves the inbox; stays missed.
  - **Mark done (forgot to tick)**: allowed up to 48 hours after day close. Sets `done`, flags `marked_late`, re-scores the day and recomputes streaks from that day.
- Bulk actions: "Reschedule all to tomorrow, same times" and "Dismiss all".
- A manual task can be rescheduled to a date without a time (no Google event).
- Analytics show reschedule chains: how often a task was pushed and whether it was finally done.

### 3.6 Daily score

- `planned_points` = sum of points of the day's items with status `pending`, `done` or `missed`.
- `done_points` = sum of points of items with status `done`.
- `success_rate` = done\_points / planned\_points × 100, to one decimal. If planned\_points is 0, the rate is 0.
- Today's rate is live. It is frozen at day close.

| Band | Success rate |
| --- | --- |
| Excellent | 85% and above |
| Good | 75% to under 85% |
| Fair | 50% to under 75% |
| Not good | under 50% |

### 3.7 Streak

- A finalized day **counts** when its success rate is 50% or more. A counting day adds 1 to the streak.
- Weeks run Monday to Sunday in the user's timezone (setting).
- Each week has one **rest pass**. The first day in a week under 50% uses it automatically. That day neither breaks nor grows the streak.
- A second day under 50% in the same week resets the streak to 0.
- A day with nothing planned counts as under 50%.
- Today is not judged until day close. The app shows "streak at risk" when today is under 50% and this week's pass is used.
- Store current and best streak. When a past day's score changes, recompute from that day forward.

```ts
function walk(days: FinalizedDay[]) {   // finalized days, in date order
  let streak = 0;
  const passUsed = new Set<string>();
  for (const d of days) {
    const week = weekKey(d.date);
    if (d.successRate >= 50) streak += 1;
    else if (!passUsed.has(week)) passUsed.add(week);   // rest pass: no change
    else streak = 0;
    d.streakAfter = streak;
  }
}
```

### 3.8 Tags and linking to deadlines

- Tag syntax in event titles: `#` followed by 1 to 32 of `a-z 0-9 _ -`, case-insensitive, anywhere in the title. An unknown tag is created automatically.
- The app shows titles without the tags and without a leading "✓ "; tags appear as chips.
- In the app, a dropdown on any event or task picks tags and deadlines. These links are stored in the database and in the Google event's private extended properties, so they survive title edits.
- An item counts toward a deadline when it is linked to that deadline directly, or has one of the deadline's tags and its logical date falls inside the deadline's window (3.9).
- One tag can feed several deadlines, and a deadline can have several tags.
- **Suggestions**: an untagged event whose title contains an existing tag name as a whole word ("read lfx notes") goes to the Unassigned tray with Link and Dismiss. Linking adds the tag without editing the Google title. Dismissals are remembered.

### 3.9 Deadlines

- Fields: title, due date, start date (default: creation date), tags, area, optional target sessions, optional target hours, notes.
- **Manual**: progress from 0 to 100%, and status `On track`, `Needs attention`, `Urgent`, `Done` or `Dropped`.
- Window: from the start date to the completion date if `Done`, otherwise to the later of the due date and today. Overdue work still counts.
- Computed stats:
  - Sessions planned, done, missed and upcoming.
  - Hours planned and done (actual minutes where given).
  - Days left, last session and next session.
  - Progress against target sessions or hours, when set.
- Computed warnings:
  - "No sessions scheduled": due within 7 days (setting) and no upcoming sessions.
  - "Overdue": past due and not Done or Dropped.
  - "Needs more sessions": target sessions set, and done plus upcoming is below the target.

### 3.10 Habits

- Fields: title, points 1 to 3, area, weekdays (default every day), active.
- One item per active habit per scheduled day, generated at the start of the logical day, or when that day is first opened.
- Habits count toward the daily score. They are not written to Google Calendar.

### 3.11 Completion shown in Google Calendar

- When an item is ticked, the app prefixes the Google event title with "✓ " (setting, default on), and removes it on untick. This makes progress visible on phone widgets and in Apple Calendar.
- Colour is not used for this because colour means points.
- The app's database is the source of truth for completion. Editing the ✓ in Google Calendar does nothing; parsing always strips it.

### 3.12 Daily note

One free-text note per logical day, like the Notion Notes column. It appears in the weekly table.

### 3.13 Events or Google Tasks

Each user chooses where their day lives in Google: **Events** (default) or **Google Tasks**. Onboarding asks, and settings can change it later. Sections 3.1 to 3.11 describe Events mode.

In Tasks mode:

- Each Google task with a due date becomes an item for that logical date. Tasks with no due date go to the backlog.
- Points: tasks have no colour, so each task list carries a points value (default 1). An item's points can be changed in the app.
- No times: Google's Tasks API stores only the due date and cannot read or write a time ([Tasks API reference](https://android.googlesource.com/platform/external/python/google-api-python-client/+/b6971b040/docs/dyn/tasks_v1.tasks.html)). Free-slot suggestions and miss rate by hour are not available.
- Planned minutes come from an optional estimate set in the app.
- Completion is two-way. Ticking in the app marks the Google task completed. Completing it in Google before day close ticks the item. No ✓ prefix is used.
- Moves: a changed due date follows M1 to M4, with the start of the logical day as the start time. Moving a task after its day has begun records a miss and a new item.
- Deletes follow D1 and D2. Tags use the same `#tag` syntax in task titles.
- Deadline links are stored in the database by Google task id, since tasks have no extended properties.
- Sync is by polling, because the Tasks API has no push channels (**verify**).
- Switching modes keeps all history. The old source stops syncing, and the new one starts from the switch date.

## 4. Decisions to confirm

The owner's answers fixed most rules. The 15 below filled gaps; each is already written into section 3. Change any of them here before Phase 2 starts.

| # | Decision | Why |
| --- | --- | --- |
| 1 | Day boundary defaults to 04:00 | Sessions run past midnight; a 00:30 block should count for the day it was planned in. |
| 2 | Moving an unfinished task to another day after its start time records a miss plus a new task (M3). Moving it earlier is a plain move. | Matches "rescheduling still counts as not done" while keeping "dragged tasks move". |
| 3 | Deleting an event drops it only until day close (D1, D2) | Otherwise deleting yesterday's missed block would erase the failure. |
| 4 | The rest pass is automatic, keeps the streak and does not add to it | No extra tap needed, and a rest day is not an achievement. |
| 5 | A day with nothing planned counts as under 50% | Stops the streak being kept by not planning. |
| 6 | Weeks run Monday to Sunday | Matches the Notion weekly table. Setting. |
| 7 | "Mark done (forgot to tick)" allowed up to 48 hours after day close, flagged | Fixes honest mistakes without making history editable forever. |
| 8 | Completion shows in Google Calendar as a "✓ " title prefix | Colour already means points. |
| 9 | All-day events are ignored by default | They are usually birthdays and holidays. Setting. |
| 10 | Band edges are inclusive: exactly 85% is Excellent, 75% Good, 50% counts for the streak | Matches "50% counts as appeared". |
| 11 | Weekly and monthly rates are points-weighted (total done ÷ total planned), not an average of daily rates | A heavy day weighs more than a light one. |
| 12 | Stack: Supabase free plan (Postgres, Auth, Realtime, Edge Functions, Cron, Queues) and a React PWA (section 6) | No server to wake, so no cold-start waits, and one TypeScript codebase. Trade-off: no FastAPI or Redis on this project. |
| 13 | The day lives in Google Calendar as events by default; Google Tasks is a per-user setting (3.13) | The owner plans with events; other users may prefer tasks. |
| 14 | Google Calendar access is a separate Connect step after sign-in, run by Edge Functions | Google's refresh token never reaches the browser, and reconnecting is simple. |
| 15 | Free-plan safeguards: a keep-alive ping every 3 days and a weekly encrypted backup | Free projects pause after a quiet week and get no daily backups. |
| 16 | A finished day stays open for ticks until 12:00 local time the next day, then freezes (missed items, frozen score, streak) | A block done late at night can be ticked over breakfast, so ticking never pulls attention from the work itself. The 04:00 boundary still decides which day a block belongs to. |
| 17 | A calendar block or Google task with the same name as a habit schedules that habit: it takes the habit's points and stands in for the day's habit item, rather than adding a second task | Putting a habit on the calendar is giving it a time, not planning more work. |

## 5. Features

v1 has 27 features across phases 1 to 8. The ones marked *(added)* were not in the owner's brief and are proposed to make the product better.

| Feature | What it does | Phase |
| --- | --- | --- |
| Google sign-in, multi-user | Each user signs in with Google; their data is isolated by row-level security | 1 |
| Connect Google Calendar | Separate consent step; tokens stay on the server | 1 |
| Calendar picker | Choose which Google calendars to sync (for example, skip Birthdays and Holidays) | 1 |
| Colour to points map | Map each Google event colour to 0, 1, 2 or 3 points | 1 |
| Calendar sync | Events become items; moves, deletes and recurrences follow section 3 | 2 |
| Today view | Scheduled items, tasks and habits, with a live success ring and streak | 3 |
| Tick and untick | Optimistic, with optional actual minutes | 3 |
| Manual tasks and backlog | Unscheduled tasks worth 1 to 3 points, with or without a date | 3 |
| Habits | Daily yes/no checks with points, grouped by area | 3 |
| Real-time sync | A tick on the phone shows on the laptop within 2 seconds | 3 |
| Day close | Freezes the day, records misses and updates the streak | 4 |
| Missed inbox | Shows missed tasks and offers reschedule, dismiss or mark done | 4 |
| Free-slot suggestions *(added)* | When rescheduling, offers the next free slots that fit the task | 4 |
| Daily note | One reflection note per day | 4 |
| Weekly and monthly tables | Replace the Notion weekly table and the Performance review automatically | 4 |
| Keep-alive and backups *(added)* | A GitHub Action pings the project every 3 days and exports the database weekly | 5 |
| Create events in the app | New, edit, move and delete events; colour set from points | 6 |
| Quick add *(added)* | One line such as `PR review tomorrow 6pm 2h #lfx !2` creates an event or task | 6 |
| ✓ write-back | Ticked tasks show "✓ " in Google Calendar, widgets and Apple Calendar | 6 |
| Tags and deadlines | Tagged deadlines with computed stats and a manual progress bar and status | 7 |
| Unassigned tray | Suggests links for events that look related to a tag | 7 |
| Deadline warnings | "No sessions scheduled", "Overdue", "Needs more sessions" | 7 |
| Analytics | Trends, area breakdown, miss patterns, streak history, estimate accuracy | 8 |
| Plan tomorrow *(added)* | Evening view of tomorrow's blocks and deadlines with nothing scheduled | 8 |
| Sunday review *(added)* | Auto-generated week summary with a reflection prompt | 8 |
| Notifications, offline, export *(added)* | Morning missed prompt, evening reminder, deadline warnings; offline ticking; CSV/JSON export | 8 |
| Google Tasks mode (setting) | Plan the day in Google Tasks instead of events; dates only, no times (3.13) | 8 |

## 6. Tech stack and architecture

The React PWA reads data and ticks tasks straight through Supabase, so everyday use never waits on a server waking up. Edge Functions handle everything that touches Google. Postgres runs the schedules and queues. Everything fits the Supabase free plan.

&#91;embedded content: Supabase architecture · 5 parts\]

Reads and ticks go from the app to Postgres directly. Edge Functions run only when Google is involved: on a user action, a Google webhook, or a cron job in the database.

| Layer | Choice | Notes |
| --- | --- | --- |
| Frontend | React 18, TypeScript, Vite, `vite-plugin-pwa` | Static files on Cloudflare Pages or Vercel: nothing to wake up |
| UI | Tailwind CSS, Radix UI primitives, Recharts | Dark theme by default |
| Client data | `supabase-js` v2, TanStack Query, Zustand | Optimistic ticks |
| Dates | `date-fns`, `date-fns-tz`; `chrono-node` for quick add |  |
| Offline | IndexedDB queue (`idb-keyval`) | Replayed on reconnect |
| Database | Supabase Postgres; migrations with the Supabase CLI | Row-level security on every table |
| Auth | Supabase Auth, Google provider | Sign-in only; Calendar access is a separate Connect step |
| Data API | Supabase auto-generated API plus Postgres functions (RPC) | Reads and ticks never touch an Edge Function |
| Server code | Supabase Edge Functions (Deno, TypeScript) | Google OAuth, sync, webhooks, writes, push |
| Jobs | Supabase Cron (`pg_cron`), `pg_net`, Supabase Queues (`pgmq`) | Cron runs in UTC |
| Realtime | Supabase Realtime (Postgres Changes) | Filtered by user; RLS applies |
| Secrets | Edge Function secrets; Vault for values SQL needs | The service key never reaches the web app |
| Google | `fetch` against Calendar API v3 and Tasks API v1 | No SDK |
| Push | Web Push with VAPID | **Verify** the chosen library runs on Edge Functions |
| Shared rules | `packages/domain` (TypeScript) | Same code in the app and the functions |
| Local dev | Supabase CLI (`supabase start`, `supabase functions serve`), pnpm workspaces | Tunnel for Google webhooks, or rely on polling |
| Quality | TypeScript strict, ESLint, Prettier, Vitest, Deno test, pgTAP, Playwright, GitHub Actions |  |
| Types | `supabase gen types typescript` | No hand-written row types |

The design stays inside these free-plan limits:

| Limit | Free plan | How the design fits |
| --- | --- | --- |
| Function run time | 150 s wall clock, 2 s CPU per request | The worker stops taking jobs at 100 s; sync is mostly waiting on Google |
| Function invocations | 500,000 a month | The dispatcher is plain SQL and wakes a function only when there is work |
| Realtime connections | 200 concurrent | One per open device |
| Database size | 500 MB | Items are small rows; a handful of users stays far below this (estimate) |
| Pausing | After 7 days of low activity | Keep-alive ping every 3 days |
| Backups | None on the free plan | Weekly encrypted dump |

Sources: [Edge Function limits](https://supabase.com/docs/guides/functions/limits), [billing quotas](https://supabase.com/docs/guides/platform/billing-on-supabase.md), [project pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [backups on the free plan](https://www.nocode.mba/articles/supabase-pricing).

Repo layout:

```text
/
├── apps/web/                    React PWA (Vite)
│   └── src/ routes, components, features/{today,week,deadlines,analytics,settings}, lib/
├── packages/domain/             pure TypeScript rules, shared by web and functions
│   └── src/ dayBoundary.ts, moveRules.ts, scoring.ts, streaks.ts, tagParser.ts, suggestions.ts, freeSlots.ts
├── supabase/
│   ├── config.toml              verify_jwt = false for google-callback and google-webhook
│   ├── migrations/              tables, RLS, RPC functions, triggers, queues, cron jobs
│   ├── tests/                   pgTAP tests
│   ├── seed.sql
│   └── functions/
│       ├── _shared/             Google client, crypto, admin client, queue helpers
│       ├── app-api/             user-facing routes (9.3)
│       ├── google-callback/     finish Google OAuth
│       ├── google-webhook/      Calendar push notifications
│       └── worker/              drains all queues
├── .github/workflows/           ci.yml, keepalive.yml, backup.yml
└── docs/                        PLAN.md, DECISIONS.md
```

Functions import `packages/domain` through an import map in `supabase/functions/deno.json`. **Verify** the deploy bundler includes files outside `supabase/functions/`; if not, copy the package into `_shared/domain` in a pre-deploy script.

Score maths (sums and success rate) also exists in SQL, because every query needs it. One shared table of test cases runs against both the SQL and the TypeScript versions.

## 7. Data model

All items live in one `items` table whatever their source, so scoring is one query. Every public table carries `user_id` (referencing `auth.users`, cascade on delete) and has row-level security. Google tokens and sync bookkeeping live in a `private` schema that the API never exposes.

```sql
-- Settings: one row per auth user
profiles (id uuid pk references auth.users on delete cascade,
  name text, avatar_url text,
  timezone text not null,                  -- from the browser at sign-up
  day_boundary_hour smallint default 4,
  week_start smallint default 1,           -- 1 = Monday
  google_item_type text default 'events',  -- events | tasks (3.13)
  include_all_day bool default false,
  writeback_checkmark bool default true,
  deadline_warning_days smallint default 7,
  morning_prompt_time time default '08:00', evening_reminder_time time default '22:30',
  created_at timestamptz)

-- Private schema: not exposed through the API, used only by Edge Functions
private.google_accounts (user_id uuid pk references auth.users on delete cascade,
  google_sub text unique, email text, scopes text[],
  refresh_token_enc bytea, access_token_enc bytea, access_expires_at timestamptz,
  status text default 'ok')                -- ok | reconnect_needed
private.oauth_states (nonce text pk, user_id uuid, code_verifier text, expires_at timestamptz)
private.watch_channels (id uuid pk, calendar_id uuid, resource_id text, token_hash text,
  expires_at timestamptz, stopped_at timestamptz)
private.sync_state (source_id uuid pk,     -- calendar or task list
  sync_token text, page_token text, queued bool default false,
  lease_until timestamptz, attempts int default 0, last_error text)
private.dead_jobs (id bigserial pk, queue text, message jsonb, error text, at timestamptz)
private.rate_limits (user_id uuid, bucket text, window_start timestamptz, count int,
  primary key (user_id, bucket, window_start))

-- Google sources
calendars (id uuid pk, user_id uuid, google_calendar_id text, summary text, color text,
  is_primary bool, sync_enabled bool default false,
  last_full_sync_at timestamptz, last_sync_at timestamptz,
  unique (user_id, google_calendar_id))
task_lists (id uuid pk, user_id uuid, google_tasklist_id text, title text,   -- Tasks mode
  sync_enabled bool default false, points smallint default 1, last_sync_at timestamptz,
  unique (user_id, google_tasklist_id))
color_rules (user_id uuid, color_key text,   -- 'default' | '1'..'11'
  points smallint check (points between 0 and 3),
  primary_for_points bool default false, primary key (user_id, color_key))

-- Organisation
areas (id uuid pk, user_id uuid, name text, color text, sort_order int, archived_at timestamptz)
tags  (id uuid pk, user_id uuid, name citext, area_id uuid null, unique (user_id, name))
deadlines (id uuid pk, user_id uuid, title text, area_id uuid null,
  start_date date, due_date date,
  target_sessions int null, target_minutes int null,
  progress_pct smallint default 0 check (progress_pct between 0 and 100),
  status text default 'on_track',  -- on_track | needs_attention | urgent | done | dropped
  notes text, completed_at timestamptz, created_at timestamptz, updated_at timestamptz)
deadline_tags (deadline_id uuid, tag_id uuid, primary key (deadline_id, tag_id))
habits (id uuid pk, user_id uuid, title text, points smallint check (points between 1 and 3),
  area_id uuid null, weekdays smallint default 127,  -- bitmask, Monday = 1
  active bool default true, created_at timestamptz, archived_at timestamptz)

-- Items: calendar events, Google tasks, manual tasks, habit checks
items (id uuid pk, user_id uuid,
  source text,                   -- calendar | gtask | manual | habit
  title text,                    -- display title: tags and "✓ " stripped
  raw_title text,                -- Google title as stored
  points smallint check (points between 0 and 3),
  logical_date date null,        -- null = backlog
  start_at timestamptz null, end_at timestamptz null,
  planned_minutes int null, actual_minutes int null,
  status text,                   -- pending | done | missed | deleted | ignored
  miss_reason text null,         -- day_close | moved_after_start
  completed_at timestamptz, finalized bool default false, marked_late bool default false,
  inbox_state text default 'none',  -- none | open | dismissed | rescheduled
  rescheduled_from_id uuid null references items,
  area_id uuid null, habit_id uuid null,
  calendar_id uuid null, google_event_id text null, recurring_event_id text null,
  task_list_id uuid null, google_task_id text null,
  google_active bool default false,  -- true on the one item the Google object maps to now
  google_etag text, google_updated_at timestamptz,
  created_at timestamptz, updated_at timestamptz)
-- unique (calendar_id, google_event_id) where google_active
-- unique (task_list_id, google_task_id) where google_active
-- unique (habit_id, logical_date) where source = 'habit'
-- index (user_id, logical_date); index (user_id, inbox_state) where inbox_state = 'open'

item_tags (item_id uuid, tag_id uuid, source text,   -- hashtag | explicit | suggestion
  primary key (item_id, tag_id))
item_deadlines (item_id uuid, deadline_id uuid, primary key (item_id, deadline_id))
suggestions (id uuid pk, user_id uuid, item_id uuid, tag_id uuid,
  state text default 'open',      -- open | accepted | dismissed
  unique (item_id, tag_id))
item_events (id bigserial pk, user_id uuid, item_id uuid, kind text, payload jsonb, at timestamptz)
  -- audit log: created, moved, rescheduled, completed, uncompleted, missed, deleted, points_changed

-- Days and streaks
day_summaries (user_id uuid, logical_date date, planned_points int, done_points int, missed_points int,
  success_rate numeric(5,1), band text, counts bool, rest_pass_used bool, streak_after int,
  finalized_at timestamptz, primary key (user_id, logical_date))
daily_notes (user_id uuid, logical_date date, body text, updated_at timestamptz,
  primary key (user_id, logical_date))
streak_state (user_id uuid pk, current int, best int, computed_through date)
push_subscriptions (id uuid pk, user_id uuid, endpoint text unique, p256dh text, auth text,
  user_agent text, created_at timestamptz)

-- Queues (Supabase Queues / pgmq)
select pgmq.create('sync_jobs');      -- {source_id, kind: incremental | full | reconcile}
select pgmq.create('google_writes');  -- {item_id, op: create | patch | delete | checkmark | task_status}
select pgmq.create('jobs');           -- {kind: close_day | streak | push | renew_channel, ...}

-- Row-level security on every public table, for example:
alter table items enable row level security;
create policy items_select on items for select to authenticated
  using (user_id = (select auth.uid()));
-- Direct client writes only on: profiles (settings columns), color_rules, areas, tags, habits,
-- deadlines, deadline_tags, daily_notes, push_subscriptions, calendars.sync_enabled,
-- task_lists.sync_enabled and points. Items change only through RPC functions or Edge Functions.

-- Realtime: add items, day_summaries, streak_state, deadlines and suggestions
-- to the supabase_realtime publication.
```

Private extended properties written on every event the app creates or links (verify current size limits):

| Key | Value |
| --- | --- |
| `pt_app` | `1` |
| `pt_item` | item id |
| `pt_tags` | comma-separated tag names |
| `pt_deadlines` | comma-separated deadline ids |

## 8. Google sync engine

Edge Functions do all Google traffic. Postgres decides when work is due, queues it, and wakes a function only when there is something to do.

### 8.1 Connecting Google

- **Sign-in** uses Supabase Auth with the Google provider and basic scopes only (`openid`, `email`, `profile`).
- **Calendar access** is a separate Connect step, run by Edge Functions:
  1. The app calls `app-api` `POST /google/connect`. It stores a nonce and PKCE verifier in `private.oauth_states` and returns Google's consent URL with offline access and `prompt=consent`.
  2. Google redirects to `google-callback`. It checks the state, exchanges the code, encrypts the refresh token (AES-GCM, key in function secrets) and stores it in `private.google_accounts`.
  3. It then lists the user's calendars into `calendars` and redirects back to the app.
- Why separate: Supabase Auth hands over Google's refresh token only at sign-in, and only if offline access is requested; storing and refreshing it is left to the app ([Supabase docs](https://supabase.com/docs/guides/auth/auth-google)). This way the token never reaches the browser.
- Scopes: start with `calendar.events` and `calendar.readonly`. Ask for `tasks` only when a user turns on Tasks mode. **Verify** the minimum set.
- **Verify**: refresh tokens issued while the Google OAuth app is in Testing mode expire after about 7 days. Publish the app to production before daily use, and check the current unverified-app limits.
- `_shared/google.ts` refreshes access tokens when they expire. On `invalid_grant` it sets `status = 'reconnect_needed'`, pauses sync, and the app shows a reconnect banner.

### 8.2 Queues and the worker

- Three queues (section 7). Producers are triggers, RPC functions, the webhook function and cron.
- **Dispatcher**: a SQL function on Supabase Cron every 10 seconds. If any queue has visible messages, it calls `worker` through `pg_net`; otherwise it does nothing and costs no invocation. Cron schedules run in UTC.
- `worker` reads messages in batches with a 60-second visibility timeout, handles them, and deletes them. It stops taking new messages after 100 seconds, inside the free plan's 150-second limit.
- Failed messages reappear after the timeout. After 5 attempts they move to `private.dead_jobs` with the error.
- `private.sync_state.queued` stops a source being queued twice, and `lease_until` stops two syncs of one source running at once.

### 8.3 Full sync

- Runs on first connect, when a calendar is enabled (a trigger on `calendars.sync_enabled`), and after a 410 response.
- `events.list` with `singleEvents=true`, which expands recurring events into instances, each with its own `id` and a `recurringEventId`.
- Window: 30 days back to 90 days ahead. Page with `pageToken`. Save `nextSyncToken` when the last page is done.
- A full sync that runs out of time saves its `pageToken` in `sync_state` and re-queues itself.
- **Verify** which parameters may be combined with `syncToken`. Incremental requests cannot send `timeMin` or `timeMax`, so drop incoming changes outside the window.

### 8.4 Incremental sync

- Queued by: the Google webhook; the poll fallback (cron every 10 minutes, for calendars with no healthy channel or no sync in 15 minutes); `request_sync()` when the app comes to the foreground; and right after the app writes to Google.
- `events.list` with `syncToken` and `showDeleted=true`. Process each event, then store the new token.
- HTTP 410: clear the token and queue a full sync. HTTP 429 or 5xx: re-queue with a growing delay.
- **Nightly reconcile** at 03:00 user time: a bounded list from today minus 2 days to today plus 90 days, without a sync token, diffed against the database. It catches drift and brings far-future events into the window.

### 8.5 Processing one event

```ts
async function processEvent(event: GEvent, cal: Calendar, user: Profile) {
  const item = await activeItem(cal.id, event.id);              // google_active = true
  if (event.status === 'cancelled' || userDeclined(event)) return handleDelete(item);  // D1, D2
  if (isAllDay(event) && !user.include_all_day) return handleDelete(item);
  if (item && item.google_etag === event.etag) return;          // echo of our own write
  const points = colorPoints(user, event.colorId ?? 'default');
  const parsed = parseTitle(event.summary);                     // strips "✓ ", extracts #tags
  const logical = logicalDate(event.start, user.timezone, user.day_boundary_hour);
  if (!item) return createItem(event, points, parsed, logical); // ignored if 0 points; links tags; suggestions
  if (item.finalized) {
    if (startChanged(item, event) && logical >= today(user)) await recreateForNewSlot(item, event);
    return logEvent(item, 'calendar_edit_after_close');
  }
  if (startChanged(item, event)) {
    switch (classifyMove(item, event.start, now(), user.timezone, user.day_boundary_hour)) {
      case 'same_day': await updateTimes(item, event); break;              // M1
      case 'plain_move': await moveItem(item, event, logical); break;      // M2
      case 'miss_and_recreate': await missAndRecreate(item, event); break; // M3
    }
  }
  await updateFields(item, points, parsed, event);  // E1, E2; ignored <-> pending as points cross 0
}
```

Every state change writes an `item_events` row. Realtime delivers the changed rows to open devices (8.8).

### 8.6 Push notifications from Google

- `events.watch` per synced calendar: channel id = UUID, token = random secret (store its hash), address = `https://<project-ref>.supabase.co/functions/v1/google-webhook`.
- `google-webhook` runs with JWT verification off (`verify_jwt = false` in `config.toml`), because Google cannot send a Supabase key.
- Handler: look up the channel by `X-Goog-Channel-ID`, compare `X-Goog-Channel-Token` in constant time, ignore resource state `sync`, queue an incremental sync, return 200 at once.
- Hourly cron queues renewals for channels expiring within 24 hours: create a new channel, then `channels.stop` the old one. **Verify** the current maximum channel lifetime.
- **Verify** whether Google requires the webhook domain to be verified. If it does, put a small proxy on the web app's own domain (a Cloudflare Pages or Vercel function), or rely on polling.
- Stop channels when a calendar is disabled or the account is deleted.

### 8.7 Writes to Google

- User-facing writes (create, move, delete, schedule, reschedule) run inside `app-api`, so the user sees the result. If Google fails, the change is saved locally, the write is queued for retry, and the item shows a "sync issue" badge.
- The ✓ write-back and task completion go through `google_writes`, queued by a trigger on tick and untick.
- Create: summary, start and end in the user's timezone, `colorId` from points, private extended properties (section 7).
- Patching a recurring instance changes only that instance.
- Store the returned `etag`, so the echo from Google is skipped.

### 8.8 Realtime

- Clients subscribe to Postgres Changes on `items`, `day_summaries`, `streak_state`, `deadlines` and `suggestions`, filtered to their user id. RLS still applies.
- Clients patch TanStack Query caches, and refetch today on reconnect or return to the foreground.
- If message volume grows, switch to Broadcast messages sent from database triggers (**verify** current Supabase guidance).

### 8.9 Google Tasks mode

- Reads the task lists the user enables: `tasks.list` per list with `updatedMin`, including completed and deleted tasks.
- Polled by cron every 10 minutes and on app foreground, since there are no push channels (**verify**).
- Writes: insert with a due date only; patch status (`completed` or `needsAction`), title and due date; delete.
- Processing follows 3.13.

## 9. API

The app talks to Supabase three ways:

- **Tables** through the auto-generated API, under row-level security.
- **Postgres functions (RPC)** for multi-step changes.
- **Edge Functions** for anything that touches Google.

All user-facing Edge Function calls go through one function, `app-api`, so a single warm isolate serves them.

### 9.1 Direct table access

| Table | The app can |
| --- | --- |
| `profiles` | Read; update settings columns |
| `calendars`, `task_lists` | Read; update `sync_enabled` (task lists also `points`). A trigger queues the full sync and watch channel. |
| `color_rules`, `areas`, `tags`, `habits` | Read and write |
| `deadlines`, `deadline_tags` | Read and write; manual progress and status live here |
| `daily_notes`, `push_subscriptions` | Read and write |
| `items`, `item_tags`, `item_deadlines`, `suggestions`, `day_summaries`, `streak_state`, `item_events` | Read only |

### 9.2 Postgres functions (RPC)

Each is `security definer` with `search_path = ''`, and checks `auth.uid()` owns every row it touches.

| Function | Purpose |
| --- | --- |
| `day_view(date)` | Items by section and area, live score, band, streak, rest pass, note. Creates missing habit items for that day. |
| `days_range(from, to)` | Day summaries for the week and month tables |
| `complete_item(id, actual_minutes)` | Tick; queues the ✓ write-back or Google task completion |
| `uncomplete_item(id)` | Untick |
| `create_manual_task(title, points, date, area, tags, deadlines)` | Unscheduled task |
| `update_item_local(id, patch)` | Points (manual and habit items), tags, deadline links, area, actual minutes; queues a Google patch when links change |
| `backlog()` | Manual tasks with no date |
| `missed_inbox()` | Open missed items |
| `dismiss_missed(id)` | Leave the inbox; stays missed |
| `mark_late_done(id)` | Late completion within 48 hours; queues a streak recompute |
| `accept_suggestion(id)`, `dismiss_suggestion(id)` | Resolve a suggestion |
| `deadline_stats(id default null)` | Stats and warnings for one deadline or all |
| `analytics_trend(from, to)` | Daily rates and 7-day average |
| `analytics_areas(from, to)` | Points and hours by area and tag |
| `analytics_misses(from, to)` | Miss rate by weekday and start hour; reschedule chains |
| `analytics_heatmap(year)` | Band per day |
| `streak()` | Current, best, and this week's rest pass |
| `request_sync()` | Queue an incremental sync of the user's sources |

### 9.3 Edge Functions

| Function | Called by | Auth | Does |
| --- | --- | --- | --- |
| `app-api` | The app | User JWT | `POST /items` (event or Google task), `PATCH /items/:id` (time, title, colour), `POST /items/:id/schedule`, `DELETE /items/:id`, `POST /missed/:id/reschedule`, `POST /missed/bulk`, `GET /free-slots`, `POST /google/connect`, `GET /export`, `DELETE /me` |
| `google-callback` | Google redirect | Signed state, no JWT | Finish OAuth, store encrypted tokens, list calendars |
| `google-webhook` | Google | Channel token, no JWT | Queue an incremental sync |
| `worker` | The dispatcher, via `pg_net` | Service key | Drain `sync_jobs`, `google_writes` and `jobs` |

## 10. Background jobs

Cron jobs are plain SQL that decide what is due and queue it; the `worker` function does the work. Every job is idempotent: running it twice leaves the same result.

Cron schedules run in UTC, so each SQL job compares the time with every user's own timezone.

| Cron job (SQL) | Every | What it does |
| --- | --- | --- |
| `dispatch` | 10 seconds | Calls `worker` through `pg_net` only when a queue has visible messages |
| `schedule_due_jobs` | 5 minutes | For each user whose day boundary, reminder time or 03:00 has passed: queue `close_day`, prompts, deadline warnings and the nightly reconcile. Also creates habit items for the new logical day. |
| `queue_polls` | 10 minutes | Queue incremental syncs for calendars with no healthy channel or no sync in 15 minutes, and for Tasks-mode lists |
| `queue_renewals` | Hourly | Queue renewal of channels expiring within 24 hours |

| Job (queue) | Queued by | What the worker does |
| --- | --- | --- |
| Incremental sync (`sync_jobs`) | Webhook, polls, `request_sync()`, after writes | 8.4 |
| Full sync (`sync_jobs`) | Calendar or list enabled, a 410 | 8.3 |
| Reconcile (`sync_jobs`) | `schedule_due_jobs`, 03:00 local | Bounded list from today −2 to +90 days |
| Google write (`google_writes`) | Tick trigger, `app-api` retries | ✓ prefix, task status, patches, creates |
| `close_day` (`jobs`) | `schedule_due_jobs` | Pending to missed, fills the inbox, writes `day_summaries`, updates the streak, queues the morning prompt. Keyed by (user, date). |
| `streak` (`jobs`) | `mark_late_done` | Re-walks the streak from the changed day (3.7) |
| `renew_channel` (`jobs`) | `queue_renewals` | New channel, then stop the old one |
| `push` (`jobs`) | Prompts, reminders, deadline warnings | Web Push; deletes subscriptions that return 404 or 410 |

Two GitHub Actions protect the free project:

- **keepalive**, every 3 days: calls a cheap RPC, so the project does not pause after a quiet week.
- **backup**, weekly: `supabase db dump`, encrypted with `age`, uploaded as a private workflow artifact.

With the dispatcher in SQL, functions run only for real work. A handful of users should need a few tens of thousands of invocations a month, against 500,000 included (estimate).

## 11. Screens and UX

Nine screens. Phone: a bottom tab bar (Today, Week, Deadlines, Analytics, More). Laptop: a left sidebar with the same entries, plus Cmd/Ctrl+K for quick add.

1. **Onboarding** (5 steps)
   - Sign in with Google.
   - Connect Google Calendar, then pick calendars to sync.
   - Map colours to points, with Google's real palette swatches; mark the primary colour per value.
   - Confirm timezone and day boundary, and choose where the day lives in Google: events (default) or Google Tasks.
   - Create areas (suggest Rich, Muscular, Intelligent as an editable starting set) and add habits.
2. **Today**
   - Header: logical date, success ring with % and band colour, points done of planned, streak count, and this week's rest pass ("available" or "used Wed").
   - Banner when the missed inbox is open.
   - Sections: Schedule (time order: time range, title, tag chips, points as 1 to 3 dots, checkbox), Tasks (manual, for today), Habits (by area). A toggle groups everything by area, like the Notion layout.
   - Items past their time and not ticked look "overdue" until day close.
   - Tap an item: a sheet with title, points, time, tags and deadlines dropdown, actual minutes, delete, open in Google Calendar.
   - Phone gestures: swipe right to tick, swipe left to reschedule. Undo toast after tick and delete.
   - Daily note at the bottom. Backlog in a drawer.
3. **Missed inbox**: list of missed items with Reschedule (free-slot suggestions first), Dismiss, Mark done; bulk actions on top.
4. **Week**: the automatic version of the Notion weekly table. Rows Monday to Sunday; columns: points done/planned, success %, band, streak status (counted, rest pass, broke), note. Footer: week rate, days counted.
5. **Month and year**: the automatic Performance review. One row per month: rate, days counted, points done, Excellent days, best streak. A year heatmap coloured by band.
6. **Deadlines**
   - List sorted by due date. Each card: title, due date and days left, manual status chip, draggable progress bar, sessions done/planned/missed, hours done/planned, next session, warning badges.
   - Detail: session list (past and upcoming), tags, targets, notes, and "Schedule a session" (quick add prefilled with the tag).
7. **Unassigned tray**: suggestions with Link and Dismiss.
8. **Analytics**: daily rate with 7-day average, points and hours by area per week, planned vs done hours, miss heat grid (weekday by start hour), streak history, top tags by hours, estimate accuracy.
9. **More**: Plan tomorrow, Sunday review, habits, areas, tags, settings, export, delete account.

Band colours (light and dark tokens): Excellent green, Good teal, Fair amber, Not good red. Deadline status: On track green, Needs attention amber, Urgent red, matching the owner's Notion dots.

## 12. Analytics

Every metric is computed from `items` and `day_summaries` with SQL at request time; the data is small. Serve them as Postgres functions (9.2); at this data size no cache is needed.

| Metric | Definition |
| --- | --- |
| Daily success rate | done\_points ÷ planned\_points × 100 (3.6) |
| Weekly or monthly rate | Sum of done points ÷ sum of planned points over finalized days |
| Days counted | Finalized days with rate of 50% or more |
| Streak | Current and best, from `streak_state` (3.7) |
| Points by area | Done and planned points per area per week; items take their area from the item, else from their first tag |
| Hours by area or tag | Sum of actual minutes (else planned) of done items |
| Planned vs done hours | Per week, calendar items only |
| Miss rate by slot | Missed points ÷ planned points, bucketed by weekday and start hour (calendar items) |
| Reschedule chains | For each missed item: times rescheduled, and whether the last link was done |
| Estimate accuracy | Actual minutes ÷ planned minutes, where actual was entered |
| Deadline stats | As in 3.9 |

## 13. Security, privacy and multi-user

Row-level security keeps each user to their own rows, and Google tokens never leave the server unencrypted.

- **Isolation**: RLS on every public table, with policies on `user_id = (select auth.uid())`. Tables the app may not write have SELECT policies only. pgTAP tests prove another user's rows are invisible.
- **Writes with side effects** go through RPC functions (`security definer`, empty `search_path`, ownership checked) or Edge Functions.
- **Keys**: the web app uses only the publishable key. The service key lives in Edge Function secrets and in Vault for cron calls, never in the browser or the repo.
- **Private schema**: Google tokens, OAuth states, watch channels, sync state and dead jobs live in `private`, which the API does not expose.
- **Tokens**: AES-GCM encrypted in Edge Functions with a key from function secrets. Never log tokens, event titles or notes.
- **OAuth connect**: single-use nonce with expiry, PKCE, and a redirect back only to the app's own URL.
- **Functions**: `app-api` and `worker` verify JWTs. `google-callback` checks its signed state; `google-webhook` checks the channel token in constant time.
- **Rate limits**: per-user fixed windows in `private.rate_limits`, checked by `app-api` on writes and syncs.
- **Account deletion**: stop watch channels, revoke the Google token, delete the auth user (all rows cascade). Offer export first.
- **Legal pages**: privacy policy and terms, needed for Google verification (**verify** requirements).
- **Free-plan safeguards**: keep-alive every 3 days and a weekly encrypted backup (section 10). Move to Supabase Pro once other people rely on the app.

## 14. Testing

The rules in section 3 are tested first and hardest. Google is faked in tests, never called.

**Domain unit tests** (Vitest with fake timers, in `packages/domain`):

- Logical date: events at 03:59 and 04:00 with a 04:00 boundary; a DST timezone such as `America/New_York` around the clock change.
- Band edges: 49.9, 50.0, 74.9, 75.0, 84.9, 85.0. The same case table runs against the SQL score functions.
- Streaks:
  - One bad day in a week: kept.
  - Two bad days in a week: reset.
  - Bad Sunday, then bad Monday: kept, since they fall in different weeks.
  - A day with nothing planned: uses the pass.
  - A late mark-done turns a bad day good: recompute from that day.
- Moves M1 to M4 and deletes D1, D2, each before and after start and before and after day close. Tasks-mode moves with day-start as the start time.
- Reschedule: the original stays missed; the new item is linked; both days score correctly.
- Tag parser: `#LFX`, `#lfx-2`, `#a_b`, an email address `a#b@x.com` (not a tag), the "✓ " prefix, tags at the start, middle and end.
- Suggestions: "read lfx notes" matches tag `lfx`; "flfx" does not.

**Database tests** (pgTAP, `supabase test db`):

- RLS: for every table, a second user sees no rows and cannot write.
- RPC functions: `complete_item`, `day_view` scores, the 48-hour `mark_late_done` window, habit item creation.
- Triggers queue the right messages; the dispatcher calls nothing when queues are empty.

**Edge Function tests** (Deno test, mock `fetch` with recorded Google JSON):

- Create, move, delete, colour change, recurring instance edit, pagination, a 410 then full resync.
- Echo suppression, `invalid_grant`, and a full sync that runs out of time and continues.
- Tasks mode: date-only due dates, two-way completion.
- Webhook: wrong token rejected, `sync` state ignored.

**Frontend**: Vitest and Testing Library for the score ring, item row and quick-add preview. Playwright end-to-end against the local Supabase stack:

- Sign in (test user).
- Tick in one browser context and see it in a second within 2 seconds.
- Tick offline, go online, and see it saved.

**Manual QA per phase**: use a real Google account with a test calendar. Check the phase's acceptance criteria on a phone and a laptop.

## 15. Build phases

Nine phases, in order. The owner can use the app daily from Phase 5, once it is deployed. Each phase ends with its acceptance criteria demonstrated and the tests green.

0. **Foundations**
   - Scope: pnpm monorepo, `supabase init`, local stack, `packages/domain` skeleton, React PWA shell with routing and dark theme, generated DB types, CI running lint, Vitest, Deno tests and pgTAP.
   - Done when: `supabase start` plus `pnpm dev` runs everything; the web app opens on a phone on the same Wi-Fi; CI is green.
1. **Accounts and Google connection**
   - Scope: Supabase Auth Google sign-in, `profiles` and settings, the Connect Google Calendar flow (`app-api` and `google-callback`), encrypted tokens, calendar list and picker, colour-to-points screen, and the Events or Tasks setting (Tasks mode itself is Phase 8).
   - Done when: two Google accounts sign in and each sees only its own calendars (RLS tests pass). Google's refresh token never appears in the browser's network log.
2. **Sync engine (pull only)**
   - Scope: queues, dispatcher, `worker`, full and incremental sync, poll fallback, the processing algorithm (8.5), move and delete rules, recurring instances, tag parsing, logical dates.
   - Done when: creating, moving, deleting and recolouring an event in Google Calendar shows up in the database within one poll. A drag to tomorrow before the start is a plain move; after the start, it is a miss plus a new item. A recurring series gives one item per instance. A full sync longer than one run continues in the next. All M and D rule tests pass.
3. **Today, ticking and realtime**
   - Scope: RPC functions, Today screen, tick and untick, actual minutes, manual tasks and backlog, areas, habits and their daily items (with their onboarding steps), live score ring and band, Realtime subscriptions, optimistic UI.
   - Done when: a tick on the phone shows on the laptop within 2 seconds. Ticking works even when no Edge Function has run recently. Zero-point events are hidden. The score matches a hand calculation.
4. **Day close, missed inbox, streaks, tables**
   - Scope: `close_day`, missed inbox with reschedule through `app-api` (first Google write: create event), dismiss, mark done, bulk actions, free-slot suggestions, daily note, streak with rest pass, week table, month table.
   - Done when: every streak scenario in section 14 passes. A rescheduled task shows as missed on its original day and pending on the new day. The week table fills itself with no input.
5. **Deploy and Google push**
   - Scope: hosted Supabase project (`supabase db push`, deploy functions, set secrets), web app on Cloudflare Pages or Vercel, watch channels and `google-webhook`, hourly renewal, nightly reconcile, Google OAuth app published to production, keepalive and backup workflows.
   - Done when: an edit in Google Calendar reaches the app within about 10 seconds. Channels renew by themselves for 14 days unattended. The app installs on the owner's phone. The first weekly backup artifact exists.
6. **Creating from the app**
   - Scope: create, edit, move and delete events from the app with colour from points; schedule a manual task; quick add parser; ✓ write-back; echo suppression.
   - Done when: an event made in the app appears in Google Calendar and Apple Calendar with the right colour. A tick adds the ✓ in Google within about 10 seconds. No sync loops appear in the logs.
7. **Tags, deadlines, suggestions**
   - Scope: tags and deadlines; dropdown linking written to extended properties; hashtag linking; windows, stats and warnings; Unassigned tray.
   - Done when: a "5 PRs raised" deadline with tag `lfx` counts sessions and hours from `#lfx` events. "read lfx notes" appears as a suggestion. A tag shared by two deadlines counts toward both. The no-sessions warning shows when the deadline is within 7 days.
8. **Analytics, Tasks mode and polish**
   - Scope: analytics screens (section 12), year heatmap, Plan tomorrow, Sunday review, Web Push (morning prompt, evening reminder, deadline warnings), offline tick queue, export, account deletion, Google Tasks mode (3.13, 8.9).
   - Done when: a month of real use renders every chart without errors. Notifications arrive on the phone. A tick made offline syncs once online. A test user in Tasks mode sees today's Google tasks as items, and ticking completes them in Google.

## 16. Later

Not in v1; the design above leaves room for each.

- Native iOS and Android home-screen widgets for this app (Google Calendar widgets cover v1).
- Using events and Google Tasks at the same time.
- Outlook or iCloud calendars as sources.
- Shared deadlines with friends.
- A focus timer that fills actual minutes automatically.
- AI planning: suggest where to place sessions so each deadline gets enough time.
- Import from Notion.
- Supabase Pro once others rely on the app: no pausing, daily backups, 400-second functions.

## Sources

- [Supabase Edge Functions limits](https://supabase.com/docs/guides/functions/limits)
- [Supabase project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)
- [About billing on Supabase](https://supabase.com/docs/guides/platform/billing-on-supabase.md)
- [Supabase pricing and free-plan backups (nocode.mba)](https://www.nocode.mba/articles/supabase-pricing)
- [Login with Google, Supabase Auth](https://supabase.com/docs/guides/auth/auth-google)
- [Supabase Cron](https://supabase.com/modules/cron.md)
- [Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions.md)
- [Supabase background jobs: cron, queues and pg\_net](https://dev.to/hugo_rus_630dd942fcf7cc62/supabase-background-jobs-tested-locally-cron-queues-http-from-sql-and-webhooks-3jm5)
- [Google Tasks API reference, due field](https://android.googlesource.com/platform/external/python/google-api-python-client/+/b6971b040/docs/dyn/tasks_v1.tasks.html)
