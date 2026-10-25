begin;
select plan(17);

-- A works in UTC with a midnight boundary: logical days are calendar days, and p_now picks the time.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');
update public.profiles set timezone = 'UTC', day_boundary_hour = 0, onboarded_at = now() - interval '10 days',
  morning_prompt_time = '08:00', evening_reminder_time = '22:30'
where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

create function pg_temp.pushes(p_user uuid, p_tag text default null) returns bigint language sql security definer as $$
  select count(*) from pgmq.q_jobs
  where message ->> 'kind' = 'push' and message ->> 'user_id' = p_user::text
    and (p_tag is null or message ->> 'tag' = p_tag) $$;
create function pg_temp.at(p_day int, p_time text) returns timestamptz language sql as $$
  select ((current_date + p_day) + p_time::time) at time zone 'UTC' $$;
grant execute on function pg_temp.pushes(uuid, text) to authenticated;
delete from pgmq.q_jobs;

-- Devices -------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select public.save_push_subscription('https://push.example/a1', 'p256dh-a1', 'auth-a1', 'Phone');
select public.save_push_subscription('https://push.example/shared', 'p256dh-s', 'auth-s', 'Laptop');
select is((select count(*) from public.push_subscriptions), 2::bigint, 'A saves two devices');
select public.save_push_subscription('https://push.example/a1', 'p256dh-a1b', 'auth-a1b', 'Phone');
select is((select p256dh from public.push_subscriptions where endpoint = 'https://push.example/a1'), 'p256dh-a1b',
  'saving a device again refreshes its keys');

select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select is((select count(*) from public.push_subscriptions), 0::bigint, 'B sees none of A''s devices');
select throws_ok($$ select public.send_test_push() $$, 'P0002', null, 'a test needs a device');
select public.save_push_subscription('https://push.example/shared', 'p256dh-s2', 'auth-s2', 'Laptop');
select is((select count(*) from public.push_subscriptions), 1::bigint,
  'a device shared between accounts goes to whoever turned notifications on last');
select public.send_test_push();
select is(pg_temp.pushes('22222222-2222-2222-2222-222222222222', 'test'), 1::bigint, 'a test notification is queued');
reset role;
delete from public.push_subscriptions where user_id = '22222222-2222-2222-2222-222222222222';
delete from pgmq.q_jobs;

-- Prompts (section 10: morning prompt, evening reminder, deadline warnings) --------------------------

insert into public.items (user_id, source, title, points, status, logical_date, inbox_state, finalized) values
  ('11111111-1111-1111-1111-111111111111', 'manual', 'Gym', 2, 'missed', current_date - 1, 'open', true),
  ('11111111-1111-1111-1111-111111111111', 'manual', 'Write report', 3, 'pending', current_date, 'none', false),
  ('22222222-2222-2222-2222-222222222222', 'manual', 'B''s miss', 1, 'missed', current_date - 1, 'open', true);
insert into public.deadlines (user_id, title, start_date, due_date) values
  ('11111111-1111-1111-1111-111111111111', 'GSoC proposal', current_date - 5, current_date + 3);

select private.queue_push_prompts(pg_temp.at(0, '07:30'));
select is(pg_temp.pushes('11111111-1111-1111-1111-111111111111'), 0::bigint, 'nothing before the morning prompt time');

select private.queue_push_prompts(pg_temp.at(0, '08:05'));
select is(pg_temp.pushes('11111111-1111-1111-1111-111111111111', 'morning'), 1::bigint,
  'after 08:00, the morning prompt names the open misses');
select is(
  (select message ->> 'url' from pgmq.q_jobs where message ->> 'tag' = 'morning'), '/missed',
  'and opens the missed inbox'
);
select is(pg_temp.pushes('11111111-1111-1111-1111-111111111111', 'deadlines'), 1::bigint,
  'a deadline with no sessions in its warning window is announced with it');
select is(pg_temp.pushes('22222222-2222-2222-2222-222222222222'), 0::bigint,
  'a user with no device gets nothing queued');

select private.queue_push_prompts(pg_temp.at(0, '08:10'));
select is(pg_temp.pushes('11111111-1111-1111-1111-111111111111'), 2::bigint, 'each prompt is sent once a day');

select private.queue_push_prompts(pg_temp.at(1, '12:00'));
select is(pg_temp.pushes('11111111-1111-1111-1111-111111111111', 'morning'), 1::bigint,
  'a prompt more than 3 hours late is skipped rather than sent stale');

select private.queue_push_prompts(pg_temp.at(0, '22:40'));
select is(
  (select message ->> 'title' from pgmq.q_jobs where message ->> 'tag' = 'evening'), '3 points still open',
  'the evening reminder counts what is left today'
);

-- The next morning, today's unticked report belongs to a day that is still open until 12:00.
select private.queue_push_prompts(pg_temp.at(1, '08:30'));
select results_eq(
  $$ select message ->> 'title', message ->> 'url' from pgmq.q_jobs
     where message ->> 'tag' = 'morning' order by msg_id desc limit 1 $$,
  $$ values ('Yesterday is open until 12:00', '/?date=' || current_date) $$,
  'the morning prompt leads with yesterday while a tick still counts'
);

update public.profiles set notify_morning = false where id = '11111111-1111-1111-1111-111111111111';
select private.queue_push_prompts(pg_temp.at(2, '08:05'));
select is(pg_temp.pushes('11111111-1111-1111-1111-111111111111', 'morning'), 2::bigint, 'each prompt can be turned off');

select public.svc_push_gone('https://push.example/a1');
select is(jsonb_array_length(public.svc_push_subscriptions('11111111-1111-1111-1111-111111111111')), 0,
  'a device the push service says is gone is forgotten');

select * from finish();
rollback;
