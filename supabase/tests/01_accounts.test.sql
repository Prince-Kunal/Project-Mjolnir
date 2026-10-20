begin;
select plan(34);

-- Two users. The auth trigger creates their profiles and default colour rules.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com', '{"full_name": "User A"}'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com', '{"name": "User B"}');

insert into public.calendars (user_id, google_calendar_id, summary) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com', 'A primary'),
  ('11111111-1111-1111-1111-111111111111', 'a-work', 'A work'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com', 'B primary');

insert into public.task_lists (user_id, google_tasklist_id, title) values
  ('11111111-1111-1111-1111-111111111111', 'a-list', 'A list'),
  ('22222222-2222-2222-2222-222222222222', 'b-list', 'B list');

-- Sign-up trigger ---------------------------------------------------------------------------

select is(
  (select name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'User A', 'profile takes full_name from Google metadata'
);
select is(
  (select name from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'User B', 'profile falls back to name'
);
select is(
  (select count(*)::int from public.color_rules where user_id = '11111111-1111-1111-1111-111111111111'),
  12, 'twelve colour rules seeded (default plus 11 colours)'
);
select results_eq(
  $$ select color_key, points::int, primary_for_points from public.color_rules
     where user_id = '11111111-1111-1111-1111-111111111111' and points > 0 $$,
  $$ values ('default'::text, 1, true) $$,
  'until onboarding: calendar default = 1 point and primary, every other colour 0'
);
select is(
  (select day_boundary_hour::int from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  4, 'day boundary defaults to 04:00'
);

-- Act as user A ------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

select is((select count(*)::int from public.profiles), 1, 'A sees only its own profile');
select is((select count(*)::int from public.calendars), 2, 'A sees only its own calendars');
select is(
  (select count(*)::int from public.calendars where user_id <> '11111111-1111-1111-1111-111111111111'),
  0, 'A sees none of B''s calendars'
);
select is((select count(*)::int from public.task_lists), 1, 'A sees only its own task lists');
select is((select count(*)::int from public.color_rules), 12, 'A sees only its own colour rules');

-- Allowed writes.
update public.profiles set timezone = 'Asia/Kolkata', day_boundary_hour = 5;
select is((select timezone from public.profiles), 'Asia/Kolkata', 'A can change its settings');
update public.calendars set sync_enabled = true where google_calendar_id = 'a-work';
select ok((select sync_enabled from public.calendars where google_calendar_id = 'a-work'), 'A can enable a calendar');
update public.task_lists set points = 2;
select is((select points::int from public.task_lists), 2, 'A can set task list points');
update public.color_rules set points = 3 where color_key = '11';
select is((select points::int from public.color_rules where color_key = '11'), 3, 'A can remap a colour');

-- Writes that must fail or touch nothing.
select throws_ok(
  $$ update public.profiles set timezone = 'Mars/Olympus' $$,
  '23514', null, 'an invalid timezone is rejected'
);
select throws_ok(
  $$ update public.color_rules set points = 4 where color_key = '1' $$,
  '23514', null, 'points above 3 are rejected'
);
select throws_ok(
  $$ update public.calendars set summary = 'renamed' $$,
  '42501', null, 'A cannot change calendar fields other than sync_enabled'
);
select throws_ok(
  $$ update public.profiles set created_at = now() $$,
  '42501', null, 'A cannot change non-settings profile columns'
);
select throws_ok(
  $$ insert into public.calendars (user_id, google_calendar_id) values ('11111111-1111-1111-1111-111111111111', 'x') $$,
  '42501', null, 'A cannot insert calendars (only Edge Functions do)'
);
select throws_ok(
  $$ insert into public.color_rules (user_id, color_key, points) values ('22222222-2222-2222-2222-222222222222', 'default', 3)
     on conflict (user_id, color_key) do update set points = 3 $$,
  '42501', null, 'A cannot write colour rules for B'
);

update public.calendars set sync_enabled = true where user_id = '22222222-2222-2222-2222-222222222222';
update public.profiles set timezone = 'Asia/Tokyo' where id = '22222222-2222-2222-2222-222222222222';

-- Private schema and service functions.
select throws_ok(
  $$ select * from private.google_accounts $$,
  '42501', null, 'A cannot read the private schema'
);
select throws_ok(
  $$ select public.svc_get_google_account('11111111-1111-1111-1111-111111111111') $$,
  '42501', null, 'A cannot call service functions'
);
select is(
  public.google_connection(), '{"connected": false}'::jsonb,
  'google_connection reports not connected'
);

reset role;

select ok(
  not (select sync_enabled from public.calendars where google_calendar_id = 'b@example.com'),
  'A''s update did not touch B''s calendar'
);
select is(
  (select timezone from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'UTC', 'A''s update did not touch B''s profile'
);
select is(
  (select points::int from public.color_rules where user_id = '22222222-2222-2222-2222-222222222222' and color_key = 'default'),
  1, 'B''s colour rules are unchanged'
);

-- OAuth state is single-use and expires ------------------------------------------------------

set local role service_role;

select lives_ok(
  $$ select public.svc_create_oauth_state('11111111-1111-1111-1111-111111111111', 'nonce-1', 'verifier-1') $$,
  'service role can store a connect state'
);
select results_eq(
  $$ select user_id, code_verifier from public.svc_consume_oauth_state('nonce-1') $$,
  $$ values ('11111111-1111-1111-1111-111111111111'::uuid, 'verifier-1'::text) $$,
  'first use returns the verifier'
);
select is_empty(
  $$ select * from public.svc_consume_oauth_state('nonce-1') $$,
  'second use returns nothing'
);
select public.svc_create_oauth_state('11111111-1111-1111-1111-111111111111', 'nonce-2', 'verifier-2', -1);
select is_empty(
  $$ select * from public.svc_consume_oauth_state('nonce-2') $$,
  'an expired state returns nothing'
);

-- Google account storage ---------------------------------------------------------------------

select public.svc_save_google_account(
  '11111111-1111-1111-1111-111111111111', 'sub-a', 'a@gmail.com', array['calendar.events'],
  encode('refresh-ciphertext', 'base64'), encode('access-ciphertext', 'base64'), now() + interval '1 hour'
);
select public.svc_save_google_account(
  '11111111-1111-1111-1111-111111111111', 'sub-a', 'a@gmail.com', array['calendar.events'],
  null, encode('access-2', 'base64'), now() + interval '1 hour'
);
select is(
  (select convert_from(decode(refresh_token_enc, 'base64'), 'UTF8') from public.svc_get_google_account('11111111-1111-1111-1111-111111111111')),
  'refresh-ciphertext', 'a reconnect without a refresh token keeps the stored one'
);
select throws_ok(
  $$ select public.svc_save_google_account('22222222-2222-2222-2222-222222222222', 'sub-a', 'a@gmail.com', '{}', null, null, null) $$,
  '23505', null, 'one Google account cannot be linked to two app users'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

select is(
  public.google_connection() - 'connected_at',
  '{"connected": true, "email": "a@gmail.com", "status": "ok", "scopes": ["calendar.events"]}'::jsonb,
  'google_connection reports the account without any token'
);

reset role;
select public.svc_save_google_account(
  '11111111-1111-1111-1111-111111111111', 'sub-other', 'other@gmail.com', '{}', null, null, null
);
select is(
  (select count(*)::int from public.calendars where user_id = '11111111-1111-1111-1111-111111111111'),
  0, 'switching to a different Google account drops the old account''s calendars'
);

select * from finish();
rollback;
