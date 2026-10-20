begin;
select plan(38);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');
update public.profiles set timezone = 'UTC', day_boundary_hour = 0, onboarded_at = now() - interval '2 days'
where id = '11111111-1111-1111-1111-111111111111';

create temp table d as select private.logical_today('11111111-1111-1111-1111-111111111111') as today;
grant select on d to authenticated;
-- Start the week two days ago, so both closed days share one week whatever today is.
update public.profiles set week_start = extract(isodow from (select today from d) - 2)::int
where id = '11111111-1111-1111-1111-111111111111';

insert into public.calendars (id, user_id, google_calendar_id, is_primary, access_role, sync_enabled) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a@example.com', true, 'owner', true);
insert into public.habits (id, user_id, title, points, created_at) values
  ('a2000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Gym', 1, now() - interval '5 days');
insert into public.tags (id, user_id, name) values
  ('a3000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'lfx');

-- Two days ago: a done block (3), a pending block (2), a pending manual task (1), a habit (1),
-- a 0-point block and a deleted one.
insert into public.items (id, user_id, source, title, raw_title, points, status, logical_date, start_at, end_at, planned_minutes, calendar_id, habit_id, google_event_id, google_active) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'calendar', 'Deep work', 'Deep work', 3, 'done', (select today from d) - 2, now() - interval '2 days', now() - interval '2 days' + interval '2 hours', 120, 'c0000000-0000-0000-0000-000000000001', null, 'ev1', true),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'calendar', 'PR review', 'PR review #lfx', 2, 'pending', (select today from d) - 2, now() - interval '2 days' + interval '3 hours', now() - interval '2 days' + interval '4 hours', 60, 'c0000000-0000-0000-0000-000000000001', null, 'ev2', true),
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'manual', 'Call bank', 'Call bank', 1, 'pending', (select today from d) - 2, null, null, null, null, null, null, false),
  ('a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'habit', 'Gym', 'Gym', 1, 'pending', (select today from d) - 2, null, null, null, null, 'a2000000-0000-0000-0000-000000000001', null, false),
  ('a0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'calendar', 'Dinner', 'Dinner', 0, 'ignored', (select today from d) - 2, null, null, null, 'c0000000-0000-0000-0000-000000000001', null, 'ev5', true),
  ('a0000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'calendar', 'Gone', 'Gone', 3, 'deleted', (select today from d) - 2, null, null, null, 'c0000000-0000-0000-0000-000000000001', null, 'ev6', true);
insert into public.item_tags (item_id, tag_id, source) values
  ('a0000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001', 'hashtag');

-- Due jobs close every finished day since onboarding, oldest first, but not today -------------

select is(private.schedule_due_jobs(), 2, 'two finished days are closed (two days ago and yesterday)');
select is(private.schedule_due_jobs(), 0, 'running the job again closes nothing new');
select ok(
  not exists (select 1 from public.day_summaries where logical_date = (select today from d)),
  'today is not judged until its close'
);
select is(
  (select count(*)::int from public.items where habit_id = 'a2000000-0000-0000-0000-000000000001' and logical_date = (select today from d)),
  1, 'the due job creates habit items for the new day'
);

select results_eq(
  $$ select status, miss_reason, finalized, inbox_state from public.items
     where id in ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003') order by id $$,
  $$ values ('missed'::text, 'day_close'::text, true, 'open'::text), ('missed', 'day_close', true, 'open') $$,
  'pending calendar and manual items become missed and enter the inbox'
);
select results_eq(
  $$ select status, finalized, inbox_state from public.items where id = 'a0000000-0000-0000-0000-000000000004' $$,
  $$ values ('missed'::text, true, 'none'::text) $$,
  'a missed habit is counted but stays out of the inbox'
);
select results_eq(
  $$ select status, finalized from public.items
     where id in ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000006') order by id $$,
  $$ values ('done'::text, true), ('ignored', true), ('deleted', true) $$,
  'every other item on the day is frozen as it was'
);
select results_eq(
  $$ select planned_points, done_points, missed_points, success_rate, band from public.day_summaries
     where user_id = '11111111-1111-1111-1111-111111111111' and logical_date = (select today from d) - 2 $$,
  $$ values (7, 3, 4, 42.9::numeric, 'not_good'::text) $$,
  'the day''s score is frozen: 3 of 7 points'
);
select results_eq(
  $$ select planned_points, success_rate, rest_pass_used, streak_after from public.day_summaries
     where user_id = '11111111-1111-1111-1111-111111111111' order by logical_date $$,
  $$ values (7, 42.9::numeric, true, 0), (0, 0::numeric, false, 0) $$,
  'two bad days: the first uses the pass; an empty day counts as under 50%'
);
select ok(
  not exists (select 1 from public.day_summaries where user_id = '22222222-2222-2222-2222-222222222222'),
  'users who have not finished onboarding are not closed'
);

-- Finalized items ignore later calendar edits and ticks ----------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

select throws_ok($$ select public.complete_item('a0000000-0000-0000-0000-000000000002') $$, '22023', null,
  'a closed day''s item cannot be ticked normally');

-- Missed inbox --------------------------------------------------------------------------------

select is(
  (select array_agg(x ->> 'title' order by x ->> 'title') from jsonb_array_elements(public.missed_inbox()) x),
  array['Call bank', 'PR review'], 'the inbox lists missed calendar and manual items'
);
select ok(
  (select (x ->> 'late_done_until')::timestamptz > now() from jsonb_array_elements(public.missed_inbox()) x limit 1),
  'each inbox item says until when it can be marked done'
);
select is((public.day_view() ->> 'missed_open')::int, 2, 'day_view reports the open inbox count');

-- Mark done (forgot to tick): re-scores the day and walks the streak again.
select is(
  (public.mark_late_done('a0000000-0000-0000-0000-000000000002') ->> 'marked_late')::boolean, true,
  'a late mark-done is flagged'
);
select results_eq(
  $$ select done_points, success_rate, band, counts, streak_after from public.day_summaries
     where user_id = '11111111-1111-1111-1111-111111111111' and logical_date = (select today from d) - 2 $$,
  $$ values (5, 71.4::numeric, 'fair'::text, true, 1) $$,
  'the day is re-scored to 5 of 7 and now counts toward the streak'
);
select is(
  (select rest_pass_used from public.day_summaries where user_id = '11111111-1111-1111-1111-111111111111'
   and logical_date = (select today from d) - 1),
  true, 'the later empty day now uses the pass instead (recomputed from the changed day)'
);
select is((public.streak() ->> 'current')::int, 1, 'the current streak follows');
select lives_ok($$ select public.mark_late_done('a0000000-0000-0000-0000-000000000004') $$,
  'a habit missed at close can be marked done late too');
select throws_ok($$ select public.mark_late_done('a0000000-0000-0000-0000-000000000001') $$, '22023', null,
  'a done item cannot be marked done late');

reset role;
update public.day_summaries set finalized_at = now() - interval '49 hours'
where user_id = '11111111-1111-1111-1111-111111111111' and logical_date = (select today from d) - 2;
set local role authenticated;
select throws_ok($$ select public.mark_late_done('a0000000-0000-0000-0000-000000000003') $$, '22023', null,
  'after 48 hours a miss stays a miss');

-- Reschedule a manual task to a date without a time.
select throws_ok(
  $$ select public.reschedule_manual('a0000000-0000-0000-0000-000000000003', (select today from d) - 1) $$,
  '22023', null, 'cannot reschedule into the past'
);
create temp table r1 as select public.reschedule_manual('a0000000-0000-0000-0000-000000000003', (select today from d) + 1) as n;
select results_eq(
  $$ select status, logical_date, rescheduled_from_id from public.items where id = (select (n ->> 'id')::uuid from r1) $$,
  $$ select 'pending'::text, (select today from d) + 1, 'a0000000-0000-0000-0000-000000000003'::uuid $$,
  'the new task is pending on the new day and linked to the original'
);
select results_eq(
  $$ select status, inbox_state from public.items where id = 'a0000000-0000-0000-0000-000000000003' $$,
  $$ values ('missed'::text, 'rescheduled'::text) $$,
  'the original stays missed on its day and leaves the inbox'
);
select is(
  (select planned_points from public.day_summaries where user_id = '11111111-1111-1111-1111-111111111111'
   and logical_date = (select today from d) - 2), 7,
  'the original day still counts the miss'
);
select throws_ok(
  $$ select public.reschedule_manual('a0000000-0000-0000-0000-000000000002', (select today from d)) $$,
  '22023', null, 'calendar events need a time and go through app-api'
);

-- Daily note and tables.
insert into public.daily_notes (user_id, logical_date, body)
values ('11111111-1111-1111-1111-111111111111', (select today from d) - 1, 'Travel day');
select results_eq(
  $$ select (x ->> 'finalized')::boolean, x ->> 'note' from jsonb_array_elements(
       public.days_range((select today from d) - 2, (select today from d))) x order by x ->> 'date' $$,
  $$ values (true, null::text), (true, 'Travel day'), (false, null) $$,
  'the week table shows closed days, today live, and notes'
);
select is(
  (select (x ->> 'rate')::numeric from jsonb_array_elements(public.days_range((select today from d) - 2, (select today from d) - 2)) x),
  85.7, 'closed days show their frozen rate, including late marks: 6 of 7'
);
select throws_ok($$ select public.days_range('2026-01-01', '2026-06-01') $$, '22023', null, 'ranges are bounded');
select is(
  (select sum((m ->> 'points_done')::int) from jsonb_array_elements(public.months_summary(extract(year from (select today from d))::int)) m),
  6::bigint, 'the month table sums closed days'
);
select is(
  public.dismiss_all_missed(), 0, 'nothing left to dismiss once handled'
);

-- Another user.
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select is(jsonb_array_length(public.missed_inbox()), 0, 'B sees none of A''s inbox');
select is((select count(*)::int from public.day_summaries), 0, 'B sees none of A''s summaries');
select is((select count(*)::int from public.daily_notes), 0, 'B sees none of A''s notes');
select throws_ok(
  $$ select public.svc_reschedule_prepare('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000002', now() + interval '1 day', now() + interval '25 hours') $$,
  '42501', null, 'users cannot call the reschedule service functions'
);
reset role;

-- Calendar reschedule service functions (app-api) ------------------------------------------------

update public.items set status = 'missed', inbox_state = 'open', marked_late = false
where id = 'a0000000-0000-0000-0000-000000000002';
create temp table p1 as select public.svc_reschedule_prepare('11111111-1111-1111-1111-111111111111',
  'a0000000-0000-0000-0000-000000000002', date_trunc('hour', now()) + interval '1 day', date_trunc('hour', now()) + interval '25 hours') as p;
select ok(
  (select p ->> 'google_event_id' ~ '^[0-9a-f]{32}$' and p ->> 'google_calendar_id' = 'a@example.com'
     and p ->> 'summary' = 'PR review #lfx' and p -> 'tags' = '["lfx"]'::jsonb from p1),
  'prepare returns a Google-safe event id, the calendar, the full title and tags'
);
select results_eq(
  $$ select status, logical_date, google_active, planned_minutes from public.items where id = (select (p ->> 'item_id')::uuid from p1) $$,
  $$ select 'pending'::text, (select today from d) + 1, true, 60 $$,
  'the new item is pending on the new day and already mapped to its event'
);
select public.svc_reschedule_abort((select (p ->> 'item_id')::uuid from p1));
select results_eq(
  $$ select count(*)::int, max(inbox_state) from public.items
     where id = 'a0000000-0000-0000-0000-000000000002' or rescheduled_from_id = 'a0000000-0000-0000-0000-000000000002' $$,
  $$ values (1, 'open'::text) $$,
  'a failed Google write undoes the reschedule and reopens the inbox item'
);

select * from finish();
rollback;
