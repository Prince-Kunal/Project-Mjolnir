-- Phase 8: Web Push (section 10): devices, the morning prompt, the evening reminder and deadline
-- warnings. SQL decides what is due and queues a `push` job; the worker sends it with VAPID.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon, authenticated;
grant select, delete on table public.push_subscriptions to authenticated;
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.profiles
  add column notify_morning boolean not null default true,
  add column notify_evening boolean not null default true,
  add column notify_deadlines boolean not null default true;
grant update (notify_morning, notify_evening, notify_deadlines) on table public.profiles to authenticated;

-- One row per prompt sent, so each goes out at most once per local day.
create table private.push_log (
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,
  local_date date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, local_date)
);

-- A browser's subscription. An endpoint belongs to one browser profile, so on a shared device it
-- moves to whoever turned notifications on last.
create function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_endpoint !~ '^https://' then
    raise exception 'not a push endpoint' using errcode = '22023';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_user, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 200))
  on conflict (endpoint) do update set
    user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent;
end;
$$;

create function private.queue_push(
  p_user uuid, p_tag text, p_title text, p_body text, p_url text
)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.queue_job(jsonb_build_object('kind', 'push', 'user_id', p_user, 'tag', p_tag,
    'title', p_title, 'body', p_body, 'url', p_url));
$$;

create function public.send_test_push()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if not exists (select 1 from public.push_subscriptions where user_id = v_user) then
    raise exception 'turn notifications on for this device first' using errcode = 'P0002';
  end if;
  perform private.queue_push(v_user, 'test', 'Notifications are on',
    'Mjolnir will remind you about missed tasks, open points and deadlines.', '/');
end;
$$;

-- Deadline stats for any user, so the scheduler can warn about deadlines (no auth.uid() there).
create function private.deadline_stats_for(p_user uuid, p_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := p_user;
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

-- deadline_stats for the signed-in user, now a thin wrapper.
create or replace function public.deadline_stats(p_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.deadline_stats_for((select auth.uid()), p_id);
$$;

-- Which prompts are due (run every 5 minutes by schedule_due_jobs; p_now for tests). Each goes out
-- once per local day, within 3 hours of its time, and only when it has something to say:
--   morning:   open missed tasks (3.5), at morning_prompt_time
--   deadlines: deadlines that are overdue or have no sessions scheduled (3.9), at the same time
--   evening:   points still open today, at evening_reminder_time
create function private.queue_push_prompts(p_now timestamptz default now())
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  v_local timestamp;
  v_date date;
  v_today date;
  v_queued int := 0;
  v_n int;
  v_points int;
  v_score jsonb;
  v_warn jsonb;
begin
  for p in
    select pr.* from public.profiles pr
    where pr.onboarded_at is not null
      and exists (select 1 from public.push_subscriptions s where s.user_id = pr.id)
  loop
    v_local := p_now at time zone p.timezone;
    v_date := v_local::date;
    v_today := (v_local - make_interval(hours => p.day_boundary_hour))::date;

    if v_local >= v_date + p.morning_prompt_time
       and v_local < v_date + p.morning_prompt_time + interval '3 hours' then
      if p.notify_morning and not exists (
        select 1 from private.push_log where user_id = p.id and kind = 'morning' and local_date = v_date
      ) then
        insert into private.push_log (user_id, kind, local_date) values (p.id, 'morning', v_date);
        select count(*), coalesce(sum(points), 0) into v_n, v_points
        from public.items where user_id = p.id and inbox_state = 'open';
        if v_n > 0 then
          perform private.queue_push(p.id, 'morning',
            format('You missed %s task%s', v_n, case when v_n = 1 then '' else 's' end),
            format('%s point%s. Reschedule, mark done or dismiss.', v_points,
              case when v_points = 1 then '' else 's' end),
            '/missed');
          v_queued := v_queued + 1;
        end if;
      end if;

      if p.notify_deadlines and not exists (
        select 1 from private.push_log where user_id = p.id and kind = 'deadlines' and local_date = v_date
      ) then
        insert into private.push_log (user_id, kind, local_date) values (p.id, 'deadlines', v_date);
        select coalesce(jsonb_agg(d order by (d -> 'stats' ->> 'days_left')::int), '[]') into v_warn
        from jsonb_array_elements(private.deadline_stats_for(p.id)) d
        where d -> 'warnings' ?| array['overdue', 'no_sessions'];
        if jsonb_array_length(v_warn) > 0 then
          perform private.queue_push(p.id, 'deadlines',
            case when jsonb_array_length(v_warn) = 1 then v_warn -> 0 ->> 'title'
              else format('%s deadlines need sessions', jsonb_array_length(v_warn)) end,
            format('%s: %s.%s', v_warn -> 0 ->> 'title',
              case when v_warn -> 0 -> 'warnings' ? 'overdue'
                then format('overdue by %s day%s', -(v_warn -> 0 -> 'stats' ->> 'days_left')::int,
                  case when (v_warn -> 0 -> 'stats' ->> 'days_left')::int = -1 then '' else 's' end)
                else format('no sessions scheduled, due in %s day%s',
                  v_warn -> 0 -> 'stats' ->> 'days_left',
                  case when (v_warn -> 0 -> 'stats' ->> 'days_left')::int = 1 then '' else 's' end) end,
              case when jsonb_array_length(v_warn) > 1
                then format(' And %s more.', jsonb_array_length(v_warn) - 1) else '' end),
            '/deadlines');
          v_queued := v_queued + 1;
        end if;
      end if;
    end if;

    if p.notify_evening
       and v_local >= v_date + p.evening_reminder_time
       and v_local < v_date + p.evening_reminder_time + interval '3 hours'
       and not exists (
         select 1 from private.push_log where user_id = p.id and kind = 'evening' and local_date = v_date
       ) then
      insert into private.push_log (user_id, kind, local_date) values (p.id, 'evening', v_date);
      select coalesce(sum(points), 0) into v_points
      from public.items where user_id = p.id and logical_date = v_today and status = 'pending';
      if v_points > 0 then
        v_score := private.day_score(p.id, v_today);
        perform private.queue_push(p.id, 'evening',
          format('%s point%s still open', v_points, case when v_points = 1 then '' else 's' end),
          format('Today is at %s%% (%s of %s). Tick what you did, then plan tomorrow.',
            v_score ->> 'rate', v_score ->> 'done', v_score ->> 'planned'),
          '/');
        v_queued := v_queued + 1;
      end if;
    end if;
  end loop;
  return v_queued;
end;
$$;

create function public.svc_push_subscriptions(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)), '[]')
  from public.push_subscriptions where user_id = p_user_id;
$$;

create function public.svc_push_gone(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;

-- The 5-minute scheduler also queues due notifications.
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
  perform private.queue_push_prompts();
  return v_closed;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.save_push_subscription(text, text, text, text)',
    'public.send_test_push()'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.svc_push_subscriptions(uuid)',
    'public.svc_push_gone(text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
