begin;
select plan(39);

-- Fixtures: two users, one connected Google account each, one calendar each.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');
select public.svc_save_google_account(
  p_user_id => '11111111-1111-1111-1111-111111111111', p_google_sub => 'sub-a',
  p_scopes => '{}', p_access_token_enc => null, p_access_expires_at => null);
select public.svc_save_google_account(
  p_user_id => '22222222-2222-2222-2222-222222222222', p_google_sub => 'sub-b',
  p_scopes => '{}', p_access_token_enc => null, p_access_expires_at => null);
insert into public.calendars (id, user_id, google_calendar_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a-cal'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'b-cal');

create temp table q_before as select coalesce(max(msg_id), 0) as id from pgmq.q_sync_jobs;
create function pg_temp.new_messages() returns bigint language sql as
  $$ select count(*) from pgmq.q_sync_jobs where msg_id > (select id from q_before) $$;

-- Enabling queues one full sync; asking again does not add messages ----------------------

select is(pg_temp.new_messages(), 0::bigint, 'a disabled calendar queues nothing');
update public.calendars set sync_enabled = true where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is(pg_temp.new_messages(), 1::bigint, 'enabling a calendar queues a sync');
select is(
  (select pending_kind from private.sync_state where source_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'full', 'the queued sync is a full sync'
);
select private.queue_sync('aaaaaaaa-0000-0000-0000-000000000001', 'incremental');
select is(pg_temp.new_messages(), 1::bigint, 'a second request while queued adds no message');
select is(
  (select pending_kind from private.sync_state where source_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'full', 'a weaker request does not downgrade a waiting full sync'
);

-- request_sync, as the user -------------------------------------------------------------

update public.calendars set sync_enabled = true where id = 'bbbbbbbb-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select is(public.request_sync(), 1, 'request_sync queues only the caller''s enabled calendars');
select throws_ok($$ select public.svc_sync_lease('aaaaaaaa-0000-0000-0000-000000000001') $$, '42501', null,
  'users cannot call worker functions');
select throws_ok($$ select private.queue_sync('aaaaaaaa-0000-0000-0000-000000000001', 'full') $$, '42501', null,
  'users cannot reach private queue functions');
reset role;

-- Lease -----------------------------------------------------------------------------------

select is(
  (public.svc_sync_lease('aaaaaaaa-0000-0000-0000-000000000001') ->> 'run_kind'),
  'full', 'the first lease runs a full sync'
);
select ok(
  public.svc_sync_lease('aaaaaaaa-0000-0000-0000-000000000001') is null,
  'a second lease while the first holds returns null'
);
select ok(
  not (select queued from private.sync_state where source_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'leasing consumes the queued request'
);

-- Apply: create, echo-free update, guard, replace -------------------------------------------

select is(
  public.svc_apply_sync_ops('aaaaaaaa-0000-0000-0000-000000000001', $$[
    {"op": "create", "tags": ["lfx", "deep"], "events": [{"kind": "created"}],
     "item": {"title": "PR review", "raw_title": "PR review #lfx #deep", "points": 2,
              "logical_date": "2026-10-20", "start_at": "2026-10-20T12:30:00Z",
              "end_at": "2026-10-20T14:30:00Z", "planned_minutes": 120, "status": "pending",
              "google_event_id": "ev1", "google_etag": "\"e1\""}},
    {"op": "create", "tags": [], "events": [],
     "item": {"title": "Dinner", "raw_title": "Dinner", "points": 0, "logical_date": "2026-10-20",
              "start_at": "2026-10-20T15:00:00Z", "end_at": "2026-10-20T16:00:00Z",
              "status": "ignored", "google_event_id": "ev2", "google_etag": "\"e2\""}}
  ]$$::jsonb),
  '{"applied": 2, "skipped": 0}'::jsonb, 'two items created'
);
select results_eq(
  $$ select t.name::text from public.item_tags it join public.tags t on t.id = it.tag_id
     join public.items i on i.id = it.item_id where i.google_event_id = 'ev1' order by 1 $$,
  $$ values ('deep'), ('lfx') $$,
  'hashtags create tags and links'
);
select is(
  (select user_id from public.items where google_event_id = 'ev1'),
  '11111111-1111-1111-1111-111111111111'::uuid, 'items take the calendar owner''s user id'
);

-- An explicit link from the app survives a title edit (E1).
insert into public.tags (user_id, name) values ('11111111-1111-1111-1111-111111111111', 'manual');
insert into public.item_tags (item_id, tag_id, source)
select i.id, t.id, 'explicit' from public.items i, public.tags t
where i.google_event_id = 'ev1' and t.name = 'manual';

create temp table ev1 as select id from public.items where google_event_id = 'ev1';

select is(
  public.svc_apply_sync_ops('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object(
    'op', 'update', 'id', (select id from ev1),
    'expect', jsonb_build_object('status', 'pending', 'finalized', false),
    'patch', jsonb_build_object('title', 'PR review v2', 'raw_title', 'PR review v2 #lfx', 'google_etag', '"e1b"'),
    'tags', jsonb_build_array('lfx'),
    'events', jsonb_build_array(jsonb_build_object('kind', 'updated'))))),
  '{"applied": 1, "skipped": 0}'::jsonb, 'an update with a matching guard applies'
);
select results_eq(
  $$ select t.name::text, it.source from public.item_tags it join public.tags t on t.id = it.tag_id
     where it.item_id = (select id from ev1) order by 1 $$,
  $$ values ('lfx', 'hashtag'), ('manual', 'explicit') $$,
  'a removed hashtag unlinks; the explicit link stays'
);

select is(
  public.svc_apply_sync_ops('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object(
    'op', 'update', 'id', (select id from ev1),
    'expect', jsonb_build_object('status', 'done', 'finalized', false),
    'patch', jsonb_build_object('title', 'should not apply')))),
  '{"applied": 0, "skipped": 1}'::jsonb, 'an op planned on a stale status is skipped'
);
select is((select title from public.items where id = (select id from ev1)), 'PR review v2',
  'the skipped op changed nothing');

-- M3: miss the original, recreate for the new slot.
select public.svc_apply_sync_ops('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object(
  'op', 'replace', 'id', (select id from ev1),
  'expect', jsonb_build_object('status', 'pending', 'finalized', false),
  'old_patch', jsonb_build_object('status', 'missed', 'miss_reason', 'moved_after_start', 'finalized', true),
  'old_events', jsonb_build_array(jsonb_build_object('kind', 'missed')),
  'item', jsonb_build_object('title', 'PR review v2', 'raw_title', 'PR review v2 #lfx', 'points', 2,
    'logical_date', '2026-10-21', 'start_at', '2026-10-21T12:30:00Z', 'end_at', '2026-10-21T14:30:00Z',
    'planned_minutes', 120, 'status', 'pending', 'google_event_id', 'ev1', 'google_etag', '"e1c"'),
  'tags', jsonb_build_array('lfx'),
  'events', jsonb_build_array(jsonb_build_object('kind', 'created')))));

select results_eq(
  $$ select status, miss_reason, finalized, google_active from public.items where id = (select id from ev1) $$,
  $$ values ('missed'::text, 'moved_after_start'::text, true, false) $$,
  'the original is missed, frozen and no longer mapped to the event'
);
select results_eq(
  $$ select status, logical_date::text, rescheduled_from_id from public.items
     where google_event_id = 'ev1' and google_active $$,
  $$ select 'pending'::text, '2026-10-21'::text, (select id from ev1) $$,
  'the event now maps to a new pending item linked to the original'
);
select is(
  (select count(*)::int from public.item_tags it join public.items i on i.id = it.item_id
   where i.google_event_id = 'ev1' and i.google_active),
  2, 'the new item keeps the hashtag and the explicit link'
);
select is((select count(*)::int from public.items where google_event_id = 'ev1'), 2,
  'history keeps both items');
select throws_ok(
  $$ insert into public.items (user_id, source, points, calendar_id, google_event_id, google_active)
     values ('11111111-1111-1111-1111-111111111111', 'calendar', 1, 'aaaaaaaa-0000-0000-0000-000000000001', 'ev1', true) $$,
  '23505', null, 'only one item can be active for an event'
);
select is(
  (select count(*)::int from public.item_events e join ev1 on e.item_id = ev1.id), 3,
  'every state change writes an audit row'
);

-- Unseen sweep, checkpoint, finish -----------------------------------------------------------

update private.sync_state set window_from = '2026-10-01', window_to = '2026-12-31'
where source_id = 'aaaaaaaa-0000-0000-0000-000000000001';
update public.items set google_seen_at = google_seen_at - interval '1 hour'
where google_event_id = 'ev2';
select is(
  (select array_agg(x ->> 'google_event_id') from public.svc_sync_unseen('aaaaaaaa-0000-0000-0000-000000000001') x),
  array['ev2'], 'an active item the run did not see is reported'
);
select public.svc_apply_sync_ops('aaaaaaaa-0000-0000-0000-000000000001', '[]',
  array[(select id from public.items where google_event_id = 'ev2')]);
select is_empty(
  $$ select * from public.svc_sync_unseen('aaaaaaaa-0000-0000-0000-000000000001') $$,
  'marking an unchanged item as seen clears it from the sweep'
);

select public.svc_sync_checkpoint('aaaaaaaa-0000-0000-0000-000000000001', 'page-2');
select results_eq(
  $$ select page_token, lease_until is null, queued from private.sync_state
     where source_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  $$ values ('page-2'::text, true, true) $$,
  'a checkpoint keeps the page token, frees the lease and re-queues'
);
select results_eq(
  $$ select x ->> 'run_kind', x ->> 'page_token'
     from public.svc_sync_lease('aaaaaaaa-0000-0000-0000-000000000001') x $$,
  $$ values ('full'::text, 'page-2'::text) $$,
  'the next lease continues the same full sync from the saved page'
);

select public.svc_sync_finish('aaaaaaaa-0000-0000-0000-000000000001', 'sync-token-1');
select results_eq(
  $$ select sync_token, page_token, run_kind from private.sync_state
     where source_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  $$ values ('sync-token-1'::text, null::text, null::text) $$,
  'finishing stores the sync token and ends the run'
);
select ok(
  (select last_full_sync_at is not null and last_sync_at is not null from public.calendars
   where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'finishing a full sync stamps the calendar'
);
select is(
  (public.svc_sync_lease('aaaaaaaa-0000-0000-0000-000000000001') ->> 'run_kind'),
  'incremental', 'with a sync token, the next run is incremental'
);

-- A 410 drops the token and queues a full sync.
select public.svc_sync_fail('aaaaaaaa-0000-0000-0000-000000000001', 'gone', null, true);
select results_eq(
  $$ select sync_token, pending_kind from private.sync_state
     where source_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  $$ values (null::text, 'full'::text) $$,
  'a 410 resets to a full sync'
);

-- A reconnect-needed account stops leasing.
select public.svc_mark_reconnect_needed('22222222-2222-2222-2222-222222222222');
select ok(public.svc_sync_lease('bbbbbbbb-0000-0000-0000-000000000001') is null,
  'no lease while Google needs reconnecting');

-- RLS on items -------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select is((select count(*)::int from public.items), 0, 'B sees none of A''s items');
select is((select count(*)::int from public.item_tags), 0, 'B sees none of A''s item tags');
select throws_ok(
  $$ update public.items set status = 'done' $$, '42501', null, 'users cannot write items directly'
);
reset role;

-- Dispatcher ---------------------------------------------------------------------------------

delete from pgmq.q_sync_jobs;
select is(private.dispatch(), false, 'the dispatcher calls nothing when queues are empty');

-- Seeded locally; created here when the seed has not run (CI).
select vault.create_secret('http://kong:8000/functions/v1/worker', 'worker_url')
where not exists (select 1 from vault.secrets where name = 'worker_url');
select vault.create_secret('test-secret', 'worker_secret')
where not exists (select 1 from vault.secrets where name = 'worker_secret');

create temp table req_before as select coalesce(max(id), 0) as id from net.http_request_queue;
select pgmq.send('sync_jobs', '{"source_id": "aaaaaaaa-0000-0000-0000-000000000001"}');
select is(private.dispatch(), true, 'a visible message wakes the worker');
select ok(
  exists (select 1 from net.http_request_queue r
          where r.id > (select id from req_before) and r.url like '%/functions/v1/worker'
            and r.headers ? 'x-worker-secret'),
  'the wake-up call carries the worker secret'
);

select * from finish();
rollback;
