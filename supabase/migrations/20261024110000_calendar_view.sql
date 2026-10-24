-- A Google-style calendar view (Phase 6 addition): items keep their Google colour, and the app
-- reads a range of days including 0-point blocks.

alter table public.items add column color_key text;


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
    google_etag, google_updated_at, google_seen_at, rescheduled_from_id, color_key
  ) values (
    coalesce((p_item ->> 'id')::uuid, gen_random_uuid()),
    p_user_id, 'calendar', coalesce(p_item ->> 'title', ''), p_item ->> 'raw_title',
    (p_item ->> 'points')::smallint, (p_item ->> 'logical_date')::date,
    (p_item ->> 'start_at')::timestamptz, (p_item ->> 'end_at')::timestamptz,
    coalesce((p_item ->> 'is_all_day')::boolean, false), (p_item ->> 'planned_minutes')::int,
    p_item ->> 'status', p_calendar_id, p_item ->> 'google_event_id',
    p_item ->> 'recurring_event_id', true, p_item ->> 'google_etag',
    (p_item ->> 'google_updated_at')::timestamptz, p_seen, p_from, p_item ->> 'color_key'
  )
  returning id into v_id;
  return v_id;
end;
$$;


create or replace function public.svc_apply_sync_ops(
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
        color_key = case when p ? 'color_key' then p ->> 'color_key' else i.color_key end,
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


create or replace function public.svc_sync_items(p_calendar_id uuid, p_event_ids text[])
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
    'planned_minutes', i.planned_minutes, 'google_etag', i.google_etag,
    'color_key', i.color_key)
  from public.items i
  where i.calendar_id = p_calendar_id and i.google_active and i.google_event_id = any (p_event_ids);
$$;


create or replace function public.svc_sync_unseen(p_calendar_id uuid)
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
    'planned_minutes', i.planned_minutes, 'google_etag', i.google_etag,
    'color_key', i.color_key)
  from public.items i
  join private.sync_state s on s.source_id = i.calendar_id
  where i.calendar_id = p_calendar_id and i.google_active and i.status <> 'deleted'
    and i.start_at < s.window_to and coalesce(i.end_at, i.start_at) > s.window_from
    and (i.google_seen_at is null or i.google_seen_at < s.run_started_at);
$$;


create or replace function public.svc_edit_context(p_user_id uuid, p_item_id uuid)
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
    'google_calendar_id', c.google_calendar_id, 'access_role', c.access_role,
    'color_key', i.color_key)
  from public.items i
  left join public.calendars c on c.id = i.calendar_id
  where i.id = p_item_id and i.user_id = p_user_id;
$$;


create or replace function private.item_json(i public.items)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', i.id, 'source', i.source, 'title', i.title, 'points', i.points, 'status', i.status,
    'logical_date', i.logical_date, 'start_at', i.start_at, 'end_at', i.end_at,
    'is_all_day', i.is_all_day, 'planned_minutes', i.planned_minutes,
    'actual_minutes', i.actual_minutes, 'completed_at', i.completed_at, 'finalized', i.finalized,
    'marked_late', i.marked_late, 'habit_id', i.habit_id,
    'rescheduled_from_id', i.rescheduled_from_id, 'google_event_id', i.google_event_id,
    'google_calendar_id', c.google_calendar_id,
    'color_key', i.color_key, 'calendar_color', c.color,
    -- Items take their area from the item, else from their first tag with one (section 12).
    'area_id', coalesce(i.area_id, (
      select t.area_id from public.item_tags it join public.tags t on t.id = it.tag_id
      where it.item_id = i.id and t.area_id is not null order by t.name limit 1)),
    'tags', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'source', it.source) order by t.name)
      from public.item_tags it join public.tags t on t.id = it.tag_id where it.item_id = i.id), '[]'))
  from (select 1) x
  left join public.calendars c on c.id = i.calendar_id;
$$;


-- Every item with a date in the range except deleted ones: timed blocks (0-point ones too, as in
-- Google Calendar), tasks and habits. The app lays them out by local time.
create function public.calendar_range(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if p_to < p_from or p_to - p_from > 62 then
    raise exception 'ask for at most 63 days' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(private.item_json(i) order by i.start_at nulls first, i.created_at)
    from public.items i
    where i.user_id = v_user and i.logical_date between p_from and p_to and i.status <> 'deleted'
  ), '[]');
end;
$$;

revoke execute on function public.calendar_range(date, date) from public, anon;
grant execute on function public.calendar_range(date, date) to authenticated;
