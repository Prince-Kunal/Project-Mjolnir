-- Phase 1: profiles and settings, Google account storage, calendars, task lists, colour rules.
-- Supabase grants every new public table to anon and authenticated by default, so each table
-- below revokes that and grants back only what section 9.1 allows.

create function public.is_valid_timezone(tz text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  perform now() at time zone tz;
  return true;
exception when others then
  return false;
end;
$$;

-- Profiles: one row per auth user ------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text,
  avatar_url text,
  timezone text not null default 'UTC' check (public.is_valid_timezone(timezone)),
  day_boundary_hour smallint not null default 4 check (day_boundary_hour between 0 and 23),
  week_start smallint not null default 1 check (week_start between 1 and 7),
  google_item_type text not null default 'events' check (google_item_type in ('events', 'tasks')),
  include_all_day boolean not null default false,
  writeback_checkmark boolean not null default true,
  deadline_warning_days smallint not null default 7 check (deadline_warning_days between 0 and 60),
  morning_prompt_time time not null default '08:00',
  evening_reminder_time time not null default '22:30',
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (
  name, timezone, day_boundary_hour, week_start, google_item_type, include_all_day,
  writeback_checkmark, deadline_warning_days, morning_prompt_time, evening_reminder_time,
  onboarded_at
) on table public.profiles to authenticated;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Colour rules (3.2) -------------------------------------------------------------------------

create table public.color_rules (
  user_id uuid not null references auth.users on delete cascade,
  color_key text not null check (
    color_key in ('default', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11')
  ),
  points smallint not null check (points between 0 and 3),
  primary_for_points boolean not null default false,
  primary key (user_id, color_key)
);

alter table public.color_rules enable row level security;
revoke all on table public.color_rules from anon, authenticated;
grant select, insert, update, delete on table public.color_rules to authenticated;

create policy color_rules_all on public.color_rules for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- New user: profile plus the pre-onboarding colour map (default = 1 point, others 0) ----------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );

  insert into public.color_rules (user_id, color_key, points, primary_for_points)
  select new.id, k, case when k = 'default' then 1 else 0 end, k = 'default'
  from unnest(array['default', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']) as k;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Google sources -----------------------------------------------------------------------------

create table public.calendars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  google_calendar_id text not null,
  summary text,
  color text,
  is_primary boolean not null default false,
  access_role text,
  sync_enabled boolean not null default false,
  last_full_sync_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, google_calendar_id)
);

alter table public.calendars enable row level security;
revoke all on table public.calendars from anon, authenticated;
grant select on table public.calendars to authenticated;
grant update (sync_enabled) on table public.calendars to authenticated;

create policy calendars_select on public.calendars for select to authenticated
  using (user_id = (select auth.uid()));
create policy calendars_update on public.calendars for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table public.task_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  google_tasklist_id text not null,
  title text,
  sync_enabled boolean not null default false,
  points smallint not null default 1 check (points between 0 and 3),
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, google_tasklist_id)
);

alter table public.task_lists enable row level security;
revoke all on table public.task_lists from anon, authenticated;
grant select on table public.task_lists to authenticated;
grant update (sync_enabled, points) on table public.task_lists to authenticated;

create policy task_lists_select on public.task_lists for select to authenticated
  using (user_id = (select auth.uid()));
create policy task_lists_update on public.task_lists for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Private: Google tokens and OAuth connect state (never exposed through the API) -------------

create table private.google_accounts (
  user_id uuid primary key references auth.users on delete cascade,
  google_sub text not null unique,
  email text,
  scopes text[] not null default '{}',
  refresh_token_enc bytea,
  access_token_enc bytea,
  access_expires_at timestamptz,
  status text not null default 'ok' check (status in ('ok', 'reconnect_needed')),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.oauth_states (
  nonce text primary key,
  user_id uuid not null references auth.users on delete cascade,
  code_verifier text not null,
  expires_at timestamptz not null
);

-- What the app may know about its Google connection: never the tokens.
create function public.google_connection()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object(
       'connected', true,
       'email', g.email,
       'status', g.status,
       'scopes', to_jsonb(g.scopes),
       'connected_at', g.connected_at)
     from private.google_accounts g
     where g.user_id = (select auth.uid())),
    jsonb_build_object('connected', false)
  );
$$;

revoke execute on function public.google_connection() from public, anon;
grant execute on function public.google_connection() to authenticated;

-- Service-role functions used by Edge Functions to reach the private schema ------------------

create function public.svc_create_oauth_state(
  p_user_id uuid, p_nonce text, p_code_verifier text, p_ttl_seconds int default 600
)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.oauth_states where expires_at < now();
  insert into private.oauth_states (nonce, user_id, code_verifier, expires_at)
  values (p_nonce, p_user_id, p_code_verifier, now() + make_interval(secs => p_ttl_seconds));
$$;

-- Single use: the row is deleted whether or not it has expired.
create function public.svc_consume_oauth_state(p_nonce text)
returns table (user_id uuid, code_verifier text)
language sql
security definer
set search_path = ''
as $$
  with consumed as (
    delete from private.oauth_states s where s.nonce = p_nonce
    returning s.user_id, s.code_verifier, s.expires_at
  )
  select c.user_id, c.code_verifier from consumed c where c.expires_at > now();
$$;

-- Tokens arrive base64-encoded (already AES-GCM encrypted by the Edge Function).
-- A null refresh token keeps the stored one. Connecting a different Google account
-- replaces the old account's calendars.
create function public.svc_save_google_account(
  p_user_id uuid,
  p_google_sub text,
  p_email text,
  p_scopes text[],
  p_refresh_token_enc text,
  p_access_token_enc text,
  p_access_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.calendars c
  using private.google_accounts g
  where g.user_id = p_user_id and g.google_sub <> p_google_sub and c.user_id = p_user_id;

  insert into private.google_accounts as g (
    user_id, google_sub, email, scopes, refresh_token_enc, access_token_enc, access_expires_at,
    status, connected_at, updated_at
  )
  values (
    p_user_id, p_google_sub, p_email, p_scopes, decode(p_refresh_token_enc, 'base64'),
    decode(p_access_token_enc, 'base64'), p_access_expires_at, 'ok', now(), now()
  )
  on conflict (user_id) do update set
    google_sub = excluded.google_sub,
    email = excluded.email,
    scopes = excluded.scopes,
    refresh_token_enc = coalesce(excluded.refresh_token_enc, g.refresh_token_enc),
    access_token_enc = excluded.access_token_enc,
    access_expires_at = excluded.access_expires_at,
    status = 'ok',
    connected_at = case when g.google_sub = excluded.google_sub then g.connected_at else now() end,
    updated_at = now();
end;
$$;

create function public.svc_get_google_account(p_user_id uuid)
returns table (
  google_sub text,
  email text,
  scopes text[],
  refresh_token_enc text,
  access_token_enc text,
  access_expires_at timestamptz,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select g.google_sub, g.email, g.scopes, encode(g.refresh_token_enc, 'base64'),
    encode(g.access_token_enc, 'base64'), g.access_expires_at, g.status
  from private.google_accounts g
  where g.user_id = p_user_id;
$$;

create function public.svc_update_google_tokens(
  p_user_id uuid, p_access_token_enc text, p_access_expires_at timestamptz, p_status text
)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.google_accounts set
    access_token_enc = decode(p_access_token_enc, 'base64'),
    access_expires_at = p_access_expires_at,
    status = p_status,
    updated_at = now()
  where user_id = p_user_id;
$$;

-- Calendar list from Google: [{google_calendar_id, summary, color, is_primary, access_role}].
-- Keeps sync_enabled on calendars already known.
create function public.svc_upsert_calendars(p_user_id uuid, p_calendars jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.calendars (user_id, google_calendar_id, summary, color, is_primary, access_role)
  select p_user_id, c ->> 'google_calendar_id', c ->> 'summary', c ->> 'color',
    coalesce((c ->> 'is_primary')::boolean, false), c ->> 'access_role'
  from jsonb_array_elements(p_calendars) as c
  on conflict (user_id, google_calendar_id) do update set
    summary = excluded.summary,
    color = excluded.color,
    is_primary = excluded.is_primary,
    access_role = excluded.access_role;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.svc_create_oauth_state(uuid, text, text, int)',
    'public.svc_consume_oauth_state(text)',
    'public.svc_save_google_account(uuid, text, text, text[], text, text, timestamptz)',
    'public.svc_get_google_account(uuid)',
    'public.svc_update_google_tokens(uuid, text, timestamptz, text)',
    'public.svc_upsert_calendars(uuid, jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
