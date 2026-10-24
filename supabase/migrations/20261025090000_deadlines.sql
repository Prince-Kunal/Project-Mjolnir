-- Phase 7: deadlines, links from the app (stored here and in the event's private properties),
-- and tag suggestions for the Unassigned tray (3.8, 3.9).

-- Deadlines (3.9) -----------------------------------------------------------------------------

create table public.deadlines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  area_id uuid references public.areas on delete set null,
  -- Filled with the creation day by a trigger when left out.
  start_date date not null,
  due_date date not null,
  target_sessions int check (target_sessions > 0),
  target_minutes int check (target_minutes > 0),
  progress_pct smallint not null default 0 check (progress_pct between 0 and 100),
  status text not null default 'on_track'
    check (status in ('on_track', 'needs_attention', 'urgent', 'done', 'dropped')),
  notes text not null default '',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date >= start_date)
);
create index deadlines_user on public.deadlines (user_id, due_date);

create function private.deadlines_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.start_date is null then
    new.start_date := least(private.logical_today(new.user_id), new.due_date);
  end if;
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status <> 'done' then
      new.completed_at := coalesce(new.completed_at, now());
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger deadlines_defaults before insert or update on public.deadlines
  for each row execute function private.deadlines_defaults();
create trigger deadlines_touch before update on public.deadlines
  for each row execute function private.touch_updated_at();
create trigger deadlines_area_owner before insert or update of area_id on public.deadlines
  for each row execute function private.check_area_owner();

alter table public.deadlines enable row level security;
revoke all on table public.deadlines from anon, authenticated;
grant select, insert, update, delete on table public.deadlines to authenticated;
create policy deadlines_all on public.deadlines for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table public.deadline_tags (
  deadline_id uuid not null references public.deadlines on delete cascade,
  tag_id uuid not null references public.tags on delete cascade,
  primary key (deadline_id, tag_id)
);
create index deadline_tags_tag on public.deadline_tags (tag_id);

alter table public.deadline_tags enable row level security;
revoke all on table public.deadline_tags from anon, authenticated;
grant select, insert, delete on table public.deadline_tags to authenticated;
create policy deadline_tags_all on public.deadline_tags for all to authenticated
  using (exists (
    select 1 from public.deadlines d where d.id = deadline_id and d.user_id = (select auth.uid())
  ))
  with check (
    exists (select 1 from public.deadlines d where d.id = deadline_id and d.user_id = (select auth.uid()))
    and exists (select 1 from public.tags t where t.id = tag_id and t.user_id = (select auth.uid()))
  );

-- Direct links from the app's dropdown. Read-only to the app: set_item_links writes them.
create table public.item_deadlines (
  item_id uuid not null references public.items on delete cascade,
  deadline_id uuid not null references public.deadlines on delete cascade,
  primary key (item_id, deadline_id)
);
create index item_deadlines_deadline on public.item_deadlines (deadline_id);

alter table public.item_deadlines enable row level security;
revoke all on table public.item_deadlines from anon, authenticated;
grant select on table public.item_deadlines to authenticated;
create policy item_deadlines_select on public.item_deadlines for select to authenticated
  using (exists (
    select 1 from public.items i where i.id = item_id and i.user_id = (select auth.uid())
  ));

-- A rescheduled copy (3.5, M3) keeps its deadline links, as it keeps its tags.
create function private.items_copy_deadlines()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.item_deadlines (item_id, deadline_id)
  select new.id, x.deadline_id from public.item_deadlines x where x.item_id = new.rescheduled_from_id
  on conflict do nothing;
  return null;
end;
$$;

create trigger items_copy_deadlines after insert on public.items
  for each row when (new.rescheduled_from_id is not null)
  execute function private.items_copy_deadlines();

-- Suggestions (3.8) ---------------------------------------------------------------------------

create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  item_id uuid not null references public.items on delete cascade,
  tag_id uuid not null references public.tags on delete cascade,
  state text not null default 'open' check (state in ('open', 'accepted', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (item_id, tag_id)
);
create index suggestions_open on public.suggestions (user_id) where state = 'open';

alter table public.suggestions enable row level security;
revoke all on table public.suggestions from anon, authenticated;
grant select on table public.suggestions to authenticated;
create policy suggestions_select on public.suggestions for select to authenticated
  using (user_id = (select auth.uid()));

-- Mirrors packages/domain/src/suggestions.ts; shared cases in tests/10. A word is a run of letters,
-- digits, `_` and `-`, so "lfx-2" and "flfx" do not name "lfx".
create function private.title_has_tag(p_title text, p_tag text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_tag, '') <> ''
    and lower(coalesce(p_title, '')) ~ ('(^|[^[:alnum:]_-])' || lower(p_tag) || '($|[^[:alnum:]_-])');
$$;

-- Re-checks one item: an untagged task whose title names a tag gets an open suggestion; a tagged
-- one, or one whose title stopped naming the tag, loses its open ones. Dismissals stay.
create function private.refresh_suggestions(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.items;
begin
  select * into i from public.items where id = p_item_id;
  if not found then
    return;
  end if;
  if i.source not in ('calendar', 'manual') or i.status in ('deleted', 'ignored')
     or exists (select 1 from public.item_tags it where it.item_id = i.id) then
    delete from public.suggestions where item_id = i.id and state = 'open';
    return;
  end if;
  delete from public.suggestions s
  where s.item_id = i.id and s.state = 'open'
    and not exists (
      select 1 from public.tags t where t.id = s.tag_id and private.title_has_tag(i.title, t.name)
    );
  insert into public.suggestions (user_id, item_id, tag_id)
  select i.user_id, i.id, t.id from public.tags t
  where t.user_id = i.user_id and private.title_has_tag(i.title, t.name)
  on conflict (item_id, tag_id) do nothing;
end;
$$;

-- Every place that sets a title calls set_hashtags, so it re-checks suggestions too.
create or replace function private.set_hashtags(p_item_id uuid, p_user_id uuid, p_tags text[])
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

  perform private.refresh_suggestions(p_item_id);
end;
$$;

-- A new tag is suggested for recent untagged items that already name it.
create function private.tags_suggest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.suggestions (user_id, item_id, tag_id)
  select i.user_id, i.id, new.id from public.items i
  where i.user_id = new.user_id and i.source in ('calendar', 'manual')
    and i.status in ('pending', 'done', 'missed')
    and (i.logical_date is null or i.logical_date >= private.logical_today(new.user_id) - 30)
    and not exists (select 1 from public.item_tags it where it.item_id = i.id)
    and private.title_has_tag(i.title, new.name)
  on conflict (item_id, tag_id) do nothing;
  return null;
end;
$$;

create trigger tags_suggest after insert on public.tags
  for each row execute function private.tags_suggest();

-- Links in Google (section 7, pt_tags and pt_deadlines) ------------------------------------------

-- A new item for an event the app linked before (moved to another synced calendar, say) takes
-- its links back from the event. Only the user's own existing tags and deadlines are used.
create function private.restore_links(p_item_id uuid, p_user_id uuid, p_links jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.item_tags (item_id, tag_id, source)
  select p_item_id, t.id, 'explicit' from public.tags t
  where t.user_id = p_user_id
    and t.name = any (array(select jsonb_array_elements_text(coalesce(p_links -> 'tags', '[]'))))
  on conflict (item_id, tag_id) do nothing;
  insert into public.item_deadlines (item_id, deadline_id)
  select p_item_id, d.id from public.deadlines d
  where d.user_id = p_user_id
    and d.id::text = any (array(select jsonb_array_elements_text(coalesce(p_links -> 'deadlines', '[]'))))
  on conflict do nothing;
  perform private.refresh_suggestions(p_item_id);
end;
$$;

-- After a link change: rewrite the event's private properties (a google_writes job).
create function private.queue_links_write(i public.items)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if i.source = 'calendar' and i.google_active and i.google_event_id is not null
     and i.status <> 'deleted' then
    perform pgmq.send('google_writes', jsonb_build_object('kind', 'links', 'item_id', i.id));
  end if;
end;
$$;

create function public.svc_item_links(p_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'tags', coalesce((select jsonb_agg(t.name order by t.name) from public.item_tags it
                      join public.tags t on t.id = it.tag_id where it.item_id = p_item_id), '[]'),
    'deadlines', coalesce((select jsonb_agg(x.deadline_id order by x.deadline_id)
                           from public.item_deadlines x where x.item_id = p_item_id), '[]'));
$$;

create or replace function public.svc_write_context(p_item_id uuid)
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
    || public.svc_item_links(i.id)
  from public.items i
  join public.calendars c on c.id = i.calendar_id
  join public.profiles p on p.id = i.user_id
  where i.id = p_item_id;
$$;

-- Sync creates restore links from the event's private properties (op.links).
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
      if o ? 'links' then
        perform private.restore_links(v_new, v_user, o -> 'links');
      end if;
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
      from public.item_tags it join public.tags t on t.id = it.tag_id where it.item_id = i.id), '[]'),
    'deadlines', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title) order by d.due_date, d.title)
      from public.item_deadlines x join public.deadlines d on d.id = x.deadline_id
      where x.item_id = i.id), '[]'))
  from (select 1) x
  left join public.calendars c on c.id = i.calendar_id;
$$;

-- The item sheet's dropdown (3.8): the full set of tags and deadlines the user picked. Tags from
-- the title's #hashtags stay, since only the title can remove them. Unknown tags are created.
create function public.set_item_links(p_id uuid, p_tags text[], p_deadlines uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  i public.items;
  v_tags text[] := array(
    select distinct lower(trim(t)) from unnest(coalesce(p_tags, '{}')) t where trim(t) <> '');
  v_deadlines uuid[] := array(select distinct x from unnest(coalesce(p_deadlines, '{}')) x);
begin
  select * into i from public.items where id = p_id and user_id = v_user for update;
  if not found or i.status = 'deleted' then
    raise exception 'item not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from unnest(v_deadlines) x
    where not exists (select 1 from public.deadlines d where d.id = x and d.user_id = v_user)
  ) then
    raise exception 'deadline not found' using errcode = '23503';
  end if;

  insert into public.tags (user_id, name)
  select v_user, t from unnest(v_tags) t
  on conflict (user_id, name) do nothing;

  delete from public.item_tags it
  where it.item_id = p_id and it.source <> 'hashtag'
    and it.tag_id not in (select t.id from public.tags t where t.user_id = v_user and t.name = any (v_tags));
  insert into public.item_tags (item_id, tag_id, source)
  select p_id, t.id, 'explicit' from public.tags t where t.user_id = v_user and t.name = any (v_tags)
  on conflict (item_id, tag_id) do nothing;

  delete from public.item_deadlines where item_id = p_id and deadline_id <> all (v_deadlines);
  insert into public.item_deadlines (item_id, deadline_id)
  select p_id, x from unnest(v_deadlines) x
  on conflict do nothing;

  perform private.refresh_suggestions(p_id);
  perform private.queue_links_write(i);
  insert into public.item_events (user_id, item_id, kind, payload)
  values (v_user, p_id, 'links_changed',
    jsonb_build_object('tags', to_jsonb(v_tags), 'deadlines', to_jsonb(v_deadlines)));
  return private.item_json(i);
end;
$$;

-- The Unassigned tray (screen 7): open suggestions on items that are still tasks.
create function public.unassigned()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'tag', jsonb_build_object('id', t.id, 'name', t.name), 'item', private.item_json(i))
    order by i.logical_date desc nulls last, i.start_at, s.created_at), '[]')
  from public.suggestions s
  join public.tags t on t.id = s.tag_id
  join public.items i on i.id = s.item_id
  where s.user_id = (select auth.uid()) and s.state = 'open' and i.status not in ('deleted', 'ignored');
$$;

-- Link: the tag is added without editing the Google title.
create function public.accept_suggestion(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  s public.suggestions;
  i public.items;
begin
  select * into s from public.suggestions
  where id = p_id and user_id = v_user and state = 'open' for update;
  if not found then
    raise exception 'suggestion not found' using errcode = 'P0002';
  end if;
  insert into public.item_tags (item_id, tag_id, source) values (s.item_id, s.tag_id, 'suggestion')
  on conflict (item_id, tag_id) do nothing;
  update public.suggestions set state = 'accepted' where id = p_id;
  select * into i from public.items where id = s.item_id;
  perform private.queue_links_write(i);
  insert into public.item_events (user_id, item_id, kind, payload)
  values (v_user, s.item_id, 'links_changed', jsonb_build_object('suggestion', p_id));
end;
$$;

create function public.dismiss_suggestion(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.suggestions set state = 'dismissed'
  where id = p_id and user_id = (select auth.uid()) and state = 'open';
  if not found then
    raise exception 'suggestion not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Deadline stats and warnings (3.9). One deadline, or all of them sorted by due date (open ones
-- first). An item counts when linked directly, or when it has one of the deadline's tags and its
-- logical date is inside the window. Deleted and 0-point items never count.
create function public.deadline_stats(p_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_today date := private.logical_today(v_user);
  pr public.profiles;
begin
  select * into pr from public.profiles where id = v_user;
  return coalesce((
    with d as (
      select dl.*,
        case when dl.status = 'done' and dl.completed_at is not null
          then ((dl.completed_at at time zone pr.timezone) - make_interval(hours => pr.day_boundary_hour))::date
          else greatest(dl.due_date, v_today) end as window_to
      from public.deadlines dl
      where dl.user_id = v_user and (p_id is null or dl.id = p_id)
    ),
    s as (
      select d.id as deadline_id, i.id, i.title, i.status, i.logical_date, i.start_at,
        i.planned_minutes, i.actual_minutes,
        coalesce(i.start_at,
          (i.logical_date + make_interval(hours => pr.day_boundary_hour)) at time zone pr.timezone) as sort_at,
        i.status = 'pending' and not i.finalized and coalesce(
          case when i.start_at is not null then i.start_at > now() else i.logical_date >= v_today end,
          false) as upcoming
      from d
      join public.items i on i.user_id = v_user and i.status not in ('deleted', 'ignored')
      where exists (select 1 from public.item_deadlines x where x.item_id = i.id and x.deadline_id = d.id)
         or (i.logical_date between d.start_date and d.window_to and exists (
               select 1 from public.item_tags it
               join public.deadline_tags dt on dt.tag_id = it.tag_id
               where it.item_id = i.id and dt.deadline_id = d.id))
    ),
    a as (
      select s.deadline_id,
        count(*) as planned,
        count(*) filter (where s.status = 'done') as done,
        count(*) filter (where s.status = 'missed') as missed,
        count(*) filter (where s.upcoming) as upcoming,
        coalesce(sum(s.planned_minutes), 0) as minutes_planned,
        coalesce(sum(coalesce(s.actual_minutes, s.planned_minutes)) filter (where s.status = 'done'), 0) as minutes_done,
        max(s.logical_date) filter (where s.status = 'done') as last_session
      from s group by s.deadline_id
    ),
    r as (
      select d.*, coalesce(a.planned, 0) as planned, coalesce(a.done, 0) as done,
        coalesce(a.missed, 0) as missed, coalesce(a.upcoming, 0) as upcoming,
        coalesce(a.minutes_planned, 0) as minutes_planned, coalesce(a.minutes_done, 0) as minutes_done,
        a.last_session, d.due_date - v_today as days_left,
        d.status not in ('done', 'dropped') as active
      from d left join a on a.deadline_id = d.id
    )
    select jsonb_agg(
      jsonb_build_object(
        'id', r.id, 'title', r.title, 'area_id', r.area_id, 'start_date', r.start_date,
        'due_date', r.due_date, 'target_sessions', r.target_sessions,
        'target_minutes', r.target_minutes, 'progress_pct', r.progress_pct, 'status', r.status,
        'notes', r.notes, 'completed_at', r.completed_at, 'created_at', r.created_at,
        'tags', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by t.name)
                          from public.deadline_tags dt join public.tags t on t.id = dt.tag_id
                          where dt.deadline_id = r.id), '[]'),
        'stats', jsonb_build_object(
          'window_from', r.start_date, 'window_to', r.window_to,
          'sessions_planned', r.planned, 'sessions_done', r.done, 'sessions_missed', r.missed,
          'sessions_upcoming', r.upcoming,
          'minutes_planned', r.minutes_planned, 'minutes_done', r.minutes_done,
          'days_left', r.days_left, 'last_session', r.last_session,
          'next_session', (
            select jsonb_build_object('id', s.id, 'title', s.title, 'logical_date', s.logical_date,
              'start_at', s.start_at)
            from s where s.deadline_id = r.id and s.upcoming order by s.sort_at limit 1),
          'progress_sessions', case when r.target_sessions is not null
            then round(100.0 * r.done / r.target_sessions, 1) end,
          'progress_minutes', case when r.target_minutes is not null
            then round(100.0 * r.minutes_done / r.target_minutes, 1) end),
        'warnings', to_jsonb(array_remove(array[
          case when r.active and r.days_left < 0 then 'overdue' end,
          case when r.active and r.days_left between 0 and pr.deadline_warning_days and r.upcoming = 0
            then 'no_sessions' end,
          case when r.active and r.target_sessions is not null and r.done + r.upcoming < r.target_sessions
            then 'needs_more_sessions' end
        ], null)))
      || case when p_id is null then '{}'::jsonb else jsonb_build_object('sessions', coalesce((
           select jsonb_agg(private.item_json(i) order by s.sort_at)
           from s join public.items i on i.id = s.id where s.deadline_id = r.id), '[]')) end
      order by not r.active, r.due_date, r.title)
    from r
  ), '[]');
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.set_item_links(uuid, text[], uuid[])',
    'public.unassigned()',
    'public.accept_suggestion(uuid)',
    'public.dismiss_suggestion(uuid)',
    'public.deadline_stats(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array['public.svc_item_links(uuid)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

alter publication supabase_realtime add table public.deadlines, public.suggestions;
