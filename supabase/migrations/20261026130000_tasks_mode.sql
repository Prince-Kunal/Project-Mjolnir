-- Phase 8: Google Tasks mode (3.13, 8.9). Tasks are polled, planned in TypeScript
-- (_shared/sync/tasks.ts) and applied here; completion is written back through google_writes.

-- When the current mode began. Switching keeps all history: the old source stops syncing and the
-- new one creates items only from the switch date. -infinity: never switched.
alter table public.profiles add column google_item_type_since timestamptz not null default '-infinity';

create function private.profiles_item_type_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if new.google_item_type is distinct from old.google_item_type then
    new.google_item_type_since := now();
    if new.google_item_type = 'tasks' then
      for v_id in select id from public.task_lists where user_id = new.id and sync_enabled loop
        perform private.queue_sync(v_id, 'full');
      end loop;
    else
      for v_id in select id from public.calendars where user_id = new.id and sync_enabled loop
        perform private.queue_sync(v_id, 'incremental');
      end loop;
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_item_type_changed before update of google_item_type on public.profiles
  for each row execute function private.profiles_item_type_changed();

-- Enabling a list queues a full sync; disabling just stops future runs (as for calendars).
create function private.task_lists_sync_enabled()
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

create trigger task_lists_sync_enabled after insert or update of sync_enabled on public.task_lists
  for each row execute function private.task_lists_sync_enabled();

create function public.svc_upsert_task_lists(p_user_id uuid, p_lists jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.task_lists (user_id, google_tasklist_id, title)
  select p_user_id, l ->> 'id', l ->> 'title'
  from jsonb_array_elements(p_lists) as l
  on conflict (user_id, google_tasklist_id) do update set title = excluded.title;
$$;

-- sync_jobs carry only a source id: a calendar or a task list.
create function public.svc_source_kind(p_source_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.calendars where id = p_source_id) then 'calendar'
    when exists (select 1 from public.task_lists where id = p_source_id) then 'task_list' end;
$$;

-- Takes a task list for one run, like svc_sync_lease. sync_token holds the `updatedMin` for the
-- next poll: the start of the last finished run.
create function public.svc_task_lease(p_list_id uuid, p_lease_seconds int default 120)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s private.sync_state;
  l public.task_lists;
  p public.profiles;
  v_kind text;
begin
  select * into s from private.sync_state where source_id = p_list_id for update;
  if not found or (s.lease_until is not null and s.lease_until > now()) then
    return null;
  end if;
  select * into l from public.task_lists where id = p_list_id;
  select * into p from public.profiles where id = l.user_id;
  if l.id is null or not l.sync_enabled or p.google_item_type <> 'tasks' or not exists (
    select 1 from private.google_accounts g where g.user_id = l.user_id and g.status = 'ok'
  ) then
    update private.sync_state set queued = false, pending_kind = null, updated_at = now()
    where source_id = p_list_id;
    return null;
  end if;

  if s.run_kind is not null and not (s.pending_kind = 'full' and s.run_kind <> 'full') then
    v_kind := s.run_kind;
  else
    v_kind := case when s.sync_token is null or s.pending_kind = 'full' then 'full' else 'incremental' end;
    s.page_token := null;
    s.run_started_at := now();
    s.pending_kind := null;
  end if;

  update private.sync_state set
    run_kind = v_kind, run_started_at = s.run_started_at, page_token = s.page_token,
    pending_kind = s.pending_kind, queued = false,
    lease_until = now() + make_interval(secs => p_lease_seconds), updated_at = now()
  where source_id = p_list_id;

  return jsonb_build_object(
    'source_id', l.id,
    'user_id', l.user_id,
    'google_tasklist_id', l.google_tasklist_id,
    'run_kind', v_kind,
    'run_started_at', s.run_started_at,
    'updated_min', case when v_kind = 'incremental' then s.sync_token end,
    'page_token', s.page_token,
    'attempts', s.attempts,
    'points', l.points,
    'since', case when p.google_item_type_since > '-infinity'
      then ((p.google_item_type_since at time zone p.timezone)
        - make_interval(hours => p.day_boundary_hour))::date end,
    'profile', jsonb_build_object('timezone', p.timezone, 'day_boundary_hour', p.day_boundary_hour));
end;
$$;

create function public.svc_task_items(p_list_id uuid, p_task_ids text[])
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', i.id, 'google_task_id', i.google_task_id, 'status', i.status, 'finalized', i.finalized,
    'logical_date', i.logical_date, 'start_at', i.start_at, 'points', i.points,
    'raw_title', i.raw_title, 'google_etag', i.google_etag)
  from public.items i
  where i.task_list_id = p_list_id and i.google_active and i.google_task_id = any (p_task_ids);
$$;

create function private.insert_task_item(p_user_id uuid, p_list_id uuid, p_item jsonb, p_from uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.items (
    id, user_id, source, title, raw_title, points, logical_date, start_at, status, completed_at,
    task_list_id, google_task_id, google_active, google_etag, google_updated_at, google_seen_at,
    rescheduled_from_id
  ) values (
    coalesce((p_item ->> 'id')::uuid, gen_random_uuid()), p_user_id, 'gtask',
    coalesce(p_item ->> 'title', ''), p_item ->> 'raw_title', (p_item ->> 'points')::smallint,
    (p_item ->> 'logical_date')::date, (p_item ->> 'start_at')::timestamptz, p_item ->> 'status',
    (p_item ->> 'completed_at')::timestamptz, p_list_id, p_item ->> 'google_task_id', true,
    p_item ->> 'google_etag', (p_item ->> 'google_updated_at')::timestamptz, now(), p_from
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Applies planned task ops (create, update, replace) with the same status and finalized guards as
-- svc_apply_sync_ops. Status changes made here are Google's own, so they are not written back.
create function public.svc_apply_task_ops(p_list_id uuid, p_ops jsonb, p_seen uuid[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  o jsonb;
  p jsonb;
  cur record;
  v_new uuid;
  v_skipped int := 0;
  v_applied int := 0;
begin
  select l.user_id into v_user from public.task_lists l where l.id = p_list_id;
  if v_user is null then
    raise exception 'no task list %', p_list_id;
  end if;
  perform set_config('mjolnir.from_google', 'on', true);

  for o in select * from jsonb_array_elements(p_ops) loop
    if o ->> 'op' = 'create' then
      v_new := private.insert_task_item(v_user, p_list_id, o -> 'item', null);
      perform private.set_hashtags(
        v_new, v_user, array(select jsonb_array_elements_text(coalesce(o -> 'tags', '[]'))));
      perform private.log_item_events(v_user, v_new, o -> 'events');
      v_applied := v_applied + 1;
      continue;
    end if;

    select i.status, i.finalized into cur from public.items i
    where i.id = (o ->> 'id')::uuid and i.task_list_id = p_list_id and i.google_active
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
        logical_date = case when p ? 'logical_date' then (p ->> 'logical_date')::date else i.logical_date end,
        start_at = case when p ? 'start_at' then (p ->> 'start_at')::timestamptz else i.start_at end,
        status = case when p ? 'status' then p ->> 'status' else i.status end,
        completed_at = case when p ? 'completed_at' then (p ->> 'completed_at')::timestamptz else i.completed_at end,
        google_etag = case when p ? 'google_etag' then p ->> 'google_etag' else i.google_etag end,
        google_updated_at = case when p ? 'google_updated_at' then (p ->> 'google_updated_at')::timestamptz else i.google_updated_at end,
        google_seen_at = now()
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

      -- The new item keeps the old one's points (set in the app) and its links.
      v_new := private.insert_task_item(v_user, p_list_id,
        (o -> 'item') || jsonb_build_object('points', (select points from public.items where id = (o ->> 'id')::uuid)),
        (o ->> 'id')::uuid);
      update public.items n set planned_minutes = x.planned_minutes, area_id = x.area_id
      from public.items x where n.id = v_new and x.id = (o ->> 'id')::uuid;
      insert into public.item_tags (item_id, tag_id, source)
      select v_new, it.tag_id, it.source from public.item_tags it
      where it.item_id = (o ->> 'id')::uuid and it.source <> 'hashtag';
      perform private.set_hashtags(
        v_new, v_user, array(select jsonb_array_elements_text(coalesce(o -> 'tags', '[]'))));
      perform private.log_item_events(v_user, v_new, o -> 'events');
    else
      raise exception 'unknown task op %', o ->> 'op';
    end if;
    v_applied := v_applied + 1;
  end loop;

  update public.items set google_seen_at = now()
  where task_list_id = p_list_id and google_active and id = any (p_seen);
  perform set_config('mjolnir.from_google', 'off', true);
  return jsonb_build_object('applied', v_applied, 'skipped', v_skipped);
end;
$$;

-- Run finished: the next poll asks for tasks updated since this run began (a minute's overlap
-- covers clock skew; echoes are skipped by etag).
create function public.svc_task_finish(p_list_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s private.sync_state;
begin
  select * into s from private.sync_state where source_id = p_list_id for update;
  update private.sync_state set
    sync_token = to_char((s.run_started_at - interval '1 minute') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    page_token = null, run_kind = null, lease_until = null, attempts = 0, last_error = null,
    updated_at = now()
  where source_id = p_list_id;
  update public.task_lists set last_sync_at = now() where id = p_list_id;
  if s.queued or s.pending_kind is not null then
    update private.sync_state set queued = false where source_id = p_list_id;
    perform private.queue_sync(p_list_id, coalesce(s.pending_kind, 'incremental'));
  end if;
end;
$$;

-- Ticking a Google task in the app completes it in Google, and unticking reopens it (3.13).
-- Changes the sync itself makes (Google's own completion) are not written back.
create function private.items_task_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source = 'gtask' and new.google_active and new.google_task_id is not null
     and (old.status = 'done') is distinct from (new.status = 'done')
     and new.status in ('done', 'pending')
     and coalesce(current_setting('mjolnir.from_google', true), '') <> 'on' then
    perform pgmq.send('google_writes', jsonb_build_object('kind', 'task_status', 'item_id', new.id));
  end if;
  return new;
end;
$$;

create trigger items_task_status after update of status on public.items
  for each row execute function private.items_task_status();

create function public.svc_task_write_context(p_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'item_id', i.id, 'user_id', i.user_id, 'status', i.status, 'google_active', i.google_active,
    'google_task_id', i.google_task_id, 'google_tasklist_id', l.google_tasklist_id)
  from public.items i join public.task_lists l on l.id = i.task_list_id
  where i.id = p_item_id;
$$;

-- Context for app-api's task writes: settings, and the list new tasks go to (the first enabled).
create function public.svc_task_app_context(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'timezone', p.timezone,
    'day_boundary_hour', p.day_boundary_hour,
    'google_item_type', p.google_item_type,
    'list', (
      select jsonb_build_object('id', l.id, 'google_tasklist_id', l.google_tasklist_id, 'points', l.points)
      from public.task_lists l where l.user_id = p.id and l.sync_enabled
      order by l.created_at limit 1))
  from public.profiles p where p.id = p_user_id;
$$;

-- The item app-api is about to change, in the task planner's snapshot shape.
create function public.svc_task_edit_context(p_user_id uuid, p_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', i.id, 'source', i.source, 'google_task_id', i.google_task_id, 'status', i.status,
    'finalized', i.finalized, 'logical_date', i.logical_date, 'start_at', i.start_at,
    'points', i.points, 'raw_title', i.raw_title, 'google_etag', i.google_etag,
    'google_active', i.google_active, 'task_list_id', i.task_list_id,
    'google_tasklist_id', l.google_tasklist_id)
  from public.items i left join public.task_lists l on l.id = i.task_list_id
  where i.id = p_item_id and i.user_id = p_user_id;
$$;

-- Calendars stop syncing in Tasks mode, and create items only from the switch back.
create or replace function public.svc_sync_lease(p_source_id uuid, p_lease_seconds int default 120)
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
  select * into p from public.profiles where id = c.user_id;
  -- In Tasks mode the calendars stop syncing (3.13).
  if c.id is null or not c.sync_enabled or not v_ok or p.google_item_type = 'tasks' then
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
    -- New items only from the day Events mode (re)started (3.13).
    'create_from', case when p.google_item_type_since > '-infinity'
      then ((p.google_item_type_since at time zone p.timezone)
        - make_interval(hours => p.day_boundary_hour))::date end,
    'attempts', s.attempts,
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

-- Polls cover the sources of each user's current mode.
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
    join public.profiles p on p.id = c.user_id and p.google_item_type = 'events'
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
  -- Google Tasks has no push channels: enabled lists are polled (8.9).
  for v_id in
    select l.id from public.task_lists l
    join private.google_accounts g on g.user_id = l.user_id and g.status = 'ok'
    join public.profiles p on p.id = l.user_id and p.google_item_type = 'tasks'
    where l.sync_enabled and (l.last_sync_at is null or l.last_sync_at < now() - interval '9 minutes')
  loop
    perform private.queue_sync(v_id, 'incremental');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.request_sync()
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
    join public.profiles p on p.id = c.user_id and p.google_item_type = 'events'
    where c.user_id = (select auth.uid()) and c.sync_enabled
    union all
    select l.id from public.task_lists l
    join private.google_accounts g on g.user_id = l.user_id and g.status = 'ok'
    join public.profiles p on p.id = l.user_id and p.google_item_type = 'tasks'
    where l.user_id = (select auth.uid()) and l.sync_enabled
  loop
    perform private.queue_sync(v_id, 'incremental');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Google tasks take points and an estimate set in the app (3.13).
create or replace function public.update_item_local(p_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  i public.items;
  k text;
begin
  select * into i from public.items where id = p_id and user_id = v_user for update;
  if not found then
    raise exception 'item not found' using errcode = 'P0002';
  end if;
  if i.finalized then
    raise exception 'this item is closed' using errcode = '22023';
  end if;

  for k in select jsonb_object_keys(p_patch) loop
    if k = 'points' and i.source not in ('manual', 'habit', 'gtask') then
      raise exception 'calendar points come from the event colour' using errcode = '22023';
    elsif k = 'planned_minutes' and i.source not in ('manual', 'gtask') then
      raise exception 'planned time comes from the event' using errcode = '22023';
    elsif k in ('title', 'tags', 'logical_date') and i.source <> 'manual' then
      raise exception '% can only be changed on manual tasks', k using errcode = '22023';
    elsif k = 'actual_minutes' and i.status <> 'done' then
      raise exception 'actual minutes are set when a task is done' using errcode = '22023';
    elsif k not in ('points', 'title', 'tags', 'logical_date', 'planned_minutes', 'area_id', 'actual_minutes') then
      raise exception 'unknown field %', k using errcode = '22023';
    end if;
  end loop;

  if p_patch ? 'points' and (p_patch ->> 'points')::int not between 1 and 3 then
    raise exception 'points must be 1 to 3' using errcode = '22023';
  end if;
  if p_patch ? 'area_id' then
    perform private.require_own_area(v_user, (p_patch ->> 'area_id')::uuid);
  end if;

  update public.items set
    points = coalesce((p_patch ->> 'points')::smallint, points),
    title = coalesce(trim(p_patch ->> 'title'), title),
    raw_title = coalesce(trim(p_patch ->> 'title'), raw_title),
    logical_date = case when p_patch ? 'logical_date' then (p_patch ->> 'logical_date')::date else logical_date end,
    planned_minutes = case when p_patch ? 'planned_minutes' then (p_patch ->> 'planned_minutes')::int else planned_minutes end,
    area_id = case when p_patch ? 'area_id' then (p_patch ->> 'area_id')::uuid else area_id end,
    actual_minutes = case when p_patch ? 'actual_minutes' then (p_patch ->> 'actual_minutes')::int else actual_minutes end
  where id = p_id
  returning * into i;

  if p_patch ? 'tags' then
    perform private.set_hashtags(p_id, v_user, array(select jsonb_array_elements_text(p_patch -> 'tags')));
  end if;
  insert into public.item_events (user_id, item_id, kind, payload)
  values (v_user, p_id, case when p_patch ? 'logical_date' then 'moved' else 'updated' end, p_patch);
  return private.item_json(i);
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.svc_upsert_task_lists(uuid, jsonb)',
    'public.svc_source_kind(uuid)',
    'public.svc_task_lease(uuid, int)',
    'public.svc_task_items(uuid, text[])',
    'public.svc_apply_task_ops(uuid, jsonb, uuid[])',
    'public.svc_task_finish(uuid)',
    'public.svc_task_write_context(uuid)',
    'public.svc_task_app_context(uuid)',
    'public.svc_task_edit_context(uuid, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
