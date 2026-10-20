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

## Setup

```sh
pnpm install
supabase start                         # local Postgres, Auth, Realtime, Studio
cp apps/web/.env.example apps/web/.env.local
# put the PUBLISHABLE_KEY printed by `supabase status` into apps/web/.env.local
pnpm dev                               # web app on http://localhost:5173
```

`pnpm dev` also prints a Network URL (for example `http://192.168.1.20:5173`): open it on a phone
on the same Wi-Fi.

The local stack uses ports in the 554xx range (API `55421`, DB `55422`, Studio `55423`, Mailpit
`55424`) so it can run beside other local Supabase projects.

## Everyday commands

| Command               | What it does                                             |
| --------------------- | -------------------------------------------------------- |
| `pnpm dev`            | Start the web app                                        |
| `pnpm test`           | Vitest in every package                                  |
| `pnpm test:functions` | Deno tests for Edge Functions                            |
| `pnpm test:db`        | pgTAP tests against the local database                   |
| `pnpm lint`           | ESLint                                                   |
| `pnpm format`         | Prettier                                                 |
| `pnpm typecheck`      | `tsc --noEmit` in every package                          |
| `pnpm db:types`       | Regenerate `packages/db-types` after a migration         |
| `supabase db reset`   | Rebuild the local database from migrations and seed data |

## Database changes

Every schema change is a migration file in `supabase/migrations/`, never an edit in the dashboard.
Create one with `supabase migration new <name> < /dev/null` (the CLI reads stdin as the file body),
then run `supabase db reset` and `pnpm db:types`. CI fails if the generated types are stale.
