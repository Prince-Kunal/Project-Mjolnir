#!/usr/bin/env node
// Creates a local demo user with a believable month of data and prints a URL that signs the
// browser in as that user. For design reviews and screenshots against the local stack only:
// the sign-in hook it relies on is compiled in only when VITE_INSPECT_SESSION=1 (src/main.tsx).
//
//   node scripts/demo-user.mjs [base-url]      (default http://localhost:4173)
import { execSync } from 'node:child_process';

const base = process.argv[2] ?? 'http://localhost:4173';
const status = JSON.parse(
  execSync('supabase status -o json', { cwd: '../..', stdio: ['ignore', 'pipe', 'ignore'] }),
);
const api = status.API_URL;
const admin = {
  apikey: status.SECRET_KEY,
  authorization: `Bearer ${status.SECRET_KEY}`,
  'content-type': 'application/json',
};

async function call(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const email = `demo-${Date.now()}@mjolnir.local`;
const password = 'demo-password-123';
const user = await call(`${api}/auth/v1/admin/users`, {
  method: 'POST',
  headers: admin,
  body: JSON.stringify({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Prince' },
  }),
});
const session = await call(`${api}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: status.PUBLISHABLE_KEY, 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
});

const sql = String.raw`
\set uid '${user.id}'
update public.profiles set name = 'Prince', timezone = 'Asia/Kolkata', day_boundary_hour = 4,
  onboarded_at = now() - interval '40 days' where id = :'uid';
update public.color_rules set points = case color_key
  when '11' then 3 when '5' then 2 when '7' then 1 when 'default' then 1 else 0 end,
  primary_for_points = color_key in ('11', '5', '7')
where user_id = :'uid';
insert into public.areas (user_id, name, sort_order) values
  (:'uid', 'Rich', 0), (:'uid', 'Muscular', 1), (:'uid', 'Intelligent', 2);
insert into public.tags (user_id, name, area_id) values
  (:'uid', 'lfx', (select id from public.areas where user_id = :'uid' and name = 'Intelligent')),
  (:'uid', 'gsoc', (select id from public.areas where user_id = :'uid' and name = 'Intelligent')),
  (:'uid', 'gym', (select id from public.areas where user_id = :'uid' and name = 'Muscular')),
  (:'uid', 'freelance', (select id from public.areas where user_id = :'uid' and name = 'Rich'));
insert into public.habits (user_id, title, points, area_id) values
  (:'uid', 'Read 20 pages', 1, (select id from public.areas where user_id = :'uid' and name = 'Intelligent')),
  (:'uid', 'Stretch', 1, (select id from public.areas where user_id = :'uid' and name = 'Muscular'));

-- Forty days of history: four to six blocks a day, most done, a few missed.
with d as (select (private.logical_today(:'uid') - g)::date as day, g from generate_series(1, 40) g),
plan as (
  select * from (values
    (0, 'Gym', '#gym', 7, 2, '5', 60),
    (1, 'DSA practice', '', 9, 2, '5', 90),
    (2, 'LFX PR review', '#lfx', 11, 3, '11', 90),
    (3, 'Operating systems lecture', '', 14, 1, '7', 60),
    (4, 'Freelance invoice fixes', '#freelance', 18, 2, '5', 60),
    (5, 'GSoC proposal draft', '#gsoc', 21, 3, '11', 90)
  ) as p(n, title, tag, hour, pts, color, mins)
),
blocks as (
  select d.day, d.g, p.*,
    case when (d.g * 7 + p.n * 5) % 11 < (case when p.n = 5 then 4 when p.n = 0 then 3 else 1 end)
      then 'missed' else 'done' end as status
  from d join plan p on (d.g + p.n) % 6 <> 0
)
insert into public.items (user_id, source, title, raw_title, points, status, logical_date, start_at,
  end_at, planned_minutes, actual_minutes, completed_at, finalized, color_key, google_event_id,
  google_active, miss_reason)
select :'uid', 'calendar', title, trim(title || ' ' || tag), pts, status, day,
  (day + make_time(hour, 0, 0)) at time zone 'Asia/Kolkata',
  (day + make_time(hour, 0, 0) + make_interval(mins => mins)) at time zone 'Asia/Kolkata',
  mins, case when status = 'done' and (g + n) % 3 = 0 then mins + ((g % 5) - 2) * 10 end,
  case when status = 'done' then (day + make_time(hour, 0, 0)) at time zone 'Asia/Kolkata' + make_interval(mins => mins) end,
  true, color, 'hist-' || g || '-' || n, true,
  case when status = 'missed' then 'day_close' end
from blocks;

-- Today, in Asia/Kolkata: three done, the rest still to do, and a 0-point dinner.
insert into public.items (user_id, source, title, raw_title, points, status, logical_date, start_at,
  end_at, planned_minutes, completed_at, color_key, google_event_id, google_active)
select :'uid', 'calendar', t.title, t.raw, t.pts, t.status, private.logical_today(:'uid'),
  (private.logical_today(:'uid') + t.s::time) at time zone 'Asia/Kolkata',
  (private.logical_today(:'uid') + t.e::time) at time zone 'Asia/Kolkata',
  t.mins, case when t.status = 'done' then now() - interval '2 hours' end, t.color, 'today-' || t.n, true
from (values
  (1, 'Gym', 'Gym #gym', 2, 'done', '07:00', '08:00', 60, '5'),
  (2, 'DSA practice', 'DSA practice', 2, 'done', '09:30', '11:00', 90, '5'),
  (3, 'LFX PR review', 'LFX PR review #lfx', 3, 'done', '11:30', '13:00', 90, '11'),
  (4, 'Operating systems lecture', 'Operating systems lecture', 1, 'pending', '14:00', '15:00', 60, '7'),
  (5, 'GSoC proposal draft', 'GSoC proposal draft #gsoc', 3, 'pending', '16:00', '18:00', 120, '11'),
  (6, 'Dinner', 'Dinner', 0, 'ignored', '20:00', '20:45', 45, '8'),
  (7, 'Freelance invoice fixes', 'Freelance invoice fixes #freelance', 2, 'pending', '21:00', '22:00', 60, '5')
) as t(n, title, raw, pts, status, s, e, mins, color);
insert into public.items (user_id, source, title, raw_title, points, status, logical_date)
values (:'uid', 'manual', 'Renew library card', 'Renew library card', 1, 'pending', private.logical_today(:'uid')),
       (:'uid', 'manual', 'Book dentist appointment', 'Book dentist appointment', 1, 'pending', null),
       (:'uid', 'manual', 'read lfx notes', 'read lfx notes', 1, 'pending', private.logical_today(:'uid') + 1);
insert into public.items (user_id, source, title, raw_title, points, status, logical_date, inbox_state,
  finalized, miss_reason, start_at, end_at, planned_minutes, color_key, google_event_id, google_active)
values (:'uid', 'calendar', 'Revise DBMS notes', 'Revise DBMS notes', 2, 'missed',
  private.logical_today(:'uid') - 1, 'open', true, 'day_close',
  ((private.logical_today(:'uid') - 1) + time '19:00') at time zone 'Asia/Kolkata',
  ((private.logical_today(:'uid') - 1) + time '20:00') at time zone 'Asia/Kolkata', 60, '5', 'missed-1', true);

select private.set_hashtags(id, user_id, array(select lower(m[1]) from regexp_matches(raw_title, '#([a-z0-9_-]+)', 'gi') m))
from public.items where user_id = :'uid' and raw_title like '%#%';

insert into public.day_summaries (user_id, logical_date, planned_points, done_points, missed_points, success_rate, band, counts, finalized_at)
select :'uid', logical_date, sum(points), coalesce(sum(points) filter (where status = 'done'), 0),
  coalesce(sum(points) filter (where status = 'missed'), 0),
  round(100.0 * coalesce(sum(points) filter (where status = 'done'), 0) / sum(points), 1),
  public.score_band(round(100.0 * coalesce(sum(points) filter (where status = 'done'), 0) / sum(points), 1)),
  round(100.0 * coalesce(sum(points) filter (where status = 'done'), 0) / sum(points), 1) >= 50, now()
from public.items where user_id = :'uid' and logical_date < private.logical_today(:'uid') and points > 0
group by logical_date;
select private.recompute_streak(:'uid', (select min(logical_date) from public.day_summaries where user_id = :'uid'));

insert into public.daily_notes (user_id, logical_date, body) values
  (:'uid', private.logical_today(:'uid') - 2, 'Slept late, skipped the evening proposal block.');

insert into public.deadlines (user_id, title, start_date, due_date, target_sessions, status, progress_pct) values
  (:'uid', '5 PRs raised', private.logical_today(:'uid') - 20, private.logical_today(:'uid') + 12, 5, 'on_track', 40),
  (:'uid', 'GSoC proposal', private.logical_today(:'uid') - 14, private.logical_today(:'uid') + 4, null, 'urgent', 60),
  (:'uid', 'DBMS mid-semester exam', private.logical_today(:'uid') - 7, private.logical_today(:'uid') + 18, 6, 'needs_attention', 20);
insert into public.deadline_tags (deadline_id, tag_id)
select d.id, t.id from public.deadlines d join public.tags t on t.user_id = d.user_id
where d.user_id = :'uid' and ((d.title = '5 PRs raised' and t.name = 'lfx') or (d.title = 'GSoC proposal' and t.name = 'gsoc'));
select private.refresh_suggestions(id) from public.items where user_id = :'uid' and title = 'read lfx notes';
`;
execSync(`psql "${status.DB_URL}" -v ON_ERROR_STOP=1 -q`, {
  input: sql,
  stdio: ['pipe', 'ignore', 'inherit'],
});

const token = Buffer.from(
  JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token }),
).toString('base64url');
console.log(`${base}/#inspect-session=${token}`);
