-- Decision 17: a calendar block (or Google task) named like a habit schedules that habit instead
-- of adding a task. The block takes the habit's points and area and stands in for the day's habit
-- item, which is set aside (and comes back if the block is deleted, renamed or moved to another
-- day). A habit that was already ticked hands its tick to the block.

-- Puts a set-aside habit item back for the day, if the habit is still running.
create function private.restore_habit_day(p_habit_id uuid, p_date date)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.items i set status = 'pending'
  from public.habits h
  where h.id = p_habit_id and h.active and h.archived_at is null
    and i.source = 'habit' and i.habit_id = p_habit_id and i.logical_date = p_date
    and i.status = 'deleted' and not i.finalized;
$$;

create function private.link_habit_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.habits;
  occ public.items;
begin
  -- Leaving the habit: the block was deleted, renamed or moved to another day.
  if tg_op = 'UPDATE' and old.habit_id is not null
     and (new.status = 'deleted'
          or new.logical_date is distinct from old.logical_date
          or lower(btrim(new.title)) <> lower(btrim(old.title))) then
    perform private.restore_habit_day(old.habit_id, old.logical_date);
    new.habit_id := null;
  end if;

  if new.finalized or new.logical_date is null or new.status not in ('pending', 'done', 'ignored') then
    return new;
  end if;
  select * into h from public.habits
  where user_id = new.user_id and active and archived_at is null
    and lower(btrim(title)) = lower(btrim(new.title))
  order by created_at
  limit 1;
  if h.id is null then
    return new;
  end if;

  new.habit_id := h.id;
  -- The habit's worth wins over the block's colour, so a colour change in Google cannot reprice it.
  new.points := h.points;
  new.area_id := coalesce(new.area_id, h.area_id);
  if new.status = 'ignored' then
    new.status := 'pending';
  end if;

  select * into occ from public.items
  where source = 'habit' and habit_id = h.id and logical_date = new.logical_date
    and status in ('pending', 'done') and not finalized
  for update;
  if found then
    update public.items set status = 'deleted' where id = occ.id;
    if occ.status = 'done' and new.status = 'pending' then
      new.status := 'done';
      new.completed_at := occ.completed_at;
      new.actual_minutes := coalesce(new.actual_minutes, occ.actual_minutes);
    end if;
  end if;
  return new;
end;
$$;

create trigger items_link_habit before insert or update of title, logical_date, status, points
  on public.items for each row when (new.source in ('calendar', 'gtask'))
  execute function private.link_habit_block();

-- No habit item for a day the habit already has a block on.
create or replace function private.ensure_habit_items(p_user_id uuid, p_date date)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.items (user_id, source, title, points, logical_date, status, area_id, habit_id)
  select h.user_id, 'habit', h.title, h.points, p_date, 'pending', h.area_id, h.id
  from public.habits h
  join public.profiles p on p.id = h.user_id
  where h.user_id = p_user_id and h.active and h.archived_at is null
    and (h.weekdays & (1 << (extract(isodow from p_date)::int - 1))) <> 0
    and ((h.created_at at time zone p.timezone) - make_interval(hours => p.day_boundary_hour))::date <= p_date
    and not exists (
      select 1 from public.items b
      where b.habit_id = h.id and b.logical_date = p_date and b.source <> 'habit' and b.status <> 'deleted')
  on conflict (habit_id, logical_date) where source = 'habit' do nothing;
$$;

-- Editing a habit reprices its blocks but leaves their Google titles alone; pausing or archiving
-- it removes its open habit items and lets its blocks go back to being plain blocks.
create or replace function private.habits_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.logical_today(new.user_id);
begin
  if not new.active or new.archived_at is not null then
    update public.items set status = 'deleted'
    where habit_id = new.id and source = 'habit' and status = 'pending' and not finalized
      and logical_date >= v_today;
    update public.items set habit_id = null
    where habit_id = new.id and source <> 'habit' and not finalized and logical_date >= v_today;
  else
    update public.items set title = new.title, points = new.points, area_id = new.area_id
    where habit_id = new.id and source = 'habit' and status in ('pending', 'done') and not finalized
      and logical_date >= v_today;
    update public.items set points = new.points
    where habit_id = new.id and source <> 'habit' and status in ('pending', 'done') and not finalized
      and logical_date >= v_today;
  end if;
  return new;
end;
$$;

-- Link the blocks already planned on open days.
update public.items i set title = i.title
where i.source in ('calendar', 'gtask') and not i.finalized and i.habit_id is null
  and i.status in ('pending', 'done', 'ignored')
  and exists (
    select 1 from public.habits h
    where h.user_id = i.user_id and h.active and h.archived_at is null
      and lower(btrim(h.title)) = lower(btrim(i.title)));
