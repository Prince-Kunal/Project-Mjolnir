-- Phase 0 foundations: extensions used across the plan, and the private schema.

-- citext: case-insensitive tag names (section 7, tags.name).
create extension if not exists citext with schema extensions;
-- pg_cron, pg_net, pgmq: scheduler, HTTP from SQL, and queues (sections 8.2 and 10).
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists pgmq;

-- Google tokens, OAuth states, watch channels, sync bookkeeping and dead jobs live here.
-- It is never added to the API's exposed schemas, and API roles get no access (section 13).
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;
alter default privileges in schema private revoke all on tables from public, anon, authenticated;
alter default privileges in schema private grant all on tables to service_role;
alter default privileges in schema private grant all on sequences to service_role;
