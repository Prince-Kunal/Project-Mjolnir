-- Phase 5: Google push (watch channels, webhook, renewals), nightly reconcile, keep-alive.

-- Watch channels (8.6) --------------------------------------------------------------------------

-- `id` is the channel id we give Google. Rows outlive their calendar so the channel can still be
-- stopped at Google after the calendar is removed.
create table private.watch_channels (
  id uuid primary key,
  calendar_id uuid references public.calendars on delete set null,
  user_id uuid not null references auth.users on delete cascade,
  resource_id text,
  token_hash text not null,
  expires_at timestamptz not null,
  stopped_at timestamptz,
  created_at timestamptz not null default now()
);
create index watch_channels_calendar on private.watch_channels (calendar_id) where stopped_at is null;

-- jobs: Google work that is not a sync. {kind: watch | stop_channel, ...}
select pgmq.create('jobs');

-- The webhook address lives in Vault (`google_webhook_url`). Without it (local development)
-- no channel work is queued and calendars rely on polling.
create function private.webhook_url()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'google_webhook_url';
$$;

create function private.queue_job(p_message jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  select pgmq.send('jobs', p_message);
$$;

create function private.queue_watch(p_calendar_id uuid, p_replace uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := private.webhook_url();
begin
  if v_url is null then
    return;
  end if;
  perform private.queue_job(jsonb_build_object(
    'kind', 'watch', 'calendar_id', p_calendar_id, 'replace', p_replace, 'address', v_url));
end;
$$;

-- Enabling a calendar queues a full sync and a watch channel; disabling stops its channels.
create or replace function private.calendars_sync_enabled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_channel uuid;
begin
  if new.sync_enabled and (tg_op = 'INSERT' or not old.sync_enabled) then
    update private.sync_state set sync_token = null, page_token = null, run_kind = null
    where source_id = new.id;
    perform private.queue_sync(new.id, 'full');
    perform private.queue_watch(new.id);
  elsif tg_op = 'UPDATE' and old.sync_enabled and not new.sync_enabled then
    for v_channel in
      select id from private.watch_channels where calendar_id = new.id and stopped_at is null
    loop
      perform private.queue_job(jsonb_build_object('kind', 'stop_channel', 'channel_id', v_channel));
    end loop;
  end if;
  return new;
end;
$$;

-- Hourly (8.6): renew channels expiring within 24 hours, watch enabled calendars that have no
-- channel, and stop channels whose calendar is gone or disabled.
create function private.queue_renewals()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count int := 0;
begin
  if private.webhook_url() is null then
    return 0;
  end if;

  for r in
    select w.id, w.calendar_id from private.watch_channels w
    join public.calendars c on c.id = w.calendar_id and c.sync_enabled
    where w.stopped_at is null and w.expires_at < now() + interval '24 hours'
      and not exists (
        select 1 from private.watch_channels n
        where n.calendar_id = w.calendar_id and n.stopped_at is null and n.id <> w.id
          and n.expires_at > now() + interval '24 hours')
  loop
    perform private.queue_watch(r.calendar_id, r.id);
    v_count := v_count + 1;
  end loop;

  for r in
    select c.id from public.calendars c
    join private.google_accounts g on g.user_id = c.user_id and g.status = 'ok'
    where c.sync_enabled and not exists (
      select 1 from private.watch_channels w
      where w.calendar_id = c.id and w.stopped_at is null and w.expires_at > now())
  loop
    perform private.queue_watch(r.id);
    v_count := v_count + 1;
  end loop;

  for r in
    select w.id from private.watch_channels w
    left join public.calendars c on c.id = w.calendar_id
    where w.stopped_at is null and w.expires_at > now() and (c.id is null or not c.sync_enabled)
  loop
    perform private.queue_job(jsonb_build_object('kind', 'stop_channel', 'channel_id', r.id));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function private.queue_renewals() from public;
select cron.schedule('mjolnir-queue-renewals', '7 * * * *', 'select private.queue_renewals()');

-- Polls (8.4): calendars with no healthy channel, or no sync in 15 minutes.
create or replace function private.queue_polls()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count int := 0;
begin
  for v_id in
    select c.id from public.calendars c
    join private.google_accounts g on g.user_id = c.user_id and g.status = 'ok'
    where c.sync_enabled
      and (
        c.last_sync_at is null or c.last_sync_at < now() - interval '15 minutes'
        or not exists (
          select 1 from private.watch_channels w
          where w.calendar_id = c.id and w.stopped_at is null and w.expires_at > now()))
  loop
    perform private.queue_sync(v_id, 'incremental');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- The dispatcher now watches both queues.
create or replace function private.dispatch()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from pgmq.q_sync_jobs where vt <= clock_timestamp())
     and not exists (select 1 from pgmq.q_jobs where vt <= clock_timestamp()) then
    return false;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'worker_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'worker_secret';
  if v_url is null or v_secret is null then
    return false;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-worker-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
  return true;
end;
$$;

-- Worker and webhook access to channels --------------------------------------------------------

create function public.svc_watch_context(p_calendar_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'calendar_id', c.id, 'user_id', c.user_id, 'google_calendar_id', c.google_calendar_id,
    'sync_enabled', c.sync_enabled,
    'channels', coalesce((
      select jsonb_agg(jsonb_build_object('id', w.id, 'resource_id', w.resource_id, 'expires_at', w.expires_at))
      from private.watch_channels w
      where w.calendar_id = c.id and w.stopped_at is null and w.expires_at > now()), '[]'))
  from public.calendars c where c.id = p_calendar_id;
$$;

create function public.svc_channel_save(
  p_id uuid, p_calendar_id uuid, p_user_id uuid, p_resource_id text, p_token_hash text,
  p_expires_at timestamptz
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.watch_channels (id, calendar_id, user_id, resource_id, token_hash, expires_at)
  values (p_id, p_calendar_id, p_user_id, p_resource_id, p_token_hash, p_expires_at);
$$;

create function public.svc_channel_get(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', w.id, 'calendar_id', w.calendar_id, 'user_id', w.user_id, 'resource_id', w.resource_id,
    'token_hash', w.token_hash, 'expires_at', w.expires_at, 'stopped_at', w.stopped_at)
  from private.watch_channels w where w.id = p_id;
$$;

create function public.svc_channel_stopped(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.watch_channels set stopped_at = coalesce(stopped_at, now()) where id = p_id;
$$;

-- The webhook asks for an incremental sync of the channel's calendar.
create function public.svc_queue_sync(p_calendar_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.queue_sync(p_calendar_id, 'incremental');
$$;

-- Nightly reconcile (8.4) ------------------------------------------------------------------------

alter table private.sync_state add column last_reconcile_on date;

-- A reconcile is a bounded re-list that diffs against the database; it keeps the incremental
-- sync token, so changes outside its window are still caught by the next incremental sync.
create or replace function public.svc_sync_finish(p_source_id uuid, p_sync_token text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s private.sync_state;
begin
  select * into s from private.sync_state where source_id = p_source_id for update;

  update private.sync_state set
    sync_token = case when s.run_kind = 'reconcile' and s.sync_token is not null
      then s.sync_token else p_sync_token end,
    page_token = null, run_kind = null, lease_until = null,
    attempts = 0, last_error = null, updated_at = now()
  where source_id = p_source_id;

  update public.calendars set
    last_sync_at = now(),
    last_full_sync_at = case when s.run_kind = 'full' then now() else last_full_sync_at end
  where id = p_source_id;

  -- A request that arrived during the run lost its message to the lease; send it again.
  if s.queued or s.pending_kind is not null then
    update private.sync_state set queued = false where source_id = p_source_id;
    perform private.queue_sync(p_source_id, coalesce(s.pending_kind, 'incremental'));
  end if;
end;
$$;

-- schedule_due_jobs also queues each calendar's reconcile once a day, after 03:00 local time.
create or replace function private.schedule_due_jobs()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  d date;
  v_today date;
  v_local timestamp;
  v_closed int := 0;
  v_cal uuid;
begin
  for p in select id, timezone from public.profiles where onboarded_at is not null loop
    v_today := private.logical_today(p.id);
    for d in
      select g::date from generate_series(
        greatest(private.tracking_start(p.id), v_today - 30), v_today - 1, interval '1 day') g
    loop
      if private.close_day(p.id, d) then
        v_closed := v_closed + 1;
      end if;
    end loop;
    perform private.ensure_habit_items(p.id, v_today);

    v_local := now() at time zone p.timezone;
    if extract(hour from v_local) >= 3 then
      for v_cal in
        select c.id from public.calendars c
        join private.google_accounts g on g.user_id = c.user_id and g.status = 'ok'
        left join private.sync_state s on s.source_id = c.id
        where c.user_id = p.id and c.sync_enabled
          and s.sync_token is not null
          and s.last_reconcile_on is distinct from v_local::date
      loop
        update private.sync_state set last_reconcile_on = v_local::date where source_id = v_cal;
        perform private.queue_sync(v_cal, 'reconcile');
      end loop;
    end if;
  end loop;
  return v_closed;
end;
$$;

-- Keep-alive (section 10): the cheapest possible API call, for the GitHub Action.
create function public.ping()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'ok';
$$;
grant execute on function public.ping() to anon, authenticated;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.svc_watch_context(uuid)',
    'public.svc_channel_save(uuid, uuid, uuid, text, text, timestamptz)',
    'public.svc_channel_get(uuid)',
    'public.svc_channel_stopped(uuid)',
    'public.svc_queue_sync(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
