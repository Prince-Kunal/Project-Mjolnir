-- Phase 6: writes to Google. User-facing writes run in app-api; the "✓ " write-back goes through
-- the google_writes queue. Only user actions queue writes; a sync never does, so there are no loops.

select pgmq.create('google_writes');

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
     and not exists (select 1 from pgmq.q_jobs where vt <= clock_timestamp())
     and not exists (select 1 from pgmq.q_google_writes where vt <= clock_timestamp()) then
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

-- "✓ " write-back (3.11): ticking or unticking a calendar item queues a title update.
create function private.items_checkmark()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source = 'calendar' and new.google_active and new.google_event_id is not null
     and (old.status = 'done') is distinct from (new.status = 'done')
     and new.status in ('done', 'pending')
     and exists (select 1 from public.profiles where id = new.user_id and writeback_checkmark) then
    perform pgmq.send('google_writes', jsonb_build_object('kind', 'checkmark', 'item_id', new.id));
  end if;
  return new;
end;
$$;

create trigger items_checkmark after update of status on public.items
  for each row execute function private.items_checkmark();

create function public.svc_write_context(p_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'item_id', i.id, 'user_id', i.user_id, 'status', i.status, 'raw_title', i.raw_title,
    'google_event_id', i.google_event_id, 'google_active', i.google_active,
    'google_etag', i.google_etag, 'google_calendar_id', c.google_calendar_id,
    'writeback', p.writeback_checkmark)
  from public.items i
  join public.calendars c on c.id = i.calendar_id
  join public.profiles p on p.id = i.user_id
  where i.id = p_item_id;
$$;

-- After a write: store Google's etag (so the sync skips the echo) and the title as written.
create function public.svc_write_done(p_item_id uuid, p_etag text, p_raw_title text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.items set google_etag = p_etag, raw_title = coalesce(p_raw_title, raw_title),
    google_seen_at = now()
  where id = p_item_id;
$$;

-- Context for app-api writes: settings, colour rules and the calendar new events go to.
create function public.svc_app_context(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'timezone', p.timezone,
    'day_boundary_hour', p.day_boundary_hour,
    'include_all_day', p.include_all_day,
    'writeback_checkmark', p.writeback_checkmark,
    'color_rules', coalesce((
      select jsonb_agg(jsonb_build_object('colorKey', r.color_key, 'points', r.points,
        'primaryForPoints', r.primary_for_points))
      from public.color_rules r where r.user_id = p.id), '[]'),
    'calendar', (
      select jsonb_build_object('id', c.id, 'google_calendar_id', c.google_calendar_id)
      from public.calendars c
      where c.user_id = p.id and c.sync_enabled and c.access_role in ('owner', 'writer')
      order by c.is_primary desc, c.created_at
      limit 1))
  from public.profiles p where p.id = p_user_id;
$$;

-- The item app-api is about to change, in the planner's snapshot shape, with its Google ids.
create function public.svc_edit_context(p_user_id uuid, p_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', i.id, 'source', i.source, 'google_event_id', i.google_event_id, 'status', i.status,
    'finalized', i.finalized, 'logical_date', i.logical_date, 'start_at', i.start_at,
    'end_at', i.end_at, 'points', i.points, 'raw_title', i.raw_title,
    'planned_minutes', i.planned_minutes, 'google_etag', i.google_etag,
    'google_active', i.google_active, 'calendar_id', i.calendar_id,
    'google_calendar_id', c.google_calendar_id, 'access_role', c.access_role)
  from public.items i
  left join public.calendars c on c.id = i.calendar_id
  where i.id = p_item_id and i.user_id = p_user_id;
$$;

-- Items created by app-api carry an id chosen in advance, so it can go into the event's
-- private properties (pt_item) before the item exists.
create or replace function private.insert_calendar_item(
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
    id, user_id, source, title, raw_title, points, logical_date, start_at, end_at, is_all_day,
    planned_minutes, status, calendar_id, google_event_id, recurring_event_id, google_active,
    google_etag, google_updated_at, google_seen_at, rescheduled_from_id
  ) values (
    coalesce((p_item ->> 'id')::uuid, gen_random_uuid()),
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

-- app-api applies planner ops the same way a sync does. A calendar that has never synced has no
-- run yet, so one is started for it.
create function public.svc_apply_app_ops(p_calendar_id uuid, p_ops jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.sync_state (source_id, run_started_at) values (p_calendar_id, now())
  on conflict (source_id) do update
    set run_started_at = coalesce(private.sync_state.run_started_at, now());
  return public.svc_apply_sync_ops(p_calendar_id, p_ops, '{}');
end;
$$;

-- Schedule a manual task (section 5): it becomes a calendar item in place, keeping its id and
-- links, mapped to an event id chosen here. Step 1 of 3, like rescheduling.
create function public.svc_schedule_prepare(
  p_user_id uuid, p_item_id uuid, p_start timestamptz, p_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.items;
  p public.profiles;
  v_cal public.calendars;
  v_event text := replace(gen_random_uuid()::text, '-', '');
begin
  select * into i from public.items where id = p_item_id and user_id = p_user_id for update;
  if not found or i.source <> 'manual' then
    raise exception 'task not found' using errcode = 'P0002';
  end if;
  if i.finalized or i.status <> 'pending' then
    raise exception 'only open tasks can be scheduled' using errcode = '22023';
  end if;
  if p_end <= p_start then
    raise exception 'the slot must end after it starts' using errcode = '22023';
  end if;
  select * into p from public.profiles where id = p_user_id;
  select * into v_cal from public.calendars c
  where c.user_id = p_user_id and c.sync_enabled and c.access_role in ('owner', 'writer')
  order by c.is_primary desc, c.created_at limit 1;
  if v_cal.id is null then
    raise exception 'no synced calendar Mjolnir can write to' using errcode = '22023';
  end if;

  update public.items set
    source = 'calendar', calendar_id = v_cal.id, google_event_id = v_event, google_active = true,
    start_at = p_start, end_at = p_end,
    planned_minutes = (extract(epoch from p_end - p_start) / 60)::int,
    logical_date = ((p_start at time zone p.timezone) - make_interval(hours => p.day_boundary_hour))::date,
    google_seen_at = now()
  where id = p_item_id;
  insert into public.item_events (user_id, item_id, kind, payload)
  values (p_user_id, p_item_id, 'scheduled', jsonb_build_object('start', p_start, 'previous_date', i.logical_date));

  return jsonb_build_object(
    'item_id', i.id,
    'google_event_id', v_event,
    'google_calendar_id', v_cal.google_calendar_id,
    'summary', coalesce(nullif(i.raw_title, ''), i.title),
    'points', i.points,
    'time_zone', p.timezone,
    'previous_date', i.logical_date,
    'previous_minutes', i.planned_minutes,
    'tags', coalesce((select jsonb_agg(t.name order by t.name) from public.item_tags it
                      join public.tags t on t.id = it.tag_id where it.item_id = i.id), '[]'),
    'color_rules', (select jsonb_agg(jsonb_build_object('colorKey', r.color_key, 'points', r.points,
                      'primaryForPoints', r.primary_for_points))
                    from public.color_rules r where r.user_id = p_user_id));
end;
$$;

-- Step 3 on failure: the task goes back to being a manual task as it was.
create function public.svc_schedule_abort(p_item_id uuid, p_date date, p_minutes int)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.items set
    source = 'manual', calendar_id = null, google_event_id = null, google_active = false,
    start_at = null, end_at = null, logical_date = p_date, planned_minutes = p_minutes
  where id = p_item_id;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.svc_write_context(uuid)',
    'public.svc_write_done(uuid, text, text)',
    'public.svc_app_context(uuid)',
    'public.svc_edit_context(uuid, uuid)',
    'public.svc_apply_app_ops(uuid, jsonb)',
    'public.svc_schedule_prepare(uuid, uuid, timestamptz, timestamptz)',
    'public.svc_schedule_abort(uuid, date, int)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
