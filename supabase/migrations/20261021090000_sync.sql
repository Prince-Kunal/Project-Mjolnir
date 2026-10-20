-- Phase 2: items and tags, sync bookkeeping, the sync_jobs queue, the dispatcher and poll fallback.
-- Rules (what an event change means) live in TypeScript; the functions here only store results.

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Tags (3.8) ---------------------------------------------------------------------------------

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name extensions.citext not null check (name::text ~ '^[a-z0-9_-]{1,32}$'),
  area_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.tags enable row level security;
revoke all on table public.tags from anon, authenticated;
grant select, insert, update, delete on table public.tags to authenticated;
create policy tags_all on public.tags for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Items: calendar events, Google tasks, manual tasks, habit checks (section 7) ---------------

create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  source text not null check (source in ('calendar', 'gtask', 'manual', 'habit')),
  title text not null default '',
  raw_title text,
  points smallint not null check (points between 0 and 3),
  logical_date date,
  start_at timestamptz,
  end_at timestamptz,
  is_all_day boolean not null default false,
  planned_minutes int check (planned_minutes >= 0),
  actual_minutes int check (actual_minutes >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'done', 'missed', 'deleted', 'ignored')),
  miss_reason text check (miss_reason in ('day_close', 'moved_after_start')),
  completed_at timestamptz,
  finalized boolean not null default false,
  marked_late boolean not null default false,
  inbox_state text not null default 'none'
    check (inbox_state in ('none', 'open', 'dismissed', 'rescheduled')),
  rescheduled_from_id uuid references public.items on delete set null,
  area_id uuid,
  habit_id uuid,
  -- History outlives a removed calendar, so these detach instead of cascading.
  calendar_id uuid references public.calendars on delete set null,
  google_event_id text,
  recurring_event_id text,
  task_list_id uuid references public.task_lists on delete set null,
  google_task_id text,
  google_active boolean not null default false,
  google_etag text,
  google_updated_at timestamptz,
  -- Start of the last sync run that saw this event; a full sync deletes what it no longer sees.
  google_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index items_calendar_event_active on public.items (calendar_id, google_event_id)
  where google_active;
create unique index items_task_active on public.items (task_list_id, google_task_id)
  where google_active;
create unique index items_habit_day on public.items (habit_id, logical_date)
  where source = 'habit';
create index items_user_day on public.items (user_id, logical_date);
create index items_user_inbox on public.items (user_id, inbox_state) where inbox_state = 'open';
create index items_calendar_start on public.items (calendar_id, start_at) where google_active;
create index items_rescheduled_from on public.items (rescheduled_from_id);

create trigger items_touch before update on public.items
  for each row execute function private.touch_updated_at();

alter table public.items enable row level security;
revoke all on table public.items from anon, authenticated;
grant select on table public.items to authenticated;
create policy items_select on public.items for select to authenticated
  using (user_id = (select auth.uid()));

create table public.item_tags (
  item_id uuid not null references public.items on delete cascade,
  tag_id uuid not null references public.tags on delete cascade,
  source text not null check (source in ('hashtag', 'explicit', 'suggestion')),
  primary key (item_id, tag_id)
);
create index item_tags_tag on public.item_tags (tag_id);

alter table public.item_tags enable row level security;
revoke all on table public.item_tags from anon, authenticated;
grant select on table public.item_tags to authenticated;
create policy item_tags_select on public.item_tags for select to authenticated
  using (exists (
    select 1 from public.items i where i.id = item_id and i.user_id = (select auth.uid())
  ));

-- Audit log: created, moved, rescheduled, completed, uncompleted, missed, deleted, points_changed …
create table public.item_events (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  item_id uuid references public.items on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  at timestamptz not null default now()
);
create index item_events_item on public.item_events (item_id);

alter table public.item_events enable row level security;
revoke all on table public.item_events from anon, authenticated;
grant select on table public.item_events to authenticated;
create policy item_events_select on public.item_events for select to authenticated
  using (user_id = (select auth.uid()));

-- Sync bookkeeping (private) ----------------------------------------------------------------

-- One row per source (calendar now, task list in Phase 8).
-- `queued` means a message is waiting or will be re-sent when the current run ends.
-- `run_*` describe the run in progress, so a run that runs out of time continues where it stopped.
create table private.sync_state (
  source_id uuid primary key,
  pending_kind text check (pending_kind in ('incremental', 'reconcile', 'full')),
  queued boolean not null default false,
  sync_token text,
  page_token text,
  run_kind text check (run_kind in ('incremental', 'reconcile', 'full')),
  run_started_at timestamptz,
  window_from timestamptz,
  window_to timestamptz,
  lease_until timestamptz,
  attempts int not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);

create table private.dead_jobs (
  id bigserial primary key,
  queue text not null,
  message jsonb not null,
  error text,
  at timestamptz not null default now()
);

select pgmq.create('sync_jobs');

create function private.sync_rank(kind text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case kind when 'full' then 3 when 'reconcile' then 2 when 'incremental' then 1 else 0 end;
$$;

-- Ask for a sync. A source has at most one waiting message; a stronger kind upgrades the request.
-- A request left waiting for 10 minutes (a lost message) is sent again.
create function private.queue_sync(p_source_id uuid, p_kind text, p_delay_seconds int default 0)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queued boolean;
  v_updated timestamptz;
begin
  insert into private.sync_state (source_id) values (p_source_id) on conflict do nothing;
  select queued, updated_at into v_queued, v_updated
  from private.sync_state where source_id = p_source_id for update;

  update private.sync_state set
    pending_kind = case
      when private.sync_rank(p_kind) > private.sync_rank(pending_kind) then p_kind
      else pending_kind end,
    queued = true,
    updated_at = now()
  where source_id = p_source_id;

  if not v_queued or v_updated < now() - interval '10 minutes' then
    perform pgmq.send('sync_jobs', jsonb_build_object('source_id', p_source_id), p_delay_seconds);
  end if;
end;
$$;

-- Enabling a calendar queues a full sync (8.3). Disabling just stops future runs.
create function private.calendars_sync_enabled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sync_enabled and (tg_op = 'INSERT' or not old.sync_enabled) then
    update private.sync_state set sync_token = null, page_token = null, run_kind = null
    where source_id = new.id;
    perform private.queue_sync(new.id, 'full');
  end if;
  return new;
end;
$$;

create trigger calendars_sync_enabled after insert or update of sync_enabled on public.calendars
  for each row execute function private.calendars_sync_enabled();

create function private.calendars_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.items set google_active = false where calendar_id = old.id and google_active;
  delete from private.sync_state where source_id = old.id;
  return old;
end;
$$;

create trigger calendars_deleted before delete on public.calendars
  for each row execute function private.calendars_deleted();

-- The app asks for a sync when it comes to the foreground (8.4).
create function public.request_sync()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int := 0;
  v_id uuid;
begin
  for v_id in
    select c.id from public.calendars c
    join private.google_accounts g on g.user_id = c.user_id and g.status = 'ok'
    where c.user_id = (select auth.uid()) and c.sync_enabled
  loop
    perform private.queue_sync(v_id, 'incremental');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.request_sync() from public, anon;
grant execute on function public.request_sync() to authenticated;

-- Worker: lease, page data, apply, checkpoint, finish, fail ---------------------------------

-- Takes a source for one run. Returns null when another run holds it or it cannot sync.
create function public.svc_sync_lease(p_source_id uuid, p_lease_seconds int default 120)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s private.sync_state;
  c public.calendars;
  p public.profiles;
  v_ok boolean;
  v_kind text;
begin
  select * into s from private.sync_state where source_id = p_source_id for update;
  if not found or (s.lease_until is not null and s.lease_until > now()) then
    return null;
  end if;

  select * into c from public.calendars where id = p_source_id;
  select exists (
    select 1 from private.google_accounts g where g.user_id = c.user_id and g.status = 'ok'
  ) into v_ok;
  if c.id is null or not c.sync_enabled or not v_ok then
    update private.sync_state set queued = false, pending_kind = null, updated_at = now()
    where source_id = p_source_id;
    return null;
  end if;

  if s.run_kind is not null and not (s.pending_kind = 'full' and s.run_kind <> 'full') then
    -- Continue the run in progress; a waiting request runs after it.
    v_kind := s.run_kind;
  else
    v_kind := case
      when s.sync_token is null or s.pending_kind = 'full' then 'full'
      else coalesce(s.pending_kind, 'incremental') end;
    s.page_token := null;
    s.run_started_at := now();
    s.window_from := now() - case when v_kind = 'reconcile' then interval '2 days' else interval '30 days' end;
    s.window_to := now() + interval '90 days';
    s.pending_kind := null;
  end if;

  update private.sync_state set
    run_kind = v_kind,
    run_started_at = s.run_started_at,
    window_from = s.window_from,
    window_to = s.window_to,
    page_token = s.page_token,
    pending_kind = s.pending_kind,
    queued = false,
    lease_until = now() + make_interval(secs => p_lease_seconds),
    updated_at = now()
  where source_id = p_source_id;

  select * into p from public.profiles where id = c.user_id;

  return jsonb_build_object(
    'source_id', c.id,
    'user_id', c.user_id,
    'google_calendar_id', c.google_calendar_id,
    'run_kind', v_kind,
    'run_started_at', s.run_started_at,
    'window_from', s.window_from,
    'window_to', s.window_to,
    'sync_token', case when v_kind = 'incremental' then s.sync_token end,
    'page_token', s.page_token,
    'profile', jsonb_build_object(
      'timezone', p.timezone,
      'day_boundary_hour', p.day_boundary_hour,
      'include_all_day', p.include_all_day
    ),
    'color_rules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'colorKey', r.color_key, 'points', r.points, 'primaryForPoints', r.primary_for_points))
      from public.color_rules r where r.user_id = c.user_id
    ), '[]'::jsonb)
  );
end;
$$;

-- The fields the planner needs to decide what an event change means.
create function public.svc_sync_items(p_calendar_id uuid, p_event_ids text[])
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', i.id, 'google_event_id', i.google_event_id, 'status', i.status,
    'finalized', i.finalized, 'logical_date', i.logical_date, 'start_at', i.start_at,
    'end_at', i.end_at, 'points', i.points, 'raw_title', i.raw_title,
    'planned_minutes', i.planned_minutes, 'google_etag', i.google_etag)
  from public.items i
  where i.calendar_id = p_calendar_id and i.google_active and i.google_event_id = any (p_event_ids);
$$;

-- Active items in the run window that the run has not seen: gone from Google.
create function public.svc_sync_unseen(p_calendar_id uuid)
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', i.id, 'google_event_id', i.google_event_id, 'status', i.status,
    'finalized', i.finalized, 'logical_date', i.logical_date, 'start_at', i.start_at,
    'end_at', i.end_at, 'points', i.points, 'raw_title', i.raw_title,
    'planned_minutes', i.planned_minutes, 'google_etag', i.google_etag)
  from public.items i
  join private.sync_state s on s.source_id = i.calendar_id
  where i.calendar_id = p_calendar_id and i.google_active and i.status <> 'deleted'
    and i.start_at < s.window_to and coalesce(i.end_at, i.start_at) > s.window_from
    and (i.google_seen_at is null or i.google_seen_at < s.run_started_at);
$$;

-- Replaces an item's hashtag links with `p_tags`, creating unknown tags. Other links stay (E1).
create function private.set_hashtags(p_item_id uuid, p_user_id uuid, p_tags text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tags (user_id, name)
  select p_user_id, t from unnest(p_tags) as t
  on conflict (user_id, name) do nothing;

  delete from public.item_tags it
  where it.item_id = p_item_id and it.source = 'hashtag'
    and it.tag_id not in (
      select t.id from public.tags t where t.user_id = p_user_id and t.name = any (p_tags)
    );

  insert into public.item_tags (item_id, tag_id, source)
  select p_item_id, t.id, 'hashtag' from public.tags t
  where t.user_id = p_user_id and t.name = any (p_tags)
  on conflict (item_id, tag_id) do nothing;
end;
$$;

create function private.insert_calendar_item(
  p_user_id uuid, p_calendar_id uuid, p_item jsonb, p_seen timestamptz, p_from uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.items (
    user_id, source, title, raw_title, points, logical_date, start_at, end_at, is_all_day,
    planned_minutes, status, calendar_id, google_event_id, recurring_event_id, google_active,
    google_etag, google_updated_at, google_seen_at, rescheduled_from_id
  ) values (
    p_user_id, 'calendar', coalesce(p_item ->> 'title', ''), p_item ->> 'raw_title',
    (p_item ->> 'points')::smallint, (p_item ->> 'logical_date')::date,
    (p_item ->> 'start_at')::timestamptz, (p_item ->> 'end_at')::timestamptz,
    coalesce((p_item ->> 'is_all_day')::boolean, false), (p_item ->> 'planned_minutes')::int,
    p_item ->> 'status', p_calendar_id, p_item ->> 'google_event_id',
    p_item ->> 'recurring_event_id', true, p_item ->> 'google_etag',
    (p_item ->> 'google_updated_at')::timestamptz, p_seen, p_from
  )
  returning id into v_id;
  return v_id;
end;
$$;

create function private.log_item_events(p_user_id uuid, p_item_id uuid, p_events jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.item_events (user_id, item_id, kind, payload)
  select p_user_id, p_item_id, e ->> 'kind', coalesce(e -> 'payload', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) as e;
$$;

-- Applies one page of planned changes atomically. Ops whose item changed since it was read
-- (for example, ticked meanwhile) are skipped and counted, and the worker re-runs the page.
--   {op: 'create',  item, tags, events}
--   {op: 'update',  id, expect: {status, finalized}, patch, tags?, events}
--   {op: 'replace', id, expect, old_patch, old_events, item, tags, events}   M3 and finalized moves
-- `p_seen` lists unchanged items the run saw.
create function public.svc_apply_sync_ops(
  p_calendar_id uuid, p_ops jsonb, p_seen uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_run timestamptz;
  o jsonb;
  p jsonb;
  cur record;
  v_new uuid;
  v_skipped int := 0;
  v_applied int := 0;
begin
  select c.user_id into v_user from public.calendars c where c.id = p_calendar_id;
  select s.run_started_at into v_run from private.sync_state s where s.source_id = p_calendar_id;
  if v_user is null or v_run is null then
    raise exception 'no sync run for calendar %', p_calendar_id;
  end if;

  for o in select * from jsonb_array_elements(p_ops) loop
    if o ->> 'op' = 'create' then
      v_new := private.insert_calendar_item(v_user, p_calendar_id, o -> 'item', v_run, null);
      perform private.set_hashtags(
        v_new, v_user, array(select jsonb_array_elements_text(coalesce(o -> 'tags', '[]'))));
      perform private.log_item_events(v_user, v_new, o -> 'events');
      v_applied := v_applied + 1;
      continue;
    end if;

    select i.status, i.finalized into cur from public.items i
    where i.id = (o ->> 'id')::uuid and i.calendar_id = p_calendar_id and i.google_active
    for update;
    if not found
      or cur.status is distinct from o -> 'expect' ->> 'status'
      or cur.finalized is distinct from (o -> 'expect' ->> 'finalized')::boolean then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if o ->> 'op' = 'update' then
      p := coalesce(o -> 'patch', '{}'::jsonb);
      update public.items i set
        title = case when p ? 'title' then p ->> 'title' else i.title end,
        raw_title = case when p ? 'raw_title' then p ->> 'raw_title' else i.raw_title end,
        points = case when p ? 'points' then (p ->> 'points')::smallint else i.points end,
        logical_date = case when p ? 'logical_date' then (p ->> 'logical_date')::date else i.logical_date end,
        start_at = case when p ? 'start_at' then (p ->> 'start_at')::timestamptz else i.start_at end,
        end_at = case when p ? 'end_at' then (p ->> 'end_at')::timestamptz else i.end_at end,
        is_all_day = case when p ? 'is_all_day' then (p ->> 'is_all_day')::boolean else i.is_all_day end,
        planned_minutes = case when p ? 'planned_minutes' then (p ->> 'planned_minutes')::int else i.planned_minutes end,
        status = case when p ? 'status' then p ->> 'status' else i.status end,
        recurring_event_id = case when p ? 'recurring_event_id' then p ->> 'recurring_event_id' else i.recurring_event_id end,
        google_etag = case when p ? 'google_etag' then p ->> 'google_etag' else i.google_etag end,
        google_updated_at = case when p ? 'google_updated_at' then (p ->> 'google_updated_at')::timestamptz else i.google_updated_at end,
        google_seen_at = v_run
      where i.id = (o ->> 'id')::uuid;
      if o ? 'tags' then
        perform private.set_hashtags(
          (o ->> 'id')::uuid, v_user, array(select jsonb_array_elements_text(o -> 'tags')));
      end if;
      perform private.log_item_events(v_user, (o ->> 'id')::uuid, o -> 'events');

    elsif o ->> 'op' = 'replace' then
      p := coalesce(o -> 'old_patch', '{}'::jsonb);
      update public.items i set
        status = case when p ? 'status' then p ->> 'status' else i.status end,
        miss_reason = case when p ? 'miss_reason' then p ->> 'miss_reason' else i.miss_reason end,
        finalized = case when p ? 'finalized' then (p ->> 'finalized')::boolean else i.finalized end,
        google_active = false
      where i.id = (o ->> 'id')::uuid;
      perform private.log_item_events(v_user, (o ->> 'id')::uuid, o -> 'old_events');

      v_new := private.insert_calendar_item(
        v_user, p_calendar_id, o -> 'item', v_run, (o ->> 'id')::uuid);
      -- Links chosen in the app follow the task to its new slot.
      insert into public.item_tags (item_id, tag_id, source)
      select v_new, it.tag_id, it.source from public.item_tags it
      where it.item_id = (o ->> 'id')::uuid and it.source <> 'hashtag';
      perform private.set_hashtags(
        v_new, v_user, array(select jsonb_array_elements_text(coalesce(o -> 'tags', '[]'))));
      perform private.log_item_events(v_user, v_new, o -> 'events');
    else
      raise exception 'unknown sync op %', o ->> 'op';
    end if;
    v_applied := v_applied + 1;
  end loop;

  update public.items set google_seen_at = v_run
  where calendar_id = p_calendar_id and google_active and id = any (p_seen);

  return jsonb_build_object('applied', v_applied, 'skipped', v_skipped);
end;
$$;

-- Out of time mid-run: keep the page token, release the lease, and come back for the rest.
create function public.svc_sync_checkpoint(p_source_id uuid, p_page_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.sync_state set page_token = p_page_token, lease_until = null, updated_at = now()
  where source_id = p_source_id;
  perform private.queue_sync(p_source_id, 'incremental');
end;
$$;

-- Last page done: store the new sync token and end the run.
create function public.svc_sync_finish(p_source_id uuid, p_sync_token text)
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
    sync_token = p_sync_token, page_token = null, run_kind = null, lease_until = null,
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

-- A failed run. `p_reset` (HTTP 410) drops the sync token and asks for a full sync.
-- Retries back off; after 5 attempts the job goes to dead_jobs until the next poll.
create function public.svc_sync_fail(
  p_source_id uuid, p_error text, p_retry_seconds int default null, p_reset boolean default false
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts int;
begin
  update private.sync_state set
    lease_until = null,
    attempts = case when p_reset then attempts else attempts + 1 end,
    last_error = p_error,
    sync_token = case when p_reset then null else sync_token end,
    page_token = case when p_reset then null else page_token end,
    run_kind = case when p_reset then null else run_kind end,
    updated_at = now()
  where source_id = p_source_id
  returning attempts into v_attempts;

  if p_reset then
    perform private.queue_sync(p_source_id, 'full');
  elsif p_retry_seconds is not null and v_attempts < 5 then
    update private.sync_state set queued = false where source_id = p_source_id;
    perform private.queue_sync(p_source_id, 'incremental', p_retry_seconds);
  elsif p_retry_seconds is not null then
    insert into private.dead_jobs (queue, message, error)
    values ('sync_jobs', jsonb_build_object('source_id', p_source_id), p_error);
    update private.sync_state set queued = false, run_kind = null, page_token = null, attempts = 0
    where source_id = p_source_id;
  end if;
  return v_attempts;
end;
$$;

create function public.svc_mark_reconnect_needed(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.google_accounts set status = 'reconnect_needed', updated_at = now()
  where user_id = p_user_id;
$$;

-- Queue access for the worker.
create function public.svc_queue_read(p_queue text, p_vt int, p_qty int)
returns setof pgmq.message_record
language sql
security definer
set search_path = ''
as $$
  select * from pgmq.read(p_queue, p_vt, p_qty);
$$;

create function public.svc_queue_delete(p_queue text, p_msg_id bigint)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select pgmq.delete(p_queue, p_msg_id);
$$;

create function public.svc_queue_dead(p_queue text, p_msg_id bigint, p_message jsonb, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.dead_jobs (queue, message, error) values (p_queue, p_message, p_error);
  perform pgmq.delete(p_queue, p_msg_id);
  if p_queue = 'sync_jobs' then
    update private.sync_state set queued = false, lease_until = null
    where source_id = (p_message ->> 'source_id')::uuid;
  end if;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.svc_sync_lease(uuid, int)',
    'public.svc_sync_items(uuid, text[])',
    'public.svc_sync_unseen(uuid)',
    'public.svc_apply_sync_ops(uuid, jsonb, uuid[])',
    'public.svc_sync_checkpoint(uuid, text)',
    'public.svc_sync_finish(uuid, text)',
    'public.svc_sync_fail(uuid, text, int, boolean)',
    'public.svc_mark_reconnect_needed(uuid)',
    'public.svc_queue_read(text, int, int)',
    'public.svc_queue_delete(text, bigint)',
    'public.svc_queue_dead(text, bigint, jsonb, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

-- Account switch: the old account's calendars go, but their items stay as history (Phase 1 note).
create or replace function public.svc_save_google_account(
  p_user_id uuid,
  p_google_sub text,
  p_scopes text[],
  p_access_token_enc text,
  p_access_expires_at timestamptz,
  p_email text default null,
  p_refresh_token_enc text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_was_ok boolean;
begin
  delete from public.calendars c
  using private.google_accounts g
  where g.user_id = p_user_id and g.google_sub <> p_google_sub and c.user_id = p_user_id;

  select g.status = 'ok' into v_was_ok from private.google_accounts g where g.user_id = p_user_id;

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

  -- Reconnecting after `reconnect_needed` resumes sync straight away.
  if v_was_ok is false then
    perform private.queue_sync(c.id, 'incremental')
    from public.calendars c where c.user_id = p_user_id and c.sync_enabled;
  end if;
end;
$$;

-- Dispatcher and poll fallback (8.2, 8.4, section 10) ----------------------------------------

-- Wakes the worker only when a queue has a visible message, so idle minutes cost nothing.
create function private.dispatch()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from pgmq.q_sync_jobs where vt <= clock_timestamp()) then
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

-- Calendars without a fresh sync get an incremental one. Phase 5 adds "no healthy watch channel".
create function private.queue_polls()
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
      and (c.last_sync_at is null or c.last_sync_at < now() - interval '15 minutes')
  loop
    perform private.queue_sync(v_id, 'incremental');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function private.dispatch() from public;
revoke execute on function private.queue_polls() from public;

-- Cron runs in UTC; neither job depends on local time.
select cron.schedule('mjolnir-dispatch', '10 seconds', 'select private.dispatch()');
select cron.schedule('mjolnir-queue-polls', '*/10 * * * *', 'select private.queue_polls()');
