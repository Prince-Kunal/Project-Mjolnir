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
