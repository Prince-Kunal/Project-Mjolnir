begin;
select plan(6);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');
insert into public.calendars (id, user_id, google_calendar_id, color, sync_enabled, access_role) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a@example.com', '#9fe1e7', true, 'owner');

select public.svc_apply_app_ops('c0000000-0000-0000-0000-000000000001', jsonb_build_array(
  jsonb_build_object('op', 'create', 'tags', '[]'::jsonb, 'events', '[]'::jsonb, 'item', jsonb_build_object(
    'id', 'a0000000-0000-0000-0000-000000000001', 'title', 'Deep work', 'raw_title', 'Deep work', 'points', 3,
    'logical_date', '2026-10-24', 'start_at', '2026-10-24T03:30:00Z', 'end_at', '2026-10-24T05:30:00Z',
    'status', 'pending', 'google_event_id', 'ev1', 'color_key', '11')),
  jsonb_build_object('op', 'create', 'tags', '[]'::jsonb, 'events', '[]'::jsonb, 'item', jsonb_build_object(
    'id', 'a0000000-0000-0000-0000-000000000002', 'title', 'Dinner', 'raw_title', 'Dinner', 'points', 0,
    'logical_date', '2026-10-24', 'start_at', '2026-10-24T15:00:00Z', 'end_at', '2026-10-24T16:00:00Z',
    'status', 'ignored', 'google_event_id', 'ev2', 'color_key', 'default'))));
select is((select color_key from public.items where id = 'a0000000-0000-0000-0000-000000000001'), '11',
  'created items keep their Google colour');

select public.svc_apply_app_ops('c0000000-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object(
  'op', 'update', 'id', 'a0000000-0000-0000-0000-000000000001',
  'expect', jsonb_build_object('status', 'pending', 'finalized', false),
  'patch', jsonb_build_object('color_key', '5'), 'events', '[]'::jsonb)));
select is((select color_key from public.items where id = 'a0000000-0000-0000-0000-000000000001'), '5',
  'a recolour updates it');
insert into public.items (user_id, source, title, points, status, logical_date)
values ('11111111-1111-1111-1111-111111111111', 'manual', 'Gone task', 1, 'deleted', '2026-10-24');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select is(
  (select array_agg(x ->> 'title' order by x ->> 'title') from jsonb_array_elements(public.calendar_range('2026-10-24', '2026-10-24')) x),
  array['Deep work', 'Dinner'], 'the calendar shows 0-point blocks too, but not deleted items'
);
select is(
  (select x ->> 'calendar_color' from jsonb_array_elements(public.calendar_range('2026-10-24', '2026-10-24')) x where x ->> 'title' = 'Dinner'),
  '#9fe1e7', 'items carry their calendar''s colour for calendar-default events'
);
select throws_ok($$ select public.calendar_range('2026-01-01', '2026-06-01') $$, '22023', null, 'ranges are bounded');
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select is(jsonb_array_length(public.calendar_range('2026-10-24', '2026-10-24')), 0, 'B sees none of A''s calendar');
reset role;

select * from finish();
rollback;
