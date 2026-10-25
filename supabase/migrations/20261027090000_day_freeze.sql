-- Decision 16: a finished day stays open until 12:00 local time the next day, so a block done
-- late at night can still be ticked over breakfast. The day boundary still decides which day a
-- block belongs to; only the close (missed, frozen score, streak) waits for the freeze.

-- When a logical day freezes: 12:00 local on the following calendar day, or the day's own end
-- if the boundary is later than noon. Mirrors DAY_FREEZE_HOUR in packages/domain.
create function private.freeze_at(p_user_id uuid, p_date date)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select ((p_date + 1) + make_interval(hours => greatest(12, p.day_boundary_hour))) at time zone p.timezone
  from public.profiles p where p.id = p_user_id;
$$;

revoke execute on function private.freeze_at(uuid, date) from public;

-- Every 5 minutes (cron calls it without arguments; p_now is for tests): close each user's days
-- that have passed their freeze, oldest first; habits, reconciles and prompts as before.
drop function private.schedule_due_jobs();
create function private.schedule_due_jobs(p_now timestamptz default now())
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
  for p in select id, timezone, day_boundary_hour from public.profiles where onboarded_at is not null loop
    v_today := ((p_now at time zone p.timezone) - make_interval(hours => p.day_boundary_hour))::date;
    for d in
      select g::date from generate_series(
        greatest(private.tracking_start(p.id), v_today - 30), v_today - 1, interval '1 day') g
    loop
      -- A finished day stays open for late ticks until its freeze (decision 16).
      exit when p_now < private.freeze_at(p.id, d);
      if private.close_day(p.id, d) then
        v_closed := v_closed + 1;
      end if;
    end loop;
    perform private.ensure_habit_items(p.id, v_today);

    v_local := p_now at time zone p.timezone;
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
  perform private.queue_push_prompts(p_now);
  return v_closed;
end;
$$;

revoke execute on function private.schedule_due_jobs(timestamptz) from public;

-- The morning prompt leads with yesterday while it is still open.
create or replace function private.queue_push_prompts(p_now timestamptz default now())
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
  v_open int;
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
        -- Yesterday is still open until its freeze: say so first, while a tick still counts.
        select coalesce(sum(points), 0) into v_open
        from public.items
        where user_id = p.id and logical_date = v_today - 1 and status = 'pending' and not finalized;
        if v_open > 0 then
          perform private.queue_push(p.id, 'morning',
            format('Yesterday is open until %s',
              to_char(private.freeze_at(p.id, v_today - 1) at time zone p.timezone, 'HH24:MI')),
            format('%s point%s unticked. Tick what you finished.%s', v_open,
              case when v_open = 1 then '' else 's' end,
              case when v_n > 0 then format(' %s older miss%s in the inbox.', v_n,
                case when v_n = 1 then '' else 'es' end) else '' end),
            '/?date=' || (v_today - 1));
          v_queued := v_queued + 1;
        elsif v_n > 0 then
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

-- The day view says when the day freezes, so an open past day can show it.
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
    'freezes_at', private.freeze_at(v_user, v_date),
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
