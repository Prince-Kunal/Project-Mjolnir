-- Phase 8: export (section 8 features: CSV/JSON) and account deletion (section 13).

-- Everything the user owns, as one JSON document. Runs with the caller's rights, so row-level
-- security alone decides what is included; Google tokens live in `private` and never appear.
create function public.export_data()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'format', 'mjolnir-export',
    'version', 1,
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p),
    'calendars', coalesce((select jsonb_agg(jsonb_build_object('google_calendar_id', c.google_calendar_id,
        'summary', c.summary, 'sync_enabled', c.sync_enabled) order by c.summary) from public.calendars c), '[]'),
    'color_rules', coalesce((select jsonb_agg(to_jsonb(r) - 'user_id' order by r.color_key) from public.color_rules r), '[]'),
    'areas', coalesce((select jsonb_agg(to_jsonb(a) - 'user_id' order by a.sort_order) from public.areas a), '[]'),
    'tags', coalesce((select jsonb_agg(to_jsonb(t) - 'user_id' order by t.name) from public.tags t), '[]'),
    'habits', coalesce((select jsonb_agg(to_jsonb(h) - 'user_id' order by h.created_at) from public.habits h), '[]'),
    'deadlines', coalesce((select jsonb_agg(to_jsonb(d) - 'user_id' || jsonb_build_object('tag_ids',
        coalesce((select jsonb_agg(dt.tag_id) from public.deadline_tags dt where dt.deadline_id = d.id), '[]'))
        order by d.due_date) from public.deadlines d), '[]'),
    'items', coalesce((select jsonb_agg(to_jsonb(i) - 'user_id' || jsonb_build_object(
        'tags', coalesce((select jsonb_agg(t.name order by t.name) from public.item_tags it
                          join public.tags t on t.id = it.tag_id where it.item_id = i.id), '[]'),
        'deadline_ids', coalesce((select jsonb_agg(x.deadline_id) from public.item_deadlines x
                                  where x.item_id = i.id), '[]'))
        order by i.logical_date nulls last, i.start_at, i.created_at) from public.items i), '[]'),
    'item_events', coalesce((select jsonb_agg(to_jsonb(e) - 'user_id' order by e.id) from public.item_events e), '[]'),
    'day_summaries', coalesce((select jsonb_agg(to_jsonb(s) - 'user_id' order by s.logical_date) from public.day_summaries s), '[]'),
    'daily_notes', coalesce((select jsonb_agg(to_jsonb(n) - 'user_id' order by n.logical_date) from public.daily_notes n), '[]'),
    'weekly_notes', coalesce((select jsonb_agg(to_jsonb(w) - 'user_id' order by w.week_start) from public.weekly_notes w), '[]'),
    'streak', (select to_jsonb(s) - 'user_id' from public.streak_state s));
$$;

revoke execute on function public.export_data() from public, anon;
grant execute on function public.export_data() to authenticated;

-- Account deletion (app-api DELETE /me) stops the user's live watch channels first.
create function public.svc_user_channels(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'resource_id', w.resource_id)), '[]')
  from private.watch_channels w
  where w.user_id = p_user_id and w.stopped_at is null and w.resource_id is not null;
$$;

revoke execute on function public.svc_user_channels(uuid) from public, anon, authenticated;
grant execute on function public.svc_user_channels(uuid) to service_role;
