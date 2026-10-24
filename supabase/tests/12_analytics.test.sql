begin;
select plan(14);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');
update public.profiles set timezone = 'UTC', day_boundary_hour = 0, week_start = 1
where id = '11111111-1111-1111-1111-111111111111';
insert into public.areas (id, user_id, name) values
  ('ae000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'Intelligent'),
  ('ae000000-0000-0000-0000-00000000000b', '11111111-1111-1111-1111-111111111111', 'Muscular');
insert into public.tags (id, user_id, name, area_id) values
  ('70000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'lfx', 'ae000000-0000-0000-0000-00000000000a');

-- Mon 7 to Wed 9 September 2026, closed. Points-weighted 7-day averages: 90, 13/20, 18/25.
insert into public.day_summaries (user_id, logical_date, planned_points, done_points, missed_points,
  success_rate, band, counts, rest_pass_used, streak_after, finalized_at) values
  ('11111111-1111-1111-1111-111111111111', '2026-09-07', 10, 9, 1, 90, 'excellent', true, false, 1, now()),
  ('11111111-1111-1111-1111-111111111111', '2026-09-08', 10, 4, 6, 40, 'not_good', false, true, 1, now()),
  ('11111111-1111-1111-1111-111111111111', '2026-09-09', 5, 5, 0, 100, 'excellent', true, false, 2, now());

insert into public.items (id, user_id, source, title, points, status, logical_date, start_at, end_at,
  planned_minutes, actual_minutes, area_id, rescheduled_from_id, finalized) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'calendar', 'PR review', 3, 'done', '2026-09-07',
    '2026-09-07 10:00Z', '2026-09-07 11:00Z', 60, 90, null, null, true),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'calendar', 'Gym', 2, 'missed', '2026-09-08',
    '2026-09-08 18:00Z', '2026-09-08 20:00Z', 120, null, 'ae000000-0000-0000-0000-00000000000b', null, true),
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'calendar', 'Gym', 2, 'missed', '2026-09-09',
    '2026-09-09 18:00Z', '2026-09-09 20:00Z', 120, null, 'ae000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000002', true),
  ('a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'manual', 'Gym', 2, 'done', '2026-09-10',
    null, null, null, null, 'ae000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000003', true),
  ('a0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'manual', 'Call bank', 1, 'done', '2026-09-07',
    null, null, 30, 30, null, null, true),
  ('a0000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'calendar', 'Dinner', 0, 'ignored', '2026-09-07',
    '2026-09-07 19:00Z', '2026-09-07 20:00Z', 60, null, null, null, true);
insert into public.item_tags (item_id, tag_id, source) values
  ('a0000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'hashtag');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

-- Trend (section 12: daily rate with a 7-day average, streak history) ----------------------------

select is(
  (select array_agg((x ->> 'rate')::numeric order by x ->> 'date') from jsonb_array_elements(public.analytics_trend('2026-09-07', '2026-09-09')) x),
  array[90, 40, 100]::numeric[], 'daily rates come from closed days'
);
select is(
  (select array_agg((x ->> 'avg7')::numeric order by x ->> 'date') from jsonb_array_elements(public.analytics_trend('2026-09-07', '2026-09-09')) x),
  array[90.0, 65.0, 72.0]::numeric[], 'the 7-day average is points-weighted, not an average of rates'
);
select is(
  (select (x ->> 'avg7')::numeric from jsonb_array_elements(public.analytics_trend('2026-09-09', '2026-09-09')) x),
  72.0, 'the average looks back before the range'
);
select is(
  (select array_agg((x ->> 'streak_after')::int order by x ->> 'date') from jsonb_array_elements(public.analytics_trend('2026-09-07', '2026-09-09')) x),
  array[1, 1, 2], 'streak history rides along'
);
select throws_ok($$ select public.analytics_trend('2024-01-01', '2026-01-01') $$, '22023', null, 'ranges are bounded');

-- Areas, hours and tags --------------------------------------------------------------------------

select is(
  (select jsonb_agg(x - 'week' order by x ->> 'area_id' nulls last) from jsonb_array_elements(public.analytics_areas('2026-09-07', '2026-09-13') -> 'areas') x),
  '[{"area_id": "ae000000-0000-0000-0000-00000000000a", "planned": 3, "done": 3, "minutes_done": 90},
    {"area_id": "ae000000-0000-0000-0000-00000000000b", "planned": 6, "done": 2, "minutes_done": 0},
    {"area_id": null, "planned": 1, "done": 1, "minutes_done": 30}]'::jsonb,
  'points and hours by area per week; an item takes its tag''s area; 0-point blocks are left out'
);
select is(public.analytics_areas('2026-09-07', '2026-09-13') -> 'hours',
  '[{"week": "2026-09-07", "planned_minutes": 300, "done_minutes": 90}]'::jsonb,
  'planned vs done hours count calendar items only, actual minutes first');
select is(public.analytics_areas('2026-09-07', '2026-09-13') -> 'tags',
  '[{"tag_id": "70000000-0000-0000-0000-000000000001", "name": "lfx", "minutes_done": 90, "sessions": 1}]'::jsonb,
  'top tags by hours done');

-- Misses, reschedule chains and estimates ----------------------------------------------------------

select is(public.analytics_misses('2026-09-07', '2026-09-13') -> 'slots',
  '[{"weekday": 1, "hour": 10, "planned": 3, "missed": 0},
    {"weekday": 2, "hour": 18, "planned": 2, "missed": 2},
    {"weekday": 3, "hour": 18, "planned": 2, "missed": 2}]'::jsonb,
  'miss rate by weekday and local start hour, from closed calendar items');
select is(public.analytics_misses('2026-09-07', '2026-09-13') -> 'chains',
  '[{"id": "a0000000-0000-0000-0000-000000000002", "title": "Gym", "logical_date": "2026-09-08", "times": 2, "last_status": "done"}]'::jsonb,
  'a missed task rescheduled twice, done the third time');
select is(public.analytics_misses('2026-09-07', '2026-09-13') -> 'estimate',
  '{"count": 2, "planned_minutes": 90, "actual_minutes": 120, "ratio": 1.33}'::jsonb,
  'estimate accuracy: actual over planned minutes where actual was entered');

-- Heatmap -------------------------------------------------------------------------------------------

select is(
  (select array_agg(x ->> 'band' order by x ->> 'date') from jsonb_array_elements(public.analytics_heatmap(2026)) x),
  array['excellent', 'not_good', 'excellent'], 'the year heatmap has a band per closed day'
);

select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select is(
  jsonb_array_length(public.analytics_heatmap(2026)) + jsonb_array_length(public.analytics_trend('2026-09-07', '2026-09-09')),
  0, 'B sees none of A''s analytics'
);
select is(public.analytics_misses('2026-09-07', '2026-09-13') -> 'chains', '[]'::jsonb, 'nor A''s misses');
reset role;

select * from finish();
rollback;
