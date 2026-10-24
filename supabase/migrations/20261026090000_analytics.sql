-- Phase 8: analytics (section 12). Computed from items and day_summaries at request time; the data
-- is small. Weekly and monthly rates are points-weighted (decision 11).

-- An item's area: its own, else its first tag's (section 12).
create function private.item_area(i public.items)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(i.area_id, (
    select t.area_id from public.item_tags it join public.tags t on t.id = it.tag_id
    where it.item_id = i.id and t.area_id is not null order by t.name limit 1));
$$;

-- One row per day up to today: closed days from day_summaries, open ones scored live. Days before
-- tracking started are left out. avg7 is done ÷ planned over the 7 days ending that day.
create function public.analytics_trend(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_today date := private.logical_today(v_user);
  v_start date := private.tracking_start(v_user);
begin
  if p_to < p_from or p_to - p_from > 400 then
    raise exception 'ask for at most 400 days' using errcode = '22023';
  end if;
  return coalesce((
    with days as (
      select d::date as date, ds.logical_date is not null as finalized,
        coalesce(ds.planned_points, (l.live ->> 'planned')::int) as planned,
        coalesce(ds.done_points, (l.live ->> 'done')::int) as done,
        coalesce(ds.success_rate, (l.live ->> 'rate')::numeric) as rate,
        coalesce(ds.band, l.live ->> 'band') as band,
        ds.streak_after
      from generate_series(p_from - 6, least(p_to, v_today), interval '1 day') d
      left join public.day_summaries ds on ds.user_id = v_user and ds.logical_date = d::date
      cross join lateral (select case when ds.logical_date is null
        then private.day_score(v_user, d::date) end as live) l
      where ds.logical_date is not null or (v_start is not null and d::date >= v_start)
    ),
    w as (
      select *,
        sum(done) over seven as done7,
        sum(planned) over seven as planned7
      from days
      window seven as (order by date range between interval '6 days' preceding and current row)
    )
    select jsonb_agg(jsonb_build_object(
        'date', date, 'finalized', finalized, 'planned', planned, 'done', done, 'rate', rate,
        'band', band, 'streak_after', streak_after,
        'avg7', case when planned7 > 0 then round(done7 * 100.0 / planned7, 1) else 0 end)
      order by date)
    from w where date >= p_from
  ), '[]');
end;
$$;

-- Points and hours by area per week, planned vs done hours per week (calendar items), and the
-- top tags by hours done. Hours use actual minutes, else planned.
create function public.analytics_areas(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_week int := (select week_start from public.profiles where id = v_user);
begin
  if p_to < p_from or p_to - p_from > 400 then
    raise exception 'ask for at most 400 days' using errcode = '22023';
  end if;
  return (
    with i as (
      select it.*, private.week_key(it.logical_date, v_week) as week, private.item_area(it) as area,
        case when it.status = 'done' then coalesce(it.actual_minutes, it.planned_minutes, 0) else 0 end as minutes_done
      from public.items it
      where it.user_id = v_user and it.logical_date between p_from and p_to
        and it.status in ('pending', 'done', 'missed') and it.points > 0
    )
    select jsonb_build_object(
      'areas', coalesce((
        select jsonb_agg(jsonb_build_object('week', week, 'area_id', area, 'planned', planned,
            'done', done, 'minutes_done', minutes_done) order by week, area nulls last)
        from (
          select week, area, sum(points)::int as planned,
            coalesce(sum(points) filter (where status = 'done'), 0)::int as done,
            sum(minutes_done)::int as minutes_done
          from i group by week, area
        ) a), '[]'),
      'hours', coalesce((
        select jsonb_agg(jsonb_build_object('week', week, 'planned_minutes', planned_minutes,
            'done_minutes', done_minutes) order by week)
        from (
          select week, coalesce(sum(planned_minutes), 0)::int as planned_minutes,
            sum(minutes_done)::int as done_minutes
          from i where source = 'calendar' group by week
        ) h), '[]'),
      'tags', coalesce((
        select jsonb_agg(jsonb_build_object('tag_id', tag_id, 'name', name,
            'minutes_done', minutes_done, 'sessions', sessions) order by minutes_done desc, name)
        from (
          select t.id as tag_id, t.name, sum(i.minutes_done)::int as minutes_done,
            count(*)::int as sessions
          from i join public.item_tags x on x.item_id = i.id join public.tags t on t.id = x.tag_id
          where i.status = 'done'
          group by t.id, t.name
          order by minutes_done desc, t.name
          limit 10
        ) g), '[]')));
end;
$$;

-- Miss rate by weekday and local start hour (closed calendar items), reschedule chains that start
-- in the range, and estimate accuracy (actual ÷ planned minutes where actual was entered).
create function public.analytics_misses(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_tz text := (select timezone from public.profiles where id = v_user);
begin
  if p_to < p_from or p_to - p_from > 400 then
    raise exception 'ask for at most 400 days' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'slots', coalesce((
      select jsonb_agg(jsonb_build_object('weekday', weekday, 'hour', hour, 'planned', planned,
          'missed', missed) order by weekday, hour)
      from (
        select extract(isodow from i.start_at at time zone v_tz)::int as weekday,
          extract(hour from i.start_at at time zone v_tz)::int as hour,
          sum(i.points)::int as planned,
          coalesce(sum(i.points) filter (where i.status = 'missed'), 0)::int as missed
        from public.items i
        where i.user_id = v_user and i.source = 'calendar' and i.finalized and i.start_at is not null
          and i.status in ('done', 'missed') and i.points > 0 and not i.is_all_day
          and i.logical_date between p_from and p_to
        group by 1, 2
      ) s), '[]'),
    'chains', coalesce((
      with recursive chain as (
        select r.id as root, r.id, 0 as depth
        from public.items r
        where r.user_id = v_user and r.rescheduled_from_id is null and r.status = 'missed'
          and r.logical_date between p_from and p_to
          and exists (select 1 from public.items n where n.rescheduled_from_id = r.id)
        union all
        select c.root, n.id, c.depth + 1
        from chain c join public.items n on n.rescheduled_from_id = c.id
        where c.depth < 50
      ),
      ends as (
        select distinct on (c.root) c.root, c.depth, i.status
        from chain c join public.items i on i.id = c.id
        order by c.root, c.depth desc, i.created_at desc
      )
      select jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title,
          'logical_date', r.logical_date, 'times', e.depth, 'last_status', e.status)
        order by e.depth desc, r.logical_date desc)
      from ends e join public.items r on r.id = e.root), '[]'),
    'estimate', (
      select jsonb_build_object('count', count(*)::int,
        'planned_minutes', coalesce(sum(planned_minutes), 0)::int,
        'actual_minutes', coalesce(sum(actual_minutes), 0)::int,
        'ratio', case when sum(planned_minutes) > 0
          then round(sum(actual_minutes)::numeric / sum(planned_minutes), 2) end)
      from public.items
      where user_id = v_user and status = 'done' and actual_minutes is not null
        and planned_minutes > 0 and logical_date between p_from and p_to));
end;
$$;

-- The year heatmap (screen 5): a band per closed day.
create function public.analytics_heatmap(p_year int)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('date', logical_date, 'rate', success_rate,
      'band', band, 'counts', counts) order by logical_date), '[]')
  from public.day_summaries
  where user_id = (select auth.uid()) and extract(year from logical_date) = p_year;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.analytics_trend(date, date)',
    'public.analytics_areas(date, date)',
    'public.analytics_misses(date, date)',
    'public.analytics_heatmap(int)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
