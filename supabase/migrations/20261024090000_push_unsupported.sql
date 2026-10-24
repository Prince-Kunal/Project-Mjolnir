-- Some calendars cannot be watched (Google refuses push for public calendars such as holidays).
-- Remember that per calendar, so renewals stop retrying it every hour; polling covers it.

alter table private.sync_state
  add column push_unsupported boolean not null default false,
  add column push_error text;

create function public.svc_mark_push_unsupported(p_calendar_id uuid, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.sync_state (source_id, push_unsupported, push_error)
  values (p_calendar_id, true, p_reason)
  on conflict (source_id) do update set push_unsupported = true, push_error = excluded.push_error,
    updated_at = now();
$$;

revoke execute on function public.svc_mark_push_unsupported(uuid, text) from public, anon, authenticated;
grant execute on function public.svc_mark_push_unsupported(uuid, text) to service_role;

create or replace function private.queue_watch(p_calendar_id uuid, p_replace uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := private.webhook_url();
begin
  if v_url is null or exists (
    select 1 from private.sync_state where source_id = p_calendar_id and push_unsupported
  ) then
    return;
  end if;
  perform private.queue_job(jsonb_build_object(
    'kind', 'watch', 'calendar_id', p_calendar_id, 'replace', p_replace, 'address', v_url));
end;
$$;

-- Enabling a calendar again gives push another try.
create or replace function private.calendars_sync_enabled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_channel uuid;
begin
  if new.sync_enabled and (tg_op = 'INSERT' or not old.sync_enabled) then
    update private.sync_state set sync_token = null, page_token = null, run_kind = null,
      push_unsupported = false, push_error = null
    where source_id = new.id;
    perform private.queue_sync(new.id, 'full');
    perform private.queue_watch(new.id);
  elsif tg_op = 'UPDATE' and old.sync_enabled and not new.sync_enabled then
    for v_channel in
      select id from private.watch_channels where calendar_id = new.id and stopped_at is null
    loop
      perform private.queue_job(jsonb_build_object('kind', 'stop_channel', 'channel_id', v_channel));
    end loop;
  end if;
  return new;
end;
$$;
