-- Phase 4: day close, missed inbox, streaks, daily notes, week and month tables.
-- Day close and streaks are plain SQL run by cron: they never touch Google, so no Edge Function
-- wakes for them. The streak walk mirrors packages/domain/src/streaks.ts (shared cases in tests/05).

-- Days, notes, streaks (section 7) -------------------------------------------------------------

create table public.day_summaries (
  user_id uuid not null references auth.users on delete cascade,
  logical_date date not null,
  planned_points int not null,
  done_points int not null,
  missed_points int not null,
  success_rate numeric(5, 1) not null,
  band text not null check (band in ('excellent', 'good', 'fair', 'not_good')),
  counts boolean,
  rest_pass_used boolean,
  streak_after int,
  finalized_at timestamptz not null default now(),
  primary key (user_id, logical_date)
);

alter table public.day_summaries enable row level security;
revoke all on table public.day_summaries from anon, authenticated;
grant select on table public.day_summaries to authenticated;
create policy day_summaries_select on public.day_summaries for select to authenticated
  using (user_id = (select auth.uid()));

create table public.daily_notes (
  user_id uuid not null references auth.users on delete cascade,
  logical_date date not null,
  body text not null default '' check (length(body) <= 10000),
  updated_at timestamptz not null default now(),
  primary key (user_id, logical_date)
);

create trigger daily_notes_touch before update on public.daily_notes
  for each row execute function private.touch_updated_at();

alter table public.daily_notes enable row level security;
revoke all on table public.daily_notes from anon, authenticated;
grant select, insert, update, delete on table public.daily_notes to authenticated;
create policy daily_notes_all on public.daily_notes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table public.streak_state (
  user_id uuid primary key references auth.users on delete cascade,
  current int not null default 0,
  best int not null default 0,
  computed_through date
);

alter table public.streak_state enable row level security;
revoke all on table public.streak_state from anon, authenticated;
grant select on table public.streak_state to authenticated;
create policy streak_state_select on public.streak_state for select to authenticated
  using (user_id = (select auth.uid()));

alter publication supabase_realtime add table public.day_summaries, public.streak_state;

-- Streaks (3.7) ---------------------------------------------------------------------------------

-- First day of the week containing p_date; p_week_start is an ISO weekday (Monday = 1).
create function private.week_key(p_date date, p_week_start int)
returns date
language sql
immutable
set search_path = ''
as $$
  select p_date - ((extract(isodow from p_date)::int - p_week_start + 7) % 7);
$$;

-- Re-walks finalized days from p_from onward, seeded with the state just before it.
create function private.recompute_streak(p_user_id uuid, p_from date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_week_start int;
  v_streak int;
  v_best int;
  v_pass_weeks date[];
  v_week date;
  v_counts boolean;
  v_pass boolean;
  v_last date;
  r record;
begin
  select week_start into v_week_start from public.profiles where id = p_user_id;
  v_week_start := coalesce(v_week_start, 1);

  select coalesce((select streak_after from public.day_summaries
                   where user_id = p_user_id and logical_date < p_from
                   order by logical_date desc limit 1), 0),
         coalesce((select max(streak_after) from public.day_summaries
                   where user_id = p_user_id and logical_date < p_from), 0),
         coalesce((select array_agg(distinct private.week_key(logical_date, v_week_start))
                   from public.day_summaries
                   where user_id = p_user_id and logical_date < p_from and rest_pass_used
                     and logical_date >= private.week_key(p_from, v_week_start)), '{}')
  into v_streak, v_best, v_pass_weeks;

  for r in
    select logical_date, success_rate from public.day_summaries
    where user_id = p_user_id and logical_date >= p_from order by logical_date
  loop
    v_week := private.week_key(r.logical_date, v_week_start);
    v_counts := r.success_rate >= 50;
    v_pass := false;
    if v_counts then
      v_streak := v_streak + 1;
    elsif not (v_week = any (v_pass_weeks)) then
      v_pass_weeks := v_pass_weeks || v_week;
      v_pass := true;
    else
      v_streak := 0;
    end if;
    v_best := greatest(v_best, v_streak);
    v_last := r.logical_date;
    update public.day_summaries
    set counts = v_counts, rest_pass_used = v_pass, streak_after = v_streak
    where user_id = p_user_id and logical_date = r.logical_date;
  end loop;

  insert into public.streak_state (user_id, current, best, computed_through)
  values (p_user_id, v_streak, v_best, v_last)
  on conflict (user_id) do update set
    current = excluded.current,
    best = excluded.best,
    computed_through = coalesce(excluded.computed_through, public.streak_state.computed_through);
end;
$$;

-- Day close (3.3, 3.5) ---------------------------------------------------------------------------

-- Pending items become missed, everything on the day is frozen, misses enter the inbox (not
-- habits), the score is stored and the streak walks on. Running it twice changes nothing.
create function private.close_day(p_user_id uuid, p_date date)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  s jsonb;
begin
  if exists (select 1 from public.day_summaries where user_id = p_user_id and logical_date = p_date) then
    return false;
  end if;

  with missed as (
    update public.items set
      status = 'missed',
      miss_reason = 'day_close',
      finalized = true,
      inbox_state = case when source in ('calendar', 'manual', 'gtask') then 'open' else inbox_state end
    where user_id = p_user_id and logical_date = p_date and status = 'pending'
    returning id
  )
  insert into public.item_events (user_id, item_id, kind, payload)
  select p_user_id, id, 'missed', '{"reason": "day_close"}' from missed;

  update public.items set finalized = true
  where user_id = p_user_id and logical_date = p_date and not finalized;

  s := private.day_score(p_user_id, p_date);
  insert into public.day_summaries (user_id, logical_date, planned_points, done_points,
    missed_points, success_rate, band, finalized_at)
  values (p_user_id, p_date, (s ->> 'planned')::int, (s ->> 'done')::int, (s ->> 'missed')::int,
    (s ->> 'rate')::numeric, s ->> 'band', now());

  perform private.recompute_streak(p_user_id, p_date);
  return true;
end;
$$;

-- The first logical day a user is tracked: the day they finished onboarding.
create function private.tracking_start(p_user_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select ((p.onboarded_at at time zone p.timezone) - make_interval(hours => p.day_boundary_hour))::date
  from public.profiles p where p.id = p_user_id;
$$;

-- Every 5 minutes (UTC): close each user's finished days, oldest first, and create habit items
-- for the new logical day. Looks back at most 30 days.
create function private.schedule_due_jobs()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  d date;
  v_today date;
  v_closed int := 0;
begin
  for p in select id from public.profiles where onboarded_at is not null loop
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
  end loop;
  return v_closed;
end;
$$;

revoke execute on function private.schedule_due_jobs() from public;
select cron.schedule('mjolnir-due-jobs', '*/5 * * * *', 'select private.schedule_due_jobs()');

-- Missed inbox (3.5) -------------------------------------------------------------------------------

create function public.missed_inbox()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    private.item_json(i) || jsonb_build_object(
      'late_done_until', ds.finalized_at + interval '48 hours')
    order by i.logical_date desc, i.start_at nulls last), '[]')
  from public.items i
  left join public.day_summaries ds on ds.user_id = i.user_id and ds.logical_date = i.logical_date
  where i.user_id = (select auth.uid()) and i.inbox_state = 'open';
$$;

create function public.dismiss_missed(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.items set inbox_state = 'dismissed'
  where id = p_id and user_id = (select auth.uid()) and inbox_state = 'open';
  if not found then
    raise exception 'not in the missed inbox' using errcode = 'P0002';
  end if;
  insert into public.item_events (user_id, item_id, kind) values ((select auth.uid()), p_id, 'dismissed');
end;
$$;

create function public.dismiss_all_missed()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  with d as (
    update public.items set inbox_state = 'dismissed'
    where user_id = (select auth.uid()) and inbox_state = 'open'
    returning id
  ), logged as (
    insert into public.item_events (user_id, item_id, kind)
    select (select auth.uid()), id, 'dismissed' from d
  )
  select count(*) into v_count from d;
  return v_count;
end;
$$;

-- "Mark done (forgot to tick)": up to 48 hours after day close, flagged, re-scores the day and
-- walks the streak again from that day (3.5, decision 7).
create function public.mark_late_done(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  i public.items;
  v_closed_at timestamptz;
  s jsonb;
begin
  select * into i from public.items where id = p_id and user_id = v_user for update;
  if not found then
    raise exception 'item not found' using errcode = 'P0002';
  end if;
  if i.status <> 'missed' or i.miss_reason is distinct from 'day_close' then
    raise exception 'only tasks missed at day close can be marked done late' using errcode = '22023';
  end if;
  select finalized_at into v_closed_at from public.day_summaries
  where user_id = v_user and logical_date = i.logical_date;
  if v_closed_at is null or now() > v_closed_at + interval '48 hours' then
    raise exception 'the 48 hours to mark this done have passed' using errcode = '22023';
  end if;

  update public.items set
    status = 'done', marked_late = true, completed_at = now(),
    actual_minutes = coalesce(actual_minutes, planned_minutes),
    inbox_state = case when inbox_state = 'open' then 'dismissed' else inbox_state end
  where id = p_id
  returning * into i;
  insert into public.item_events (user_id, item_id, kind, payload)
  values (v_user, p_id, 'completed', '{"late": true}');

  s := private.day_score(v_user, i.logical_date);
  update public.day_summaries set
    planned_points = (s ->> 'planned')::int, done_points = (s ->> 'done')::int,
    missed_points = (s ->> 'missed')::int, success_rate = (s ->> 'rate')::numeric, band = s ->> 'band'
  where user_id = v_user and logical_date = i.logical_date;
  perform private.recompute_streak(v_user, i.logical_date);
  return private.item_json(i);
end;
$$;

-- Copies a missed item as a new pending one linked by rescheduled_from_id (3.5). The original
-- stays missed. Returns the new item's row.
create function private.reschedule_copy(
  p_user_id uuid, p_id uuid, p_date date, p_fields jsonb default '{}'
)
returns public.items
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.items;
  n public.items;
begin
  select * into o from public.items where id = p_id and user_id = p_user_id for update;
  if not found then
    raise exception 'item not found' using errcode = 'P0002';
  end if;
  if o.status <> 'missed' or o.inbox_state not in ('open', 'dismissed') then
    raise exception 'only missed tasks can be rescheduled' using errcode = '22023';
  end if;
  if p_date < private.logical_today(p_user_id) then
    raise exception 'reschedule to today or later' using errcode = '22023';
  end if;

  insert into public.items (user_id, source, title, raw_title, points, logical_date, start_at,
    end_at, planned_minutes, status, area_id, rescheduled_from_id, calendar_id, google_event_id,
    google_active)
  values (p_user_id, o.source, o.title, o.raw_title, o.points, p_date,
    (p_fields ->> 'start_at')::timestamptz, (p_fields ->> 'end_at')::timestamptz,
    coalesce((p_fields ->> 'planned_minutes')::int, o.planned_minutes), 'pending', o.area_id, o.id,
    (p_fields ->> 'calendar_id')::uuid, p_fields ->> 'google_event_id',
    coalesce((p_fields ->> 'google_active')::boolean, false))
  returning * into n;

  insert into public.item_tags (item_id, tag_id, source)
  select n.id, tag_id, source from public.item_tags where item_id = o.id;

  update public.items set inbox_state = 'rescheduled' where id = o.id;
  insert into public.item_events (user_id, item_id, kind, payload) values
    (p_user_id, o.id, 'rescheduled', jsonb_build_object('to', n.id, 'date', p_date)),
    (p_user_id, n.id, 'created', jsonb_build_object('rescheduled_from', o.id));
  return n;
end;
$$;

-- A manual task can move to a date with no time and no Google event (3.5).
create function public.reschedule_manual(p_id uuid, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n public.items;
begin
  if not exists (select 1 from public.items where id = p_id and user_id = (select auth.uid()) and source = 'manual') then
    raise exception 'calendar events are rescheduled with a time' using errcode = '22023';
  end if;
  n := private.reschedule_copy((select auth.uid()), p_id, p_date);
  return private.item_json(n);
end;
$$;

-- Calendar reschedule, step 1 of 3 (app-api): create the new item with a chosen Google event id,
-- so the sync recognises the event the moment it appears. Returns what the Google insert needs.
create function public.svc_reschedule_prepare(
  p_user_id uuid, p_id uuid, p_start timestamptz, p_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.items;
  n public.items;
  p public.profiles;
  v_cal public.calendars;
  v_event text := replace(gen_random_uuid()::text, '-', '');
begin
  select * into o from public.items where id = p_id and user_id = p_user_id;
  if not found or o.source <> 'calendar' then
    raise exception 'calendar item not found' using errcode = 'P0002';
  end if;
  if p_end <= p_start then
    raise exception 'the slot must end after it starts' using errcode = '22023';
  end if;
  select * into p from public.profiles where id = p_user_id;

  -- The original calendar if it is synced and writable, else the primary calendar.
  select * into v_cal from public.calendars c
  where c.user_id = p_user_id and c.sync_enabled and c.access_role in ('owner', 'writer')
  order by (c.id = o.calendar_id) desc, c.is_primary desc
  limit 1;
  if v_cal.id is null then
    raise exception 'no synced calendar Mjolnir can write to' using errcode = '22023';
  end if;

  n := private.reschedule_copy(p_user_id, p_id,
    ((p_start at time zone p.timezone) - make_interval(hours => p.day_boundary_hour))::date,
    jsonb_build_object(
      'start_at', p_start, 'end_at', p_end,
      'planned_minutes', (extract(epoch from p_end - p_start) / 60)::int,
      'calendar_id', v_cal.id, 'google_event_id', v_event, 'google_active', true));

  return jsonb_build_object(
    'item_id', n.id,
    'original_id', o.id,
    'google_event_id', v_event,
    'google_calendar_id', v_cal.google_calendar_id,
    'summary', coalesce(nullif(o.raw_title, ''), o.title),
    'points', o.points,
    'time_zone', p.timezone,
    'tags', coalesce((select jsonb_agg(t.name order by t.name) from public.item_tags it
                      join public.tags t on t.id = it.tag_id where it.item_id = n.id), '[]'),
    'color_rules', (select jsonb_agg(jsonb_build_object('colorKey', r.color_key, 'points', r.points,
                      'primaryForPoints', r.primary_for_points))
                    from public.color_rules r where r.user_id = p_user_id));
end;
$$;

-- Step 2: Google accepted the event; store its etag so the sync skips the echo.
create function public.svc_reschedule_commit(p_item_id uuid, p_etag text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.items set google_etag = p_etag, google_seen_at = now() where id = p_item_id;
$$;

-- Step 3 on failure: undo, and put the original back in the inbox.
create function public.svc_reschedule_abort(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from uuid;
begin
  delete from public.items where id = p_item_id returning rescheduled_from_id into v_from;
  update public.items set inbox_state = 'open' where id = v_from;
end;
$$;

-- Free-slot input: the user's timed blocks (0-point ones too: sleep and dinner are still busy).
create function public.busy_blocks(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('start', start_at, 'end', end_at) order by start_at), '[]')
  from public.items
  where user_id = (select auth.uid()) and google_active and status <> 'deleted' and not is_all_day
    and start_at < p_to and end_at > p_from;
$$;

-- Week and month tables (section 11) ---------------------------------------------------------------

-- One row per date: the frozen summary when the day is closed, else the live score.
create function public.days_range(p_from date, p_to date)
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
  return (
    select jsonb_agg(
      jsonb_build_object(
        'date', d::date,
        'finalized', ds.logical_date is not null,
        'planned', coalesce(ds.planned_points, (live ->> 'planned')::int),
        'done', coalesce(ds.done_points, (live ->> 'done')::int),
        'rate', coalesce(ds.success_rate, (live ->> 'rate')::numeric),
        'band', coalesce(ds.band, live ->> 'band'),
        'counts', ds.counts,
        'rest_pass_used', ds.rest_pass_used,
        'streak_after', ds.streak_after,
        'note', n.body)
      order by d)
    from generate_series(p_from, p_to, interval '1 day') d
    left join public.day_summaries ds on ds.user_id = v_user and ds.logical_date = d::date
    left join public.daily_notes n on n.user_id = v_user and n.logical_date = d::date
    cross join lateral (select case when ds.logical_date is null
      then private.day_score(v_user, d::date) end as live) l
  );
end;
$$;

-- The automatic Performance review: one row per month of a year, from closed days only.
-- Rates are points-weighted (decision 11).
create function public.months_summary(p_year int)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(row order by (row ->> 'month')::int), '[]')
  from (
    select jsonb_build_object(
      'month', extract(month from logical_date)::int,
      'days_closed', count(*),
      'days_counted', count(*) filter (where counts),
      'points_planned', sum(planned_points),
      'points_done', sum(done_points),
      'rate', case when sum(planned_points) > 0
        then round(sum(done_points) * 100.0 / sum(planned_points), 1) else 0 end,
      'excellent_days', count(*) filter (where band = 'excellent'),
      'best_streak', coalesce(max(streak_after), 0)) as row
    from public.day_summaries
    where user_id = (select auth.uid()) and extract(year from logical_date) = p_year
    group by extract(month from logical_date)
  ) m;
$$;

-- Streak for the header: current, best, and this week's rest pass (3.7).
create function public.streak()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with u as (
    select p.id, p.week_start, private.logical_today(p.id) as today
    from public.profiles p where p.id = (select auth.uid())
  )
  select jsonb_build_object(
    'current', coalesce(s.current, 0),
    'best', coalesce(s.best, 0),
    'pass_used_on', (
      select min(ds.logical_date) from public.day_summaries ds
      where ds.user_id = u.id and ds.rest_pass_used
        and ds.logical_date >= private.week_key(u.today, u.week_start)))
  from u left join public.streak_state s on s.user_id = u.id;
$$;

-- day_view gains the note, streak, inbox count and whether the day is closed.
create or replace function public.day_view(p_date date default null)
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
    'finalized', exists (select 1 from public.day_summaries where user_id = v_user and logical_date = v_date),
    'score', private.day_score(v_user, v_date),
    'note', (select body from public.daily_notes where user_id = v_user and logical_date = v_date),
    'streak', public.streak(),
    'missed_open', (select count(*) from public.items where user_id = v_user and inbox_state = 'open'),
    -- 0-point and deleted items are not tasks and stay hidden (3.2, 3.4 D1).
    'items', coalesce((
      select jsonb_agg(private.item_json(i) order by i.start_at nulls last, i.created_at)
      from public.items i
      where i.user_id = v_user and i.logical_date = v_date and i.status not in ('deleted', 'ignored')
    ), '[]')
  );
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.missed_inbox()',
    'public.dismiss_missed(uuid)',
    'public.dismiss_all_missed()',
    'public.mark_late_done(uuid)',
    'public.reschedule_manual(uuid, date)',
    'public.busy_blocks(timestamptz, timestamptz)',
    'public.days_range(date, date)',
    'public.months_summary(int)',
    'public.streak()'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.svc_reschedule_prepare(uuid, uuid, timestamptz, timestamptz)',
    'public.svc_reschedule_commit(uuid, text)',
    'public.svc_reschedule_abort(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
