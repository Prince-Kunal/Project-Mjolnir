begin;
select plan(21);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'a@example.com');
select public.svc_save_google_account(
  p_user_id => '11111111-1111-1111-1111-111111111111', p_google_sub => 'sub-a',
  p_scopes => '{}', p_access_token_enc => null, p_access_expires_at => null);
insert into public.calendars (id, user_id, google_calendar_id) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('c0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'work');

-- Other users may exist in a local database: every check looks only at this user's calendars.
create function pg_temp.mine(p_kind text) returns setof jsonb language sql as
  $$ select message from pgmq.q_jobs where message ->> 'kind' = p_kind
     and (message ->> 'calendar_id' like 'c0000000-%' or message ->> 'channel_id' like 'd0000000-%') $$;
create function pg_temp.jobs(p_kind text) returns bigint language sql as
  $$ select count(*) from pg_temp.mine(p_kind) $$;
create function pg_temp.polled(p_id uuid) returns boolean language sql as
  $$ select queued from private.sync_state where source_id = p_id $$;
delete from pgmq.q_jobs;

-- Without a webhook address (local development) nothing touches channels ----------------------

delete from vault.secrets where name = 'google_webhook_url';
update public.calendars set sync_enabled = true where id = 'c0000000-0000-0000-0000-000000000001';
select is(pg_temp.jobs('watch'), 0::bigint, 'locally, enabling a calendar queues no watch channel');
select is(private.queue_renewals(), 0, 'locally, renewals do nothing');

-- With one (hosted) ------------------------------------------------------------------------------

select vault.create_secret('https://example.supabase.co/functions/v1/google-webhook', 'google_webhook_url');
update public.calendars set sync_enabled = true where id = 'c0000000-0000-0000-0000-000000000002';
select is(pg_temp.jobs('watch'), 1::bigint, 'enabling a calendar queues a watch channel');
select is(
  (select m ->> 'address' from pg_temp.mine('watch') m),
  'https://example.supabase.co/functions/v1/google-webhook', 'the job carries the webhook address'
);
select ok(private.dispatch(), 'a waiting job wakes the worker');

-- Channels as the worker would save them.
select public.svc_channel_save('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111', 'res-1', 'hash-1', now() + interval '6 hours');
select public.svc_channel_save('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
  '11111111-1111-1111-1111-111111111111', 'res-2', 'hash-2', now() + interval '6 days');
delete from pgmq.q_jobs;

select private.queue_renewals();
select is(pg_temp.jobs('watch'), 1::bigint, 'one channel expires within 24 hours');
select is(
  (select m ->> 'replace' from pg_temp.mine('watch') m),
  'd0000000-0000-0000-0000-000000000001', 'its renewal names the channel it replaces'
);

-- A renewal already in place stops the old channel from being renewed again.
delete from pgmq.q_jobs;
select public.svc_channel_save('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111', 'res-3', 'hash-3', now() + interval '7 days');
select private.queue_renewals();
select is(pg_temp.jobs('watch'), 0::bigint, 'nothing to do once the new channel exists');

update public.calendars set sync_enabled = false where id = 'c0000000-0000-0000-0000-000000000002';
select is(
  (select m ->> 'channel_id' from pg_temp.mine('stop_channel') m),
  'd0000000-0000-0000-0000-000000000002', 'disabling a calendar stops its channel'
);

select public.svc_channel_stopped('d0000000-0000-0000-0000-000000000001');
select is(
  (public.svc_watch_context('c0000000-0000-0000-0000-000000000001') -> 'channels' -> 0 ->> 'id'),
  'd0000000-0000-0000-0000-000000000003', 'stopped channels drop out of the healthy list'
);
select is(
  (public.svc_channel_get('d0000000-0000-0000-0000-000000000003') ->> 'token_hash'), 'hash-3',
  'the webhook can look a channel up'
);

-- A calendar Google refuses to watch is left to polling until it is enabled again.
delete from pgmq.q_jobs;
select public.svc_mark_push_unsupported('c0000000-0000-0000-0000-000000000002', '400 pushNotSupportedForRequestedResource');
select private.queue_watch('c0000000-0000-0000-0000-000000000002');
select is(pg_temp.jobs('watch'), 0::bigint, 'a calendar that refused push is not queued again');
update public.calendars set sync_enabled = true where id = 'c0000000-0000-0000-0000-000000000002';
select is(pg_temp.jobs('watch'), 1::bigint, 'enabling it again gives push another try');

-- Polls --------------------------------------------------------------------------------------------

update public.calendars set last_sync_at = now() where id = 'c0000000-0000-0000-0000-000000000001';
delete from pgmq.q_sync_jobs;
update private.sync_state set queued = false;
select private.queue_polls();
select is(pg_temp.polled('c0000000-0000-0000-0000-000000000001'), false,
  'a calendar with a healthy channel and a fresh sync is not polled');
select public.svc_channel_stopped('d0000000-0000-0000-0000-000000000003');
select private.queue_polls();
select is(pg_temp.polled('c0000000-0000-0000-0000-000000000001'), true, 'without a healthy channel it is polled');

-- Nightly reconcile ------------------------------------------------------------------------------

-- A fixed-offset zone where it is now between 04:00 and 22:59, so the reconcile is due.
update public.profiles set onboarded_at = now(), timezone = (
  select name from pg_timezone_names
  where name like 'Etc/GMT%' and extract(hour from now() at time zone name) between 4 and 22
  order by name limit 1)
where id = '11111111-1111-1111-1111-111111111111';
update private.sync_state set sync_token = 'tok-1', queued = false, pending_kind = null
where source_id = 'c0000000-0000-0000-0000-000000000001';
delete from pgmq.q_sync_jobs;
select private.schedule_due_jobs();
select is(
  (select pending_kind from private.sync_state where source_id = 'c0000000-0000-0000-0000-000000000001'),
  'reconcile', 'after 03:00 local time each synced calendar gets its daily reconcile'
);
update private.sync_state set queued = false, pending_kind = null;
select private.schedule_due_jobs();
select is(
  (select pending_kind from private.sync_state where source_id = 'c0000000-0000-0000-0000-000000000001'),
  null, 'only once a day'
);

update private.sync_state set pending_kind = 'reconcile' where source_id = 'c0000000-0000-0000-0000-000000000001';
select is(public.svc_sync_lease('c0000000-0000-0000-0000-000000000001') ->> 'run_kind', 'reconcile',
  'the reconcile runs as a bounded re-list');
select public.svc_sync_finish('c0000000-0000-0000-0000-000000000001', 'bounded-token');
select is(
  (select sync_token from private.sync_state where source_id = 'c0000000-0000-0000-0000-000000000001'),
  'tok-1', 'a reconcile keeps the incremental sync token'
);

-- Access ----------------------------------------------------------------------------------------------

set local role anon;
select is(public.ping(), 'ok', 'the keep-alive ping is open to the publishable key');
reset role;
set local role authenticated;
select throws_ok($$ select public.svc_channel_get('d0000000-0000-0000-0000-000000000003') $$, '42501', null,
  'users cannot read channels');
reset role;

select * from finish();
rollback;
