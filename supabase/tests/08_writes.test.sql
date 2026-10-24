begin;
select plan(17);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'a@example.com');
update public.profiles set timezone = 'UTC', day_boundary_hour = 0 where id = '11111111-1111-1111-1111-111111111111';
insert into public.calendars (id, user_id, google_calendar_id, is_primary, access_role, sync_enabled) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'holidays', false, 'reader', true),
  ('c0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a@example.com', true, 'owner', true);
insert into public.items (id, user_id, source, title, raw_title, points, status, logical_date, calendar_id, google_event_id, google_active) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'calendar', 'PR review', 'PR review #lfx', 2, 'pending', current_date, 'c0000000-0000-0000-0000-000000000002', 'ev1', true),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'manual', 'Call bank', 'Call bank', 1, 'pending', current_date, null, null, false);

-- Runs with the test owner's rights, so it can count queued writes while acting as the user.
create function pg_temp.writes() returns bigint language sql security definer as $$
  select count(*) from pgmq.q_google_writes where message ->> 'item_id' like 'a0000000-%' $$;
grant execute on function pg_temp.writes() to authenticated;
delete from pgmq.q_google_writes;

-- The ✓ write-back trigger (3.11) ---------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select public.complete_item('a0000000-0000-0000-0000-000000000001');
select is(pg_temp.writes(), 1::bigint, 'ticking a calendar item queues the ✓ write');
select public.uncomplete_item('a0000000-0000-0000-0000-000000000001');
select is(pg_temp.writes(), 2::bigint, 'unticking queues its removal');
select public.complete_item('a0000000-0000-0000-0000-000000000002');
select is(pg_temp.writes(), 2::bigint, 'a manual task has no event to write to');
reset role;

update public.profiles set writeback_checkmark = false where id = '11111111-1111-1111-1111-111111111111';
update public.items set status = 'done' where id = 'a0000000-0000-0000-0000-000000000001';
select is(pg_temp.writes(), 2::bigint, 'nothing is written when the ✓ setting is off');
update public.profiles set writeback_checkmark = true where id = '11111111-1111-1111-1111-111111111111';

update public.items set status = 'pending' where id = 'a0000000-0000-0000-0000-000000000001';
delete from pgmq.q_google_writes;
update public.items set status = 'ignored' where id = 'a0000000-0000-0000-0000-000000000001';
update public.items set status = 'pending' where id = 'a0000000-0000-0000-0000-000000000001';
select is(pg_temp.writes(), 0::bigint, 'status changes a sync makes (points crossing 0) write nothing');
update public.items set status = 'missed' where id = 'a0000000-0000-0000-0000-000000000001';
update public.items set status = 'done' where id = 'a0000000-0000-0000-0000-000000000001';
select is(pg_temp.writes(), 1::bigint, 'a late mark-done adds the ✓ too');
select ok(private.dispatch(), 'a waiting write wakes the worker');

-- Context and write results -------------------------------------------------------------------------

select is(
  public.svc_write_context('a0000000-0000-0000-0000-000000000001') ->> 'google_calendar_id', 'a@example.com',
  'the write context names the event''s calendar'
);
select public.svc_write_done('a0000000-0000-0000-0000-000000000001', '"e9"', '✓ PR review #lfx');
select results_eq(
  $$ select google_etag, raw_title, title from public.items where id = 'a0000000-0000-0000-0000-000000000001' $$,
  $$ values ('"e9"'::text, '✓ PR review #lfx'::text, 'PR review'::text) $$,
  'the etag and written title are stored; the display title is untouched'
);
select is(
  public.svc_app_context('11111111-1111-1111-1111-111111111111') -> 'calendar' ->> 'google_calendar_id', 'a@example.com',
  'new events go to the writable primary calendar, never a read-only one'
);

-- Planner ops from app-api --------------------------------------------------------------------------

delete from private.sync_state where source_id = 'c0000000-0000-0000-0000-000000000002';
select is(
  public.svc_apply_app_ops('c0000000-0000-0000-0000-000000000002', jsonb_build_array(jsonb_build_object(
    'op', 'create', 'tags', '[]'::jsonb, 'events', '[]'::jsonb,
    'item', jsonb_build_object('id', 'a0000000-0000-0000-0000-000000000009', 'title', 'New', 'raw_title', 'New',
      'points', 2, 'logical_date', current_date, 'start_at', now(), 'end_at', now() + interval '1 hour',
      'status', 'pending', 'google_event_id', 'ev9', 'google_etag', '"n1"')))),
  '{"applied": 1, "skipped": 0}'::jsonb, 'app-api ops apply even before the calendar''s first sync'
);
select ok(exists (select 1 from public.items where id = 'a0000000-0000-0000-0000-000000000009' and google_active),
  'the item takes the id chosen in advance');

-- Scheduling a manual task ---------------------------------------------------------------------------

update public.items set status = 'pending' where id = 'a0000000-0000-0000-0000-000000000002';
create temp table s1 as select public.svc_schedule_prepare('11111111-1111-1111-1111-111111111111',
  'a0000000-0000-0000-0000-000000000002', date_trunc('hour', now()) + interval '26 hours', date_trunc('hour', now()) + interval '27 hours') as s;
select results_eq(
  $$ select source, google_active, planned_minutes, calendar_id from public.items where id = 'a0000000-0000-0000-0000-000000000002' $$,
  $$ values ('calendar'::text, true, 60, 'c0000000-0000-0000-0000-000000000002'::uuid) $$,
  'scheduling turns the task into a calendar item in place'
);
select ok((select s ->> 'google_event_id' ~ '^[0-9a-f]{32}$' from s1), 'with a Google-safe event id');
select public.svc_schedule_abort('a0000000-0000-0000-0000-000000000002', current_date, null);
select results_eq(
  $$ select source, google_active, calendar_id, start_at from public.items where id = 'a0000000-0000-0000-0000-000000000002' $$,
  $$ values ('manual'::text, false, null::uuid, null::timestamptz) $$,
  'a failed Google write turns it back into the task it was'
);
select throws_ok(
  $$ select public.svc_schedule_prepare('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', now(), now() + interval '1 hour') $$,
  'P0002', null, 'only manual tasks can be scheduled'
);

set local role authenticated;
select throws_ok($$ select public.svc_edit_context('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'users cannot call the write service functions');
reset role;

select * from finish();
rollback;
