begin;
select plan(5);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');
insert into public.items (user_id, source, title, points, status, logical_date) values
  ('11111111-1111-1111-1111-111111111111', 'manual', 'A task', 1, 'pending', current_date),
  ('22222222-2222-2222-2222-222222222222', 'manual', 'B task', 1, 'pending', current_date);
insert into public.daily_notes (user_id, logical_date, body) values
  ('11111111-1111-1111-1111-111111111111', current_date, 'A note');
insert into private.google_accounts (user_id, google_sub, email, refresh_token_enc)
values ('11111111-1111-1111-1111-111111111111', 'sub-a', 'a@example.com', '\x01');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select is(
  (select array_agg(x ->> 'title') from jsonb_array_elements(public.export_data() -> 'items') x),
  array['A task'], 'the export has the user''s own items only'
);
select is(public.export_data() -> 'daily_notes' -> 0 ->> 'body', 'A note', 'and their notes');
select ok(public.export_data()::text !~ 'refresh_token', 'and never Google tokens');
reset role;

insert into private.watch_channels (id, calendar_id, user_id, resource_id, token_hash, expires_at) values
  ('c4000000-0000-0000-0000-000000000001', null, '11111111-1111-1111-1111-111111111111', 'res-1', 'h', now() + interval '1 day');
select is(public.svc_user_channels('11111111-1111-1111-1111-111111111111') -> 0 ->> 'resource_id', 'res-1',
  'deletion finds the live channels to stop');

delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select is(
  (select count(*) from public.items where user_id = '11111111-1111-1111-1111-111111111111')
    + (select count(*) from private.google_accounts where user_id = '11111111-1111-1111-1111-111111111111')
    + (select count(*) from private.watch_channels where user_id = '11111111-1111-1111-1111-111111111111'),
  0::bigint, 'deleting the auth user removes every row, tokens and channels included'
);

select * from finish();
rollback;
