begin;
select plan(48);

-- Two users; A works in UTC with a midnight boundary, so "today" is current_date.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');
update public.profiles set timezone = 'UTC', day_boundary_hour = 0
where id = '11111111-1111-1111-1111-111111111111';
insert into public.calendars (id, user_id, google_calendar_id, is_primary, access_role, sync_enabled) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a@example.com', true, 'owner', true);
insert into public.tags (id, user_id, name) values
  ('70000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'lfx'),
  ('70000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'gsoc'),
  ('70000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'essay'),
  ('70000000-0000-0000-0000-000000000009', '22222222-2222-2222-2222-222222222222', 'lfx');

-- Runs with the test owner's rights, so it can count queued writes while acting as the user.
create function pg_temp.link_writes() returns bigint language sql security definer as $$
  select count(*) from pgmq.q_google_writes where message ->> 'kind' = 'links' $$;
grant execute on function pg_temp.link_writes() to authenticated;
delete from pgmq.q_google_writes;
create function pg_temp.stats(p_id uuid) returns jsonb language sql as $$
  select public.deadline_stats(p_id) -> 0 -> 'stats' $$;
create function pg_temp.warnings(p_id uuid) returns text[] language sql as $$
  select array(select jsonb_array_elements_text(public.deadline_stats(p_id) -> 0 -> 'warnings')) $$;


-- Items. i1 to i4 and i8 count toward "5 PRs raised"; i5 to i7 must not.
insert into public.items (id, user_id, source, title, raw_title, points, status, logical_date,
  start_at, end_at, planned_minutes, actual_minutes, calendar_id, google_event_id, google_active) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'calendar', 'PR review', 'PR review #lfx', 2, 'done', current_date - 1,
    (current_date - 1) + time '10:00', (current_date - 1) + time '11:00', 60, 90, 'c0000000-0000-0000-0000-000000000001', 'ev1', true),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'calendar', 'PR fixes', 'PR fixes #lfx', 2, 'missed', current_date - 2,
    (current_date - 2) + time '10:00', (current_date - 2) + time '10:30', 30, null, 'c0000000-0000-0000-0000-000000000001', 'ev2', true),
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'calendar', 'Raise PR', 'Raise PR #lfx', 3, 'pending', current_date + 1,
    (current_date + 1) + time '10:00', (current_date + 1) + time '12:00', 120, null, 'c0000000-0000-0000-0000-000000000001', 'ev3', true),
  ('a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'manual', 'Reply to reviewer', 'Reply to reviewer', 1, 'pending', current_date,
    null, null, null, null, null, null, false),
  ('a0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'calendar', 'Old PR', 'Old PR #lfx', 2, 'done', current_date - 20,
    (current_date - 20) + time '10:00', (current_date - 20) + time '11:00', 60, null, 'c0000000-0000-0000-0000-000000000001', 'ev5', true),
  ('a0000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'calendar', 'Gone PR', 'Gone PR #lfx', 2, 'deleted', current_date,
    current_date + time '15:00', current_date + time '16:00', 60, null, 'c0000000-0000-0000-0000-000000000001', 'ev6', true),
  ('a0000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'calendar', 'lfx standup', 'lfx standup #lfx', 0, 'ignored', current_date,
    current_date + time '16:00', current_date + time '16:15', 15, null, 'c0000000-0000-0000-0000-000000000001', 'ev7', true),
  ('a0000000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'manual', 'Set up dev env', 'Set up dev env', 1, 'done', current_date - 30,
    null, null, 45, null, null, null, false),
  ('a0000000-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111', 'calendar', 'Proposal draft', 'Proposal draft #gsoc', 2, 'done', current_date - 3,
    (current_date - 3) + time '09:00', (current_date - 3) + time '09:30', 30, null, 'c0000000-0000-0000-0000-000000000001', 'ev11', true);
select private.set_hashtags(id, '11111111-1111-1111-1111-111111111111', array['lfx'])
from public.items where id in ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000007');
select private.set_hashtags('a0000000-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111', array['gsoc']);

-- Deadlines (3.9) -----------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

insert into public.deadlines (id, user_id, title, start_date, due_date, target_sessions, target_minutes) values
  ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '5 PRs raised', current_date - 10, current_date + 10, 5, 600),
  ('d0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'GSoC proposal', current_date - 5, current_date + 5, null, null),
  ('d0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Essay', current_date - 5, current_date + 5, null, null),
  ('d0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Far essay', current_date - 5, current_date + 9, null, null),
  ('d0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Late', current_date - 20, current_date - 3, null, null);
insert into public.deadlines (id, user_id, title, due_date) values
  ('d0000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'Shipped', current_date + 10);
insert into public.deadline_tags (deadline_id, tag_id) values
  ('d0000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002'),
  ('d0000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000003'),
  ('d0000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000003'),
  ('d0000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000002'),
  ('d0000000-0000-0000-0000-000000000006', '70000000-0000-0000-0000-000000000001');

select is((select start_date from public.deadlines where id = 'd0000000-0000-0000-0000-000000000006'), current_date,
  'the start date defaults to the day the deadline is created');
select throws_ok($$ insert into public.deadlines (user_id, title, start_date, due_date)
  values ('11111111-1111-1111-1111-111111111111', 'Backwards', current_date, current_date - 1) $$,
  '23514', null, 'a deadline cannot be due before it starts');
select throws_ok($$ insert into public.deadline_tags (deadline_id, tag_id)
  values ('d0000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000009') $$,
  '42501', null, 'a deadline cannot use another user''s tag');

-- A direct link counts whatever the date (i8 is 30 days old, before the window).
select public.set_item_links('a0000000-0000-0000-0000-000000000008', '{}', array['d0000000-0000-0000-0000-000000000001'::uuid]);

select is(
  pg_temp.stats('d0000000-0000-0000-0000-000000000001') - 'next_session' - 'window_from' - 'window_to',
  jsonb_build_object('sessions_planned', 5, 'sessions_done', 2, 'sessions_missed', 1, 'sessions_upcoming', 2,
    'minutes_planned', 255, 'minutes_done', 135, 'days_left', 10, 'last_session', current_date - 1,
    'progress_sessions', 40.0, 'progress_minutes', 22.5),
  '"5 PRs raised" counts sessions and hours from #lfx items in its window and its direct links'
);
select is(pg_temp.stats('d0000000-0000-0000-0000-000000000001') -> 'next_session' ->> 'id',
  'a0000000-0000-0000-0000-000000000004', 'the next session is the earliest upcoming one; a task for today counts');
select is(pg_temp.warnings('d0000000-0000-0000-0000-000000000001'), array['needs_more_sessions'],
  'done plus upcoming below the target sessions asks for more');
select is(
  (select array_agg(x ->> 'id' order by x ->> 'id') from jsonb_array_elements(public.deadline_stats('d0000000-0000-0000-0000-000000000001') -> 0 -> 'sessions') x),
  array['a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000008'],
  'the detail lists the counted sessions, not deleted, 0-point or out-of-window ones'
);

select is(
  (pg_temp.stats('d0000000-0000-0000-0000-000000000002') ->> 'sessions_planned')::int, 5,
  'a tag shared by two deadlines counts toward both (4 #lfx sessions in this window plus a #gsoc one)'
);
select is((pg_temp.stats('d0000000-0000-0000-0000-000000000002') ->> 'sessions_done')::int, 2,
  'done sessions come from either of its tags');
select is(pg_temp.warnings('d0000000-0000-0000-0000-000000000002'), '{}'::text[],
  'due within 7 days but with sessions upcoming: no warning');
select is(pg_temp.warnings('d0000000-0000-0000-0000-000000000003'), array['no_sessions'],
  'due within 7 days with nothing upcoming: "No sessions scheduled"');
select is(pg_temp.warnings('d0000000-0000-0000-0000-000000000004'), '{}'::text[],
  'due in 9 days: not yet');
select is(pg_temp.warnings('d0000000-0000-0000-0000-000000000005'), array['overdue'], 'past due and not done: overdue');
select is(
  (pg_temp.stats('d0000000-0000-0000-0000-000000000005') ->> 'window_to')::date, current_date,
  'an overdue deadline''s window runs to today, so late work still counts'
);
select is((pg_temp.stats('d0000000-0000-0000-0000-000000000005') ->> 'days_left')::int, -3, 'days left goes negative');

update public.deadlines set status = 'done', progress_pct = 100 where id = 'd0000000-0000-0000-0000-000000000006';
select isnt((select completed_at from public.deadlines where id = 'd0000000-0000-0000-0000-000000000006'), null,
  'marking a deadline Done stamps when');
select is(
  ((pg_temp.stats('d0000000-0000-0000-0000-000000000006') ->> 'window_to')::date, (pg_temp.stats('d0000000-0000-0000-0000-000000000006') ->> 'sessions_planned')::int),
  (current_date, 1),
  'a Done deadline''s window ends on its completion day, so tomorrow''s #lfx block no longer counts'
);
select is(pg_temp.warnings('d0000000-0000-0000-0000-000000000006'), '{}'::text[], 'a Done deadline has no warnings');
update public.deadlines set status = 'urgent' where id = 'd0000000-0000-0000-0000-000000000006';
select is((select completed_at from public.deadlines where id = 'd0000000-0000-0000-0000-000000000006'), null,
  'reopening clears the completion time');

update public.profiles set deadline_warning_days = 10 where id = '11111111-1111-1111-1111-111111111111';
select is(pg_temp.warnings('d0000000-0000-0000-0000-000000000004'), array['no_sessions'],
  'the warning window is a setting');
update public.profiles set deadline_warning_days = 7 where id = '11111111-1111-1111-1111-111111111111';

select is(
  (select array_agg(x.v ->> 'title' order by x.n) from jsonb_array_elements(public.deadline_stats()) with ordinality x(v, n)),
  array['Late', 'Essay', 'GSoC proposal', 'Far essay', '5 PRs raised', 'Shipped'],
  'all deadlines, sorted by due date'
);

-- Links from the app (3.8) ----------------------------------------------------------------------

select is(pg_temp.link_writes(), 0::bigint, 'linking a manual task writes nothing to Google');
select public.set_item_links('a0000000-0000-0000-0000-000000000001', array['gsoc', 'review'], array['d0000000-0000-0000-0000-000000000003'::uuid]);
select is(
  (select array_agg(t.name::text || ':' || it.source order by t.name) from public.item_tags it join public.tags t on t.id = it.tag_id
   where it.item_id = 'a0000000-0000-0000-0000-000000000001'),
  array['gsoc:explicit', 'lfx:hashtag', 'review:explicit'],
  'dropdown tags are explicit links, unknown ones are created, and the title''s #lfx stays'
);
select is(pg_temp.link_writes(), 1::bigint, 'a calendar item''s links are written to its event');
select is(
  (select array_agg(d ->> 'title') from jsonb_array_elements(public.calendar_range(current_date - 1, current_date - 1)) x,
     jsonb_array_elements(x -> 'deadlines') d where x ->> 'id' = 'a0000000-0000-0000-0000-000000000001'),
  array['Essay'], 'items show their deadlines'
);
select public.set_item_links('a0000000-0000-0000-0000-000000000001', '{}', '{}');
select is(
  (select array_agg(t.name::text) from public.item_tags it join public.tags t on t.id = it.tag_id
   where it.item_id = 'a0000000-0000-0000-0000-000000000001'),
  array['lfx'], 'clearing the dropdown keeps the hashtag, which only the title can remove'
);
select is((select count(*) from public.item_deadlines where item_id = 'a0000000-0000-0000-0000-000000000001'), 0::bigint,
  'and removes the deadline link');

-- Suggestions (3.8) -----------------------------------------------------------------------------

reset role;
select public.svc_apply_app_ops('c0000000-0000-0000-0000-000000000001', jsonb_build_array(
  jsonb_build_object('op', 'create', 'tags', '[]'::jsonb, 'events', '[]'::jsonb, 'item', jsonb_build_object(
    'id', 'a0000000-0000-0000-0000-000000000009', 'title', 'read lfx notes', 'raw_title', 'read lfx notes', 'points', 1,
    'logical_date', current_date + 2, 'start_at', (current_date + 2) + time '18:00', 'end_at', (current_date + 2) + time '19:00',
    'planned_minutes', 60, 'status', 'pending', 'google_event_id', 'ev9', 'color_key', 'default')),
  jsonb_build_object('op', 'create', 'tags', '[]'::jsonb, 'events', '[]'::jsonb, 'item', jsonb_build_object(
    'id', 'a0000000-0000-0000-0000-000000000012', 'title', 'flfx review', 'raw_title', 'flfx review', 'points', 1,
    'logical_date', current_date + 2, 'start_at', (current_date + 2) + time '08:00', 'end_at', (current_date + 2) + time '09:00',
    'status', 'pending', 'google_event_id', 'ev12', 'color_key', 'default')),
  jsonb_build_object('op', 'create', 'tags', '["lfx"]'::jsonb, 'events', '[]'::jsonb, 'item', jsonb_build_object(
    'id', 'a0000000-0000-0000-0000-000000000013', 'title', 'lfx sync', 'raw_title', 'lfx sync #lfx', 'points', 1,
    'logical_date', current_date + 2, 'start_at', (current_date + 2) + time '07:00', 'end_at', (current_date + 2) + time '07:30',
    'status', 'pending', 'google_event_id', 'ev13', 'color_key', 'default'))));
select is(
  (select array_agg(item_id::text || ':' || state) from public.suggestions s join public.tags t on t.id = s.tag_id where t.name = 'lfx'),
  array['a0000000-0000-0000-0000-000000000009:open'],
  '"read lfx notes" is suggested for #lfx; "flfx review" and an already tagged "lfx sync" are not'
);

select public.svc_apply_app_ops('c0000000-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object(
  'op', 'update', 'id', 'a0000000-0000-0000-0000-000000000012',
  'expect', jsonb_build_object('status', 'pending', 'finalized', false),
  'patch', jsonb_build_object('title', 'gsoc draft', 'raw_title', 'gsoc draft'), 'tags', '[]'::jsonb, 'events', '[]'::jsonb)));
select is((select count(*) from public.suggestions where item_id = 'a0000000-0000-0000-0000-000000000012' and state = 'open'), 1::bigint,
  'renaming an event in Google re-checks it');
select public.svc_apply_app_ops('c0000000-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object(
  'op', 'update', 'id', 'a0000000-0000-0000-0000-000000000012',
  'expect', jsonb_build_object('status', 'pending', 'finalized', false),
  'patch', jsonb_build_object('title', 'draft', 'raw_title', 'draft'), 'tags', '[]'::jsonb, 'events', '[]'::jsonb)));
select is((select count(*) from public.suggestions where item_id = 'a0000000-0000-0000-0000-000000000012'), 0::bigint,
  'and drops a suggestion the title no longer supports');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
insert into public.tags (user_id, name) values ('11111111-1111-1111-1111-111111111111', 'draft');
select is((select count(*) from public.suggestions s join public.tags t on t.id = s.tag_id
           where s.item_id = 'a0000000-0000-0000-0000-000000000012' and t.name = 'draft' and s.state = 'open'), 1::bigint,
  'a new tag is suggested for untagged items that already name it');
select is(
  (select array_agg(x -> 'item' ->> 'title' || ' → ' || (x -> 'tag' ->> 'name') order by x -> 'item' ->> 'title') from jsonb_array_elements(public.unassigned()) x),
  array['draft → draft', 'read lfx notes → lfx'], 'the Unassigned tray lists open suggestions'
);

select public.accept_suggestion((select s.id from public.suggestions s where s.item_id = 'a0000000-0000-0000-0000-000000000009'));
select is(
  (select it.source from public.item_tags it where it.item_id = 'a0000000-0000-0000-0000-000000000009'),
  'suggestion', 'Link adds the tag without touching the title'
);
select is((select raw_title from public.items where id = 'a0000000-0000-0000-0000-000000000009'), 'read lfx notes',
  'the Google title is unchanged');
select is(pg_temp.link_writes(), 3::bigint, 'and the new link is written to the event''s properties');
select is((pg_temp.stats('d0000000-0000-0000-0000-000000000001') ->> 'sessions_upcoming')::int, 4,
  'the linked session now counts toward "5 PRs raised" (with the #lfx sync made above)');

select public.dismiss_suggestion((select s.id from public.suggestions s where s.item_id = 'a0000000-0000-0000-0000-000000000012'));
reset role;
select public.svc_apply_app_ops('c0000000-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object(
  'op', 'update', 'id', 'a0000000-0000-0000-0000-000000000012',
  'expect', jsonb_build_object('status', 'pending', 'finalized', false),
  'patch', jsonb_build_object('title', 'draft v2', 'raw_title', 'draft v2'), 'tags', '[]'::jsonb, 'events', '[]'::jsonb)));
select is((select array_agg(state) from public.suggestions where item_id = 'a0000000-0000-0000-0000-000000000012'), array['dismissed'],
  'a dismissal is remembered across later syncs');

-- Links survive in the event's private properties ------------------------------------------------

select public.svc_apply_app_ops('c0000000-0000-0000-0000-000000000001', jsonb_build_array(
  jsonb_build_object('op', 'create', 'tags', '[]'::jsonb, 'events', '[]'::jsonb,
    'links', jsonb_build_object('tags', '["gsoc", "unknown"]'::jsonb,
      'deadlines', jsonb_build_array('d0000000-0000-0000-0000-000000000002', 'not-a-uuid', 'd0000000-0000-0000-0000-00000000dead')),
    'item', jsonb_build_object(
    'id', 'a0000000-0000-0000-0000-000000000014', 'title', 'Moved block', 'raw_title', 'Moved block', 'points', 1,
    'logical_date', current_date + 3, 'start_at', (current_date + 3) + time '10:00', 'end_at', (current_date + 3) + time '11:00',
    'status', 'pending', 'google_event_id', 'ev14', 'color_key', 'default'))));
select is(
  (select array_agg(t.name::text || ':' || it.source) from public.item_tags it join public.tags t on t.id = it.tag_id
   where it.item_id = 'a0000000-0000-0000-0000-000000000014'),
  array['gsoc:explicit'], 'a new item restores links from pt_tags, for tags that exist'
);
select is(
  (select array_agg(deadline_id::text) from public.item_deadlines where item_id = 'a0000000-0000-0000-0000-000000000014'),
  array['d0000000-0000-0000-0000-000000000002'], 'and from pt_deadlines, for the user''s own deadlines only'
);
select is((select count(*) from public.tags where name = 'unknown'), 0::bigint, 'restoring never invents tags');

select is(public.svc_item_links('a0000000-0000-0000-0000-000000000014'),
  jsonb_build_object('tags', jsonb_build_array('gsoc'), 'deadlines', jsonb_build_array('d0000000-0000-0000-0000-000000000002')),
  'the write job reads the links to put in the event');

insert into public.items (id, user_id, source, title, points, status, logical_date, rescheduled_from_id) values
  ('a0000000-0000-0000-0000-000000000015', '11111111-1111-1111-1111-111111111111', 'manual', 'Moved block', 1, 'pending',
   current_date + 4, 'a0000000-0000-0000-0000-000000000014');
select is((select count(*) from public.item_deadlines where item_id = 'a0000000-0000-0000-0000-000000000015'), 1::bigint,
  'a rescheduled copy keeps its deadline links');

-- Ownership -------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select is(
  (select count(*) from public.deadlines) + (select count(*) from public.deadline_tags)
    + (select count(*) from public.item_deadlines) + (select count(*) from public.suggestions),
  0::bigint, 'B sees none of A''s deadlines, links or suggestions'
);
select is(jsonb_array_length(public.deadline_stats()) + jsonb_array_length(public.unassigned()), 0, 'nor through the RPCs');
select throws_ok($$ select public.set_item_links('a0000000-0000-0000-0000-000000000009', array['x'], '{}') $$,
  'P0002', null, 'B cannot link A''s items');
select throws_ok($$ select public.accept_suggestion((select id from public.suggestions limit 1)) $$,
  'P0002', null, 'B cannot resolve A''s suggestions');
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
reset role;
insert into public.deadlines (id, user_id, title, due_date) values
  ('d0000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'B''s', current_date);
set local role authenticated;
select throws_ok($$ select public.set_item_links('a0000000-0000-0000-0000-000000000009', '{}', array['d0000000-0000-0000-0000-0000000000b1'::uuid]) $$,
  '23503', null, 'A cannot link to B''s deadline');
select throws_ok($$ insert into public.item_deadlines (item_id, deadline_id)
  values ('a0000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'item links change only through set_item_links');
reset role;

select * from finish();
rollback;
