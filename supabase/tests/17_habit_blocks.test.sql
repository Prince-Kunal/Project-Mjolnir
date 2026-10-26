begin;
select plan(12);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'a@example.com');
update public.profiles set timezone = 'UTC', day_boundary_hour = 0;

create temp table d as
  select private.logical_today('11111111-1111-1111-1111-111111111111') as today;

insert into public.areas (id, user_id, name) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Muscular');
insert into public.habits (id, user_id, title, points, area_id, weekdays, created_at) values
  ('a2000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Workout', 2,
   'a1000000-0000-0000-0000-000000000001', 127, now() - interval '2 days');
select private.ensure_habit_items('11111111-1111-1111-1111-111111111111', (select today from d));
select private.ensure_habit_items('11111111-1111-1111-1111-111111111111', (select today from d) + 1);

create function pg_temp.habit_item(p_day date) returns text language sql as $$
  select status from public.items
  where source = 'habit' and habit_id = 'a2000000-0000-0000-0000-000000000001' and logical_date = p_day $$;

-- A block named like the habit schedules it ----------------------------------------------------

-- Ticked before it was scheduled: the block inherits the tick.
update public.items set status = 'done', completed_at = now()
where source = 'habit' and logical_date = (select today from d);

-- A grey (0-point) block named "workout " still counts as the habit.
insert into public.items (id, user_id, source, title, raw_title, points, status, logical_date, start_at, end_at) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'calendar', 'workout ', 'workout ',
   0, 'ignored', (select today from d), now(), now() + interval '1 hour');

select results_eq(
  $$ select habit_id, points, status, area_id from public.items where id = 'a0000000-0000-0000-0000-000000000001' $$,
  $$ values ('a2000000-0000-0000-0000-000000000001'::uuid, 2::smallint, 'done'::text, 'a1000000-0000-0000-0000-000000000001'::uuid) $$,
  'the block becomes the habit: its points, its area and its tick'
);
select is(pg_temp.habit_item((select today from d)), 'deleted', 'the day''s habit item is set aside, not doubled');
select is(
  (private.day_score('11111111-1111-1111-1111-111111111111', (select today from d)) ->> 'planned')::int, 2,
  'the day counts the habit once'
);

update public.items set points = 1 where id = 'a0000000-0000-0000-0000-000000000001';
select is((select points::int from public.items where id = 'a0000000-0000-0000-0000-000000000001'), 2,
  'a colour change in Google cannot reprice the habit');

-- Tomorrow's habit item is taken over; ensuring habits again does not bring it back.
insert into public.items (id, user_id, source, title, raw_title, points, status, logical_date, start_at, end_at) values
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'calendar', 'Workout', 'Workout',
   1, 'pending', (select today from d) + 1, now() + interval '1 day', now() + interval '25 hours');
select private.ensure_habit_items('11111111-1111-1111-1111-111111111111', (select today from d) + 1);
select is(
  (select count(*)::int from public.items
   where habit_id = 'a2000000-0000-0000-0000-000000000001' and logical_date = (select today from d) + 1
     and status <> 'deleted'),
  1, 'one item for the habit tomorrow: the block');

-- Leaving the habit gives the day back to it.
update public.items set logical_date = (select today from d) + 2 where id = 'a0000000-0000-0000-0000-000000000002';
select is(pg_temp.habit_item((select today from d) + 1), 'pending', 'moving the block away restores the habit item');
select is((select habit_id from public.items where id = 'a0000000-0000-0000-0000-000000000002'),
  'a2000000-0000-0000-0000-000000000001'::uuid, 'and the block schedules the habit on its new day');

update public.items set title = 'Reading' where id = 'a0000000-0000-0000-0000-000000000002';
select is((select habit_id from public.items where id = 'a0000000-0000-0000-0000-000000000002'), null,
  'a renamed block is a plain block again');

update public.items set status = 'deleted' where id = 'a0000000-0000-0000-0000-000000000001';
select is(pg_temp.habit_item((select today from d)), 'pending', 'deleting the block brings the habit item back');

-- Other names, other sources ------------------------------------------------------------------

insert into public.items (id, user_id, source, title, raw_title, points, status, logical_date) values
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'calendar', 'Workout plan', 'Workout plan',
   1, 'pending', (select today from d)),
  ('a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'manual', 'Workout', 'Workout',
   1, 'pending', (select today from d));
select is((select habit_id from public.items where id = 'a0000000-0000-0000-0000-000000000003'), null,
  'only the exact name links');
select is((select habit_id from public.items where id = 'a0000000-0000-0000-0000-000000000004'), null,
  'manual tasks are left alone');

-- Archiving the habit releases its blocks.
insert into public.items (id, user_id, source, title, raw_title, points, status, logical_date) values
  ('a0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'calendar', 'Workout', 'Workout',
   1, 'pending', (select today from d) + 3);
update public.habits set archived_at = now() where id = 'a2000000-0000-0000-0000-000000000001';
select is((select habit_id from public.items where id = 'a0000000-0000-0000-0000-000000000005'), null,
  'archiving the habit turns its blocks back into plain blocks');

select * from finish();
rollback;
