begin;
select plan(32);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');
update public.profiles set timezone = 'UTC', day_boundary_hour = 0;

create temp table d as
  select private.logical_today('11111111-1111-1111-1111-111111111111') as today;
grant select on d to authenticated;

-- A's day: a 3-point done block, a 2-point pending block, a 0-point block and a deleted one.
insert into public.items (id, user_id, source, title, points, status, logical_date, start_at, planned_minutes) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'calendar', 'Deep work', 3, 'done', (select today from d), now() - interval '3 hours', 120),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'calendar', 'PR review', 2, 'pending', (select today from d), now() - interval '1 hour', 60),
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'calendar', 'Dinner', 0, 'ignored', (select today from d), now(), 60),
  ('a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'calendar', 'Gone', 3, 'deleted', (select today from d), now(), 60),
  ('a0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'calendar', 'Closed', 1, 'missed', (select today from d) - 1, now() - interval '1 day', 60);
update public.items set finalized = true where id = 'a0000000-0000-0000-0000-000000000005';

-- Areas and habits ---------------------------------------------------------------------------

insert into public.areas (id, user_id, name) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Muscular'),
  ('b1000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Rich');
insert into public.habits (id, user_id, title, points, area_id, weekdays, created_at) values
  ('a2000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Gym', 2, 'a1000000-0000-0000-0000-000000000001', 127, now() - interval '2 days'),
  -- Scheduled on no day today: every weekday except today's.
  ('a2000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Not today', 1, null,
    127 - (1 << (extract(isodow from (select today from d))::int - 1)), now() - interval '2 days');

select throws_ok(
  $$ insert into public.habits (user_id, title, points, area_id)
     values ('22222222-2222-2222-2222-222222222222', 'Steal', 1, 'a1000000-0000-0000-0000-000000000001') $$,
  '23503', null, 'a habit cannot use another user''s area'
);

-- day_view as A ------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

create temp table v1 as select public.day_view() as v;
select is((select (v ->> 'date')::date from v1), (select today from d), 'day_view defaults to the logical today');
select is(
  (select array_agg(x ->> 'title' order by x ->> 'title') from v1, jsonb_array_elements(v -> 'items') x),
  array['Deep work', 'Gym', 'PR review'],
  '0-point and deleted items are hidden; today''s scheduled habit is created'
);
select is(
  (select v -> 'score' from v1),
  '{"planned": 7, "done": 3, "missed": 0, "rate": 42.9, "band": "not_good"}'::jsonb,
  'the score matches a hand calculation: 3 of 3+2+2 points'
);
select is(
  (select x ->> 'area_id' from v1, jsonb_array_elements(v -> 'items') x where x ->> 'title' = 'Gym'),
  'a1000000-0000-0000-0000-000000000001', 'the habit item carries its area'
);
select public.day_view();
select is(
  (select count(*)::int from public.items where habit_id = 'a2000000-0000-0000-0000-000000000001'),
  1, 'opening the day again creates no second habit item'
);
select is(
  (select jsonb_array_length(public.day_view((select today from d) + 1) -> 'items')), 0,
  'habit items are created only for today'
);

-- Ticking ------------------------------------------------------------------------------------

select is(
  (public.complete_item('a0000000-0000-0000-0000-000000000002') ->> 'actual_minutes')::int, 60,
  'ticking defaults actual minutes to planned minutes'
);
select is(
  (public.day_view() -> 'score' ->> 'rate')::numeric, 71.4, 'the live score updates after a tick'
);
select is(
  (public.complete_item('a0000000-0000-0000-0000-000000000002', 45) ->> 'actual_minutes')::int, 45,
  'actual minutes can be edited on a done item'
);
select is(
  (public.uncomplete_item('a0000000-0000-0000-0000-000000000002') ->> 'status'), 'pending',
  'unticking returns the item to pending'
);
select is(
  (select actual_minutes from public.items where id = 'a0000000-0000-0000-0000-000000000002'), null,
  'unticking clears actual minutes'
);
select throws_ok(
  $$ select public.complete_item('a0000000-0000-0000-0000-000000000005') $$,
  '22023', null, 'a finalized item cannot be ticked'
);
select throws_ok(
  $$ select public.complete_item('a0000000-0000-0000-0000-000000000004') $$,
  '22023', null, 'a deleted item cannot be ticked'
);
select is(
  (select array_agg(kind order by id) from public.item_events where item_id = 'a0000000-0000-0000-0000-000000000002'),
  array['completed', 'completed', 'uncompleted'], 'ticks and unticks are logged'
);

-- Manual tasks and backlog -------------------------------------------------------------------

create temp table t1 as select public.create_manual_task('Call bank #admin', 1, null, null, array['admin']) as t;
select is((select t ->> 'logical_date' from t1), null, 'a task without a date goes to the backlog');
select is((select jsonb_array_length(public.backlog())), 1, 'backlog lists it');
select is((select t -> 'tags' -> 0 ->> 'name' from t1), 'admin', 'its #tags are linked');
select is(
  (public.update_item_local((select (t ->> 'id')::uuid from t1),
     jsonb_build_object('logical_date', (select today from d), 'points', 3)) ->> 'points')::int,
  3, 'a manual task can be scheduled for today and re-pointed'
);
select is((select jsonb_array_length(public.backlog())), 0, 'scheduling it removes it from the backlog');
select throws_ok(
  $$ select public.update_item_local('a0000000-0000-0000-0000-000000000002', '{"points": 3}') $$,
  '22023', null, 'calendar points cannot be edited (they come from colour)'
);
select throws_ok(
  $$ select public.create_manual_task('x', 4) $$, '22023', null, 'manual points must be 1 to 3'
);
select throws_ok(
  $$ select public.create_manual_task('x', 1, null, 'b1000000-0000-0000-0000-000000000001') $$,
  '23503', null, 'a task cannot use another user''s area'
);
select lives_ok(
  $$ select public.delete_manual_task((select (t ->> 'id')::uuid from t1)) $$, 'a manual task can be deleted'
);
select throws_ok(
  $$ select public.delete_manual_task('a0000000-0000-0000-0000-000000000002') $$,
  '22023', null, 'calendar items are not deleted through this function'
);

-- Another user ---------------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select throws_ok(
  $$ select public.complete_item('a0000000-0000-0000-0000-000000000002') $$,
  'P0002', null, 'B cannot tick A''s item'
);
select is((select count(*)::int from public.habits), 0, 'B sees none of A''s habits');
select is((select count(*)::int from public.areas), 1, 'B sees only its own areas');
select is(
  (select jsonb_array_length(public.day_view() -> 'items')), 0, 'B''s day shows none of A''s items'
);
reset role;

-- Habit changes ------------------------------------------------------------------------------

update public.habits set points = 3, title = 'Gym session' where id = 'a2000000-0000-0000-0000-000000000001';
select results_eq(
  $$ select title, points::int from public.items where habit_id = 'a2000000-0000-0000-0000-000000000001' $$,
  $$ values ('Gym session'::text, 3) $$, 'editing a habit updates today''s item'
);
update public.habits set active = false where id = 'a2000000-0000-0000-0000-000000000001';
select is(
  (select status from public.items where habit_id = 'a2000000-0000-0000-0000-000000000001'), 'deleted',
  'pausing a habit removes today''s open item'
);

select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'items'),
  'items changes are published to Realtime'
);

select * from finish();
rollback;
