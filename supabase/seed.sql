-- Local development seed data. Runs after migrations on `supabase db reset`.

-- Local worker wake-up: the dispatcher reads these from Vault. The hosted project gets its own
-- values in Phase 5. The secret matches WORKER_SECRET in supabase/.env and is for local use only.
select vault.create_secret('http://kong:8000/functions/v1/worker', 'worker_url');
select vault.create_secret('local-dev-worker-secret', 'worker_secret');
