begin;
select plan(3);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
insert into public.weekly_notes (week_start, body) values ('2026-10-19', 'Gym slipped on Wednesday.');
select is((select body from public.weekly_notes where week_start = '2026-10-19'), 'Gym slipped on Wednesday.',
  'a week''s reflection is saved for its owner');

select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select is((select count(*) from public.weekly_notes), 0::bigint, 'B cannot read it');
select throws_ok($$ insert into public.weekly_notes (user_id, week_start, body)
  values ('11111111-1111-1111-1111-111111111111', '2026-10-26', 'x') $$, '42501', null, 'nor write one for A');
reset role;

select * from finish();
rollback;
