-- Phase 3: areas, habits, scoring in SQL, the Today RPCs and Realtime on items.

-- Areas and habits (sections 3.10 and 7) -----------------------------------------------------

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  color text,
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index areas_user on public.areas (user_id, sort_order);

alter table public.areas enable row level security;
revoke all on table public.areas from anon, authenticated;
grant select, insert, update, delete on table public.areas to authenticated;
create policy areas_all on public.areas for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null check (length(trim(title)) between 1 and 120),
  points smallint not null check (points between 1 and 3),
  area_id uuid references public.areas on delete set null,
  -- Bitmask of ISO weekdays: Monday = 1, Tuesday = 2, … Sunday = 64. 127 = every day.
  weekdays smallint not null default 127 check (weekdays between 1 and 127),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index habits_user on public.habits (user_id);

alter table public.habits enable row level security;
revoke all on table public.habits from anon, authenticated;
grant select, insert, update, delete on table public.habits to authenticated;
create policy habits_all on public.habits for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- An area or habit must belong to the same user as the row pointing at it.
create function private.check_area_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.area_id is not null and not exists (
    select 1 from public.areas a where a.id = new.area_id and a.user_id = new.user_id
  ) then
    raise exception 'area not found' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger habits_area_owner before insert or update of area_id on public.habits
  for each row execute function private.check_area_owner();
create trigger tags_area_owner before insert or update of area_id on public.tags
  for each row execute function private.check_area_owner();

alter table public.tags
  add constraint tags_area_fk foreign key (area_id) references public.areas on delete set null;
alter table public.items
  add constraint items_area_fk foreign key (area_id) references public.areas on delete set null,
  add constraint items_habit_fk foreign key (habit_id) references public.habits on delete set null;

-- Scoring (3.6). Mirrors packages/domain/src/scoring.ts; shared cases in tests/03. ----------

create function public.score_band(p_rate numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_rate >= 85 then 'excellent'
    when p_rate >= 75 then 'good'
    when p_rate >= 50 then 'fair'
    else 'not_good' end;
$$;

create function private.day_score(p_user_id uuid, p_date date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select
      coalesce(sum(points) filter (where status in ('pending', 'done', 'missed')), 0)::int as planned,
      coalesce(sum(points) filter (where status = 'done'), 0)::int as done,
      coalesce(sum(points) filter (where status = 'missed'), 0)::int as missed
    from public.items
    where user_id = p_user_id and logical_date = p_date
  ), r as (
    select *, case when planned > 0 then round(done * 100.0 / planned, 1) else 0 end as rate from s
  )
  select jsonb_build_object(
    'planned', planned, 'done', done, 'missed', missed, 'rate', rate,
    'band', public.score_band(rate))
  from r;
$$;

-- The logical day "now" is in, for a user (3.3): local time minus the boundary hours.
create function private.logical_today(p_user_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select ((now() at time zone p.timezone) - make_interval(hours => p.day_boundary_hour))::date
  from public.profiles p where p.id = p_user_id;
$$;

-- Habit items (3.10) --------------------------------------------------------------------------

-- One item per active habit scheduled on that weekday, created when the day is first opened.
create function private.ensure_habit_items(p_user_id uuid, p_date date)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.items (user_id, source, title, points, logical_date, status, area_id, habit_id)
  select h.user_id, 'habit', h.title, h.points, p_date, 'pending', h.area_id, h.id
  from public.habits h
  join public.profiles p on p.id = h.user_id
  where h.user_id = p_user_id and h.active and h.archived_at is null
    and (h.weekdays & (1 << (extract(isodow from p_date)::int - 1))) <> 0
    and ((h.created_at at time zone p.timezone) - make_interval(hours => p.day_boundary_hour))::date <= p_date
  on conflict (habit_id, logical_date) where source = 'habit' do nothing;
$$;

-- Editing a habit updates today's and later open items; pausing or archiving removes them.
create function private.habits_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.logical_today(new.user_id);
begin
  if not new.active or new.archived_at is not null then
    update public.items set status = 'deleted'
    where habit_id = new.id and status = 'pending' and not finalized and logical_date >= v_today;
  else
    update public.items set title = new.title, points = new.points, area_id = new.area_id
    where habit_id = new.id and status in ('pending', 'done') and not finalized
      and logical_date >= v_today;
  end if;
  return new;
end;
$$;

create trigger habits_changed after update of title, points, area_id, active, archived_at
  on public.habits for each row execute function private.habits_changed();

-- Today (9.2) -----------------------------------------------------------------------------------

create function private.item_json(i public.items)
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

create function public.day_view(p_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_today date;
  v_date date;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  v_today := private.logical_today(v_user);
  v_date := coalesce(p_date, v_today);
  if v_date = v_today then
    perform private.ensure_habit_items(v_user, v_date);
  end if;

  return jsonb_build_object(
    'date', v_date,
    'today', v_today,
    'score', private.day_score(v_user, v_date),
    -- 0-point and deleted items are not tasks and stay hidden (3.2, 3.4 D1).
    'items', coalesce((
      select jsonb_agg(private.item_json(i) order by i.start_at nulls last, i.created_at)
      from public.items i
      where i.user_id = v_user and i.logical_date = v_date and i.status not in ('deleted', 'ignored')
    ), '[]')
  );
end;
$$;

create function public.complete_item(p_id uuid, p_actual_minutes int default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  i public.items;
begin
  select * into i from public.items where id = p_id and user_id = v_user for update;
  if not found then
    raise exception 'item not found' using errcode = 'P0002';
  end if;
  if i.finalized or i.status not in ('pending', 'done') then
    raise exception 'this item can no longer be ticked' using errcode = '22023';
  end if;
  if p_actual_minutes is not null and p_actual_minutes < 0 then
    raise exception 'actual minutes must be 0 or more' using errcode = '22023';
  end if;

  update public.items set
    status = 'done',
    completed_at = case when status = 'done' then completed_at else now() end,
    actual_minutes = coalesce(p_actual_minutes, actual_minutes, planned_minutes)
  where id = p_id
  returning * into i;

  insert into public.item_events (user_id, item_id, kind, payload)
  values (v_user, p_id, 'completed', jsonb_build_object('actual_minutes', i.actual_minutes));
  return private.item_json(i);
end;
$$;

create function public.uncomplete_item(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  i public.items;
begin
  select * into i from public.items where id = p_id and user_id = v_user for update;
  if not found then
    raise exception 'item not found' using errcode = 'P0002';
  end if;
  if i.finalized or i.status <> 'done' then
    raise exception 'this item can no longer be unticked' using errcode = '22023';
  end if;

  update public.items set status = 'pending', completed_at = null, actual_minutes = null
  where id = p_id
  returning * into i;

  insert into public.item_events (user_id, item_id, kind) values (v_user, p_id, 'uncompleted');
  return private.item_json(i);
end;
$$;

-- Manual tasks and backlog (3.1) ------------------------------------------------------------

create function private.require_own_area(p_user uuid, p_area uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_area is not null and not exists (
    select 1 from public.areas where id = p_area and user_id = p_user
  ) then
    raise exception 'area not found' using errcode = '23503';
  end if;
end;
$$;

-- Tags come from the title's #tags, parsed in the app with packages/domain.
create function public.create_manual_task(
  p_title text,
  p_points int,
  p_date date default null,
  p_area_id uuid default null,
  p_tags text[] default '{}',
  p_planned_minutes int default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  i public.items;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_points not between 1 and 3 then
    raise exception 'points must be 1 to 3' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'a task needs a title' using errcode = '22023';
  end if;
  perform private.require_own_area(v_user, p_area_id);

  insert into public.items (user_id, source, title, raw_title, points, logical_date, status,
    area_id, planned_minutes)
  values (v_user, 'manual', trim(p_title), trim(p_title), p_points, p_date, 'pending', p_area_id,
    p_planned_minutes)
  returning * into i;

  perform private.set_hashtags(i.id, v_user, coalesce(p_tags, '{}'));
  insert into public.item_events (user_id, item_id, kind) values (v_user, i.id, 'created');
  return private.item_json(i);
end;
$$;

-- Local edits that do not touch Google. Allowed keys depend on the item's source:
--   all:            area_id, actual_minutes (done items)
--   manual, habit:  points
--   manual:         title + tags, logical_date (null = backlog), planned_minutes
create function public.update_item_local(p_id uuid, p_patch jsonb)
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
    if k = 'points' and i.source not in ('manual', 'habit') then
      raise exception 'calendar points come from the event colour' using errcode = '22023';
    elsif k in ('title', 'tags', 'logical_date', 'planned_minutes') and i.source <> 'manual' then
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

create function public.delete_manual_task(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  update public.items set status = 'deleted'
  where id = p_id and user_id = v_user and source = 'manual' and not finalized;
  if not found then
    raise exception 'only open manual tasks can be deleted here' using errcode = '22023';
  end if;
  insert into public.item_events (user_id, item_id, kind) values (v_user, p_id, 'deleted');
end;
$$;

create function public.backlog()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.item_json(i) order by i.created_at desc), '[]')
  from public.items i
  where i.user_id = (select auth.uid()) and i.source = 'manual' and i.logical_date is null
    and i.status = 'pending';
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.day_view(date)',
    'public.complete_item(uuid, int)',
    'public.uncomplete_item(uuid)',
    'public.create_manual_task(text, int, date, uuid, text[], int)',
    'public.update_item_local(uuid, jsonb)',
    'public.delete_manual_task(uuid)',
    'public.backlog()'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;

-- Realtime (8.8): ticks on one device reach the others. RLS still filters rows per user.
alter publication supabase_realtime add table public.items;
