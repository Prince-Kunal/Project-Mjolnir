begin;
select plan(17);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'a@example.com');
update public.profiles set timezone = 'UTC', day_boundary_hour = 0, onboarded_at = now()
where id = '11111111-1111-1111-1111-111111111111';
insert into private.google_accounts (user_id, google_sub, email, status)
values ('11111111-1111-1111-1111-111111111111', 'sub-a', 'a@example.com', 'ok');
insert into public.calendars (id, user_id, google_calendar_id, sync_enabled, access_role) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a@example.com', true, 'owner');
select public.svc_upsert_task_lists('11111111-1111-1111-1111-111111111111',
  '[{"id": "list-1", "title": "My Tasks"}, {"id": "list-2", "title": "Work"}]');

create function pg_temp.queued(p_id uuid) returns boolean language sql as $$
  select coalesce((select queued from private.sync_state where source_id = p_id), false) $$;
create function pg_temp.task_writes() returns bigint language sql security definer as $$
  select count(*) from pgmq.q_google_writes where message ->> 'kind' = 'task_status' $$;
grant execute on function pg_temp.task_writes() to authenticated;
delete from pgmq.q_google_writes;

select is((select array_agg(title order by title) from public.task_lists), array['My Tasks', 'Work'],
  'task lists are stored from Google');
update public.task_lists set sync_enabled = true where google_tasklist_id = 'list-1';
select ok(pg_temp.queued((select id from public.task_lists where google_tasklist_id = 'list-1')),
  'enabling a list queues its first sync');
select is(public.svc_task_lease((select id from public.task_lists where google_tasklist_id = 'list-1')), null,
  'but it does not run while the day lives in events');

-- Switching modes (3.13) ---------------------------------------------------------------------------

update private.sync_state set queued = false, lease_until = null;
update public.profiles set google_item_type = 'tasks' where id = '11111111-1111-1111-1111-111111111111';
select isnt((select google_item_type_since from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  '-infinity'::timestamptz, 'switching records when');
select ok(pg_temp.queued((select id from public.task_lists where google_tasklist_id = 'list-1')),
  'and queues the enabled lists');
select is(public.svc_sync_lease('c0000000-0000-0000-0000-000000000001'), null, 'calendars stop syncing');

select is(
  public.svc_task_lease((select id from public.task_lists where google_tasklist_id = 'list-1'))
    - 'run_started_at' - 'source_id' - 'user_id',
  jsonb_build_object('google_tasklist_id', 'list-1', 'run_kind', 'full', 'updated_min', null,
    'page_token', null, 'attempts', 0, 'points', 1, 'since', current_date,
    'profile', jsonb_build_object('timezone', 'UTC', 'day_boundary_hour', 0)),
  'a list''s first run is a full one, importing from the switch date with the list''s points'
);

-- Applying task ops ---------------------------------------------------------------------------------

select public.svc_apply_task_ops((select id from public.task_lists where google_tasklist_id = 'list-1'), jsonb_build_array(
  jsonb_build_object('op', 'create', 'tags', '["lfx"]'::jsonb, 'events', '[{"kind": "created"}]'::jsonb, 'item', jsonb_build_object(
    'id', 'a0000000-0000-0000-0000-000000000001', 'title', 'Read paper', 'raw_title', 'Read paper #lfx', 'points', 2,
    'logical_date', current_date, 'start_at', current_date::timestamptz, 'status', 'pending',
    'google_task_id', 't1', 'google_etag', '"1"'))));
select is((select source || ':' || status || ':' || logical_date from public.items where id = 'a0000000-0000-0000-0000-000000000001'),
  'gtask:pending:' || current_date, 'a task becomes a pending item for its due date');

select public.svc_apply_task_ops((select id from public.task_lists where google_tasklist_id = 'list-1'), jsonb_build_array(
  jsonb_build_object('op', 'update', 'id', 'a0000000-0000-0000-0000-000000000001',
    'expect', jsonb_build_object('status', 'pending', 'finalized', false),
    'patch', jsonb_build_object('status', 'done', 'completed_at', now(), 'google_etag', '"2"'), 'events', '[]'::jsonb)));
select is((select status from public.items where id = 'a0000000-0000-0000-0000-000000000001'), 'done',
  'completing it in Google ticks the item');
select is(pg_temp.task_writes(), 0::bigint, 'and is not written back to Google');

select public.svc_apply_task_ops((select id from public.task_lists where google_tasklist_id = 'list-1'), jsonb_build_array(
  jsonb_build_object('op', 'update', 'id', 'a0000000-0000-0000-0000-000000000001',
    'expect', jsonb_build_object('status', 'pending', 'finalized', false),
    'patch', jsonb_build_object('title', 'stale'), 'events', '[]'::jsonb)));
select is((select title from public.items where id = 'a0000000-0000-0000-0000-000000000001'), 'Read paper',
  'an op planned against an older status is skipped');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select public.uncomplete_item('a0000000-0000-0000-0000-000000000001');
select is(pg_temp.task_writes(), 1::bigint, 'unticking in the app reopens the task in Google');
select public.update_item_local('a0000000-0000-0000-0000-000000000001', '{"points": 3, "planned_minutes": 45}');
select is((select points || '/' || planned_minutes from public.items where id = 'a0000000-0000-0000-0000-000000000001'), '3/45',
  'a Google task takes points and an estimate set in the app');
select throws_ok($$ select public.update_item_local('a0000000-0000-0000-0000-000000000001', '{"title": "x"}') $$,
  '22023', null, 'but its title comes from Google');
select is(public.request_sync(), 1, 'a foreground sync asks for the lists, not the calendars');
reset role;

select public.svc_task_finish((select id from public.task_lists where google_tasklist_id = 'list-1'));
select ok(
  (select sync_token from private.sync_state where source_id = (select id from public.task_lists where google_tasklist_id = 'list-1'))
    ~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$',
  'a finished run leaves the next poll''s updatedMin'
);
update private.sync_state set queued = false;
update public.task_lists set last_sync_at = now() - interval '20 minutes';
update public.calendars set last_sync_at = now() - interval '20 minutes';
select private.queue_polls();
select is(
  array[pg_temp.queued((select id from public.task_lists where google_tasklist_id = 'list-1')),
        pg_temp.queued('c0000000-0000-0000-0000-000000000001')],
  array[true, false], 'the 10-minute poll covers task lists in Tasks mode and skips calendars');

select * from finish();
rollback;
