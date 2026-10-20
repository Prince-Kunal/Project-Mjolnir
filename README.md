# Project Mjolnir

One app that replaces the Notion task list and the manual weekly table. Google Calendar holds the
schedule; the app holds completion, points, tags, deadlines, habits, notes, scores and streaks.

The full specification is in [docs/PLAN.md](docs/PLAN.md). Choices the plan does not cover are
logged in [docs/DECISIONS.md](docs/DECISIONS.md).

## Repo layout

```text
apps/web/            React PWA (Vite, Tailwind, React Router, TanStack Query)
packages/domain/     Pure rule logic from plan section 3, shared by web and Edge Functions
packages/db-types/   Database types generated from the local Supabase stack
supabase/            Config, migrations, pgTAP tests, Edge Functions (Deno)
docs/                PLAN.md, DECISIONS.md
```

## Prerequisites

- Node 22 (see `.nvmrc`) and pnpm 10
- Docker (running)
- [Supabase CLI](https://supabase.com/docs/guides/cli) 2.118 or newer
- [Deno](https://deno.com) 2 (Edge Function tests)

## Google Cloud setup (once)

1. In [Google Cloud Console](https://console.cloud.google.com), create a project and enable the
   **Google Calendar API**.
2. Under **Google Auth Platform**: set Branding; set Audience to External in Testing with your
   accounts as test users; add the scopes `openid`, `email`, `profile`, `calendar.events` and
   `calendar.calendarlist.readonly` under Data Access.
3. Create a **Web application** client with:
   - JavaScript origin `http://localhost:5173`
   - Redirect URIs `http://127.0.0.1:55421/auth/v1/callback` (sign-in) and
     `http://127.0.0.1:55421/functions/v1/google-callback` (Connect Calendar)
4. Create `supabase/.env` (gitignored):

   ```sh
   GOOGLE_CLIENT_ID=....apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=...
   TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)   # paste the generated value
   GOOGLE_REDIRECT_URI=http://127.0.0.1:55421/functions/v1/google-callback
   APP_URL=http://localhost:5173
   WORKER_SECRET=local-dev-worker-secret   # must match the Vault value in supabase/seed.sql
   ```

## Setup

```sh
pnpm install
supabase start                         # local Postgres, Auth, Realtime, Studio
cp apps/web/.env.example apps/web/.env.local
# put the PUBLISHABLE_KEY printed by `supabase status` into apps/web/.env.local
pnpm functions:serve                   # Edge Functions, reading supabase/.env
pnpm dev                               # web app on http://localhost:5173
```

`supabase start` reads `supabase/.env` for the Google sign-in provider, so restart the stack
(`supabase stop && supabase start`) after changing it.

`pnpm dev` also prints a Network URL (for example `http://192.168.1.20:5173`): open it on a phone
on the same Wi-Fi. Signing in from the phone needs the hosted Supabase project (Phase 5), because
the local API listens on `127.0.0.1`.

The local stack uses ports in the 554xx range (API `55421`, DB `55422`, Studio `55423`, Mailpit
`55424`) so it can run beside other local Supabase projects.

## Everyday commands

| Command                 | What it does                                              |
| ----------------------- | --------------------------------------------------------- |
| `pnpm dev`              | Start the web app                                         |
| `pnpm functions:serve`  | Serve Edge Functions locally with `supabase/.env`         |
| `pnpm test`             | Vitest in every package                                   |
| `pnpm test:functions`   | Deno tests for Edge Functions                             |
| `pnpm test:db`          | pgTAP tests against the local database                    |
| `pnpm e2e`              | Playwright end-to-end tests (stack and functions running) |
| `pnpm gen:shared-tests` | Regenerate SQL tests from the shared rule cases           |
| `pnpm lint`             | ESLint                                                    |
| `pnpm format`           | Prettier                                                  |
| `pnpm typecheck`        | `tsc --noEmit` in every package                           |
| `pnpm db:types`         | Regenerate `packages/db-types` after a migration          |
| `supabase db reset`     | Rebuild the local database from migrations and seed data  |

## How sync runs

Postgres decides when work is due and wakes the `worker` Edge Function only when there is some:

1. Enabling a calendar, the 10-minute poll, or `request_sync()` puts a message on the `sync_jobs` queue.
2. `private.dispatch()` runs every 10 seconds (pg_cron). If a message is visible, it calls `worker`
   through pg_net; otherwise it does nothing.
3. `worker` leases the calendar, pages through Google, and applies each page in one transaction.
   It stops after 100 seconds and continues in the next run.

`pnpm functions:serve` must be running locally for step 3. Useful queries:

```sql
select * from private.sync_state;            -- per-calendar sync state and last error
select * from pgmq.q_sync_jobs;              -- waiting messages
select * from private.dead_jobs;             -- jobs that failed 5 times
select private.queue_sync('<calendar id>', 'incremental');  -- sync one calendar now
```

## Database changes

Every schema change is a migration file in `supabase/migrations/`, never an edit in the dashboard.
Create one with `supabase migration new <name> < /dev/null` (the CLI reads stdin as the file body),
then run `supabase migration up` (keeps local data) or `supabase db reset` (rebuilds it, which signs
everyone out locally), and `pnpm db:types`. CI fails if the generated types are stale.
