-- Phase 8: the Sunday review's reflection, one per week (keyed by the week's first day).

create table public.weekly_notes (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  week_start date not null,
  body text not null default '' check (length(body) <= 10000),
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

create trigger weekly_notes_touch before update on public.weekly_notes
  for each row execute function private.touch_updated_at();

alter table public.weekly_notes enable row level security;
revoke all on table public.weekly_notes from anon, authenticated;
grant select, insert, update, delete on table public.weekly_notes to authenticated;
create policy weekly_notes_all on public.weekly_notes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
