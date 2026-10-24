import { type DayScore, type ItemSource, type ItemStatus, scoreDay } from '@mjolnir/domain';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAuth } from './auth.ts';
import { supabase } from './supabase.ts';

export interface DayItem {
  id: string;
  source: ItemSource;
  title: string;
  points: number;
  status: ItemStatus;
  logical_date: string | null;
  start_at: string | null;
  end_at: string | null;
  is_all_day: boolean;
  planned_minutes: number | null;
  actual_minutes: number | null;
  completed_at: string | null;
  finalized: boolean;
  marked_late: boolean;
  habit_id: string | null;
  area_id: string | null;
  google_event_id: string | null;
  google_calendar_id: string | null;
  /** Google colour id ('default' = the calendar's colour) and that calendar colour. */
  color_key: string | null;
  calendar_color: string | null;
  tags: { id: string; name: string; source: string }[];
}

export interface StreakInfo {
  current: number;
  best: number;
  /** The day this week's rest pass was used, or null while it is still available. */
  pass_used_on: string | null;
}

export interface DayView {
  date: string;
  today: string;
  finalized: boolean;
  score: DayScore;
  note: string | null;
  streak: StreakInfo;
  missed_open: number;
  items: DayItem[];
}

export interface MissedItem extends DayItem {
  late_done_until: string | null;
}

export interface DayRow {
  date: string;
  finalized: boolean;
  planned: number;
  done: number;
  rate: number;
  band: DayScore['band'];
  counts: boolean | null;
  rest_pass_used: boolean | null;
  streak_after: number | null;
  note: string | null;
}

export interface MonthRow {
  month: number;
  days_closed: number;
  days_counted: number;
  points_planned: number;
  points_done: number;
  rate: number;
  excellent_days: number;
  best_streak: number;
}

/** `today` follows the user's logical day on the server; a date pins one day. */
export const dayKey = (date?: string) => ['day', date ?? 'today'] as const;
export const backlogKey = ['backlog'] as const;
export const missedKey = ['missed'] as const;

/** Everything derived from items: refetched after any change to them. */
const ITEM_VIEWS = [['day'], backlogKey, missedKey, ['days'], ['months'], ['calendar']] as const;

function invalidateItemViews(qc: QueryClient) {
  for (const queryKey of ITEM_VIEWS) void qc.invalidateQueries({ queryKey });
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

export function useDay(date?: string) {
  const signedIn = useAuth((s) => Boolean(s.session));
  return useQuery({
    queryKey: dayKey(date),
    enabled: signedIn,
    queryFn: () => rpc<DayView>('day_view', date ? { p_date: date } : {}),
  });
}

export function useBacklog() {
  return useQuery({ queryKey: backlogKey, queryFn: () => rpc<DayItem[]>('backlog') });
}

/** Applies `change` to an item in every cached day and recomputes those days' scores. */
function patchCachedItem(qc: QueryClient, id: string, change: (i: DayItem) => DayItem) {
  for (const [key, view] of qc.getQueriesData<DayView>({ queryKey: ['day'] })) {
    if (!view?.items.some((i) => i.id === id)) continue;
    const items = view.items.map((i) => (i.id === id ? change(i) : i));
    qc.setQueryData<DayView>(key, { ...view, items, score: scoreDay(items) });
  }
}

/** Optimistic tick and untick (section 6: "Optimistic ticks"); rolls back on error. */
export function useToggleItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      item,
      done,
      actualMinutes,
    }: {
      item: DayItem;
      done: boolean;
      actualMinutes?: number | null;
    }) =>
      done
        ? rpc<DayItem>('complete_item', { p_id: item.id, p_actual_minutes: actualMinutes ?? null })
        : rpc<DayItem>('uncomplete_item', { p_id: item.id }),
    onMutate: async ({ item, done, actualMinutes }) => {
      await qc.cancelQueries({ queryKey: ['day'] });
      const snapshot = qc.getQueriesData<DayView>({ queryKey: ['day'] });
      patchCachedItem(qc, item.id, (i) => ({
        ...i,
        status: done ? 'done' : 'pending',
        completed_at: done ? (i.completed_at ?? new Date().toISOString()) : null,
        actual_minutes: done ? (actualMinutes ?? i.actual_minutes ?? i.planned_minutes) : null,
      }));
      return { snapshot };
    },
    onError: (_e, _v, ctx) => ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['day'] }),
  });
}

export interface NewTask {
  title: string;
  points: number;
  date: string | null;
  areaId?: string | null;
  tags: string[];
  plannedMinutes?: number | null;
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (t: NewTask) =>
      rpc<DayItem>('create_manual_task', {
        p_title: t.title,
        p_points: t.points,
        p_date: t.date,
        p_area_id: t.areaId ?? null,
        p_tags: t.tags,
        p_planned_minutes: t.plannedMinutes ?? null,
      }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['day'] });
      void qc.invalidateQueries({ queryKey: backlogKey });
    },
  });
}

export type ItemPatch = Partial<{
  points: number;
  title: string;
  tags: string[];
  logical_date: string | null;
  area_id: string | null;
  actual_minutes: number | null;
}>;

export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ItemPatch }) =>
      rpc<DayItem>('update_item_local', { p_id: id, p_patch: patch }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['day'] });
      void qc.invalidateQueries({ queryKey: backlogKey });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rpc<void>('delete_manual_task', { p_id: id }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['day'] });
      void qc.invalidateQueries({ queryKey: backlogKey });
    },
  });
}

/**
 * Realtime (8.8): any change to this user's items refetches the cached days, so a tick on the
 * phone shows on the laptop. Bursts from a sync are folded into one refetch.
 */
export function useItemsRealtime() {
  const qc = useQueryClient();
  const userId = useAuth((s) => s.session?.user.id);

  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => invalidateItemViews(qc), 150);
    };
    let wasDown = false;
    const channel = supabase
      .channel(`items:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: `user_id=eq.${userId}` },
        refresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'day_summaries', filter: `user_id=eq.${userId}` },
        refresh,
      )
      .subscribe((status) => {
        // Visible state of the live connection (also lets end-to-end tests wait for it).
        document.documentElement.dataset.realtime = status === 'SUBSCRIBED' ? 'subscribed' : 'down';
        // Changes made while the socket was down were never delivered: refetch on reconnect.
        if (status === 'SUBSCRIBED' && wasDown) refresh();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED')
          wasDown = true;
      });
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [qc, userId]);
}

const SYNC_THROTTLE_MS = 60_000;
let lastSyncRequest = 0;

/** Back in the foreground: refetch today and ask Google for changes (plan 8.4, 8.8). */
export function useForegroundRefresh() {
  const qc = useQueryClient();
  const signedIn = useAuth((s) => Boolean(s.session));

  useEffect(() => {
    if (!signedIn) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void qc.invalidateQueries({ queryKey: ['day'] });
      if (Date.now() - lastSyncRequest > SYNC_THROTTLE_MS) {
        lastSyncRequest = Date.now();
        void supabase.rpc('request_sync');
      }
    };
    onVisible();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [qc, signedIn]);
}

// Missed inbox (3.5) ---------------------------------------------------------------------------

export function useMissedInbox() {
  return useQuery({ queryKey: missedKey, queryFn: () => rpc<MissedItem[]>('missed_inbox') });
}

function useItemMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => invalidateItemViews(qc) });
}

export const useDismissMissed = () =>
  useItemMutation((id: string) => rpc('dismiss_missed', { p_id: id }));
export const useMarkLateDone = () =>
  useItemMutation((id: string) => rpc('mark_late_done', { p_id: id }));
export const useRescheduleManual = () =>
  useItemMutation(({ id, date }: { id: string; date: string }) =>
    rpc('reschedule_manual', { p_id: id, p_date: date }),
  );

/** Calls app-api, which writes to Google; surfaces its error message. */
async function appApi<T>(
  path: string,
  body?: Record<string, unknown>,
  method: 'POST' | 'PATCH' | 'DELETE' = 'POST',
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(`app-api/${path}`, {
    method,
    ...(body ? { body } : {}),
  });
  if (error) {
    let message = 'Something went wrong. Try again.';
    try {
      const detail = await (error as { context?: Response }).context?.json();
      if (detail?.error === 'reconnect_needed')
        message = 'Reconnect Google Calendar in Settings first.';
      else if (detail?.error === 'google_failed')
        message = 'Google did not accept the event. Try again.';
      else if (typeof detail?.error === 'string') message = detail.error;
    } catch {
      // Keep the generic message.
    }
    throw new Error(message);
  }
  return data as T;
}

export const useRescheduleEvent = () =>
  useItemMutation(({ id, start, end }: { id: string; start: string; end: string }) =>
    appApi(`missed/${id}/reschedule`, { start, end }),
  );

export const useBulkMissed = () =>
  useItemMutation((action: 'reschedule_tomorrow' | 'dismiss_all') =>
    appApi<{ rescheduled?: number; failed?: number; dismissed?: number }>('missed/bulk', {
      action,
    }),
  );

export function useBusyBlocks(from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: ['busy', from, to],
    enabled,
    queryFn: () => rpc<{ start: string; end: string }[]>('busy_blocks', { p_from: from, p_to: to }),
  });
}

// Daily note (3.12) and tables -----------------------------------------------------------------

export function useSaveNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ date, body }: { date: string; body: string }) => {
      const user_id = useAuth.getState().session?.user.id;
      const { error } = await supabase
        .from('daily_notes')
        .upsert({ user_id: user_id!, logical_date: date, body });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['days'] }),
  });
}

export function useDaysRange(from: string, to: string) {
  return useQuery({
    queryKey: ['days', from, to],
    queryFn: () => rpc<DayRow[]>('days_range', { p_from: from, p_to: to }),
  });
}

export function useMonths(year: number) {
  return useQuery({
    queryKey: ['months', year],
    queryFn: () => rpc<MonthRow[]>('months_summary', { p_year: year }),
  });
}

// Events made and changed in the app (Phase 6) ------------------------------------------------

export interface NewEvent {
  /** Title with its #tags, as it should read in Google Calendar. */
  title: string;
  points: number;
  start: string;
  end: string;
}

export const useCreateEvent = () =>
  useItemMutation((e: NewEvent) => appApi<{ item_id: string }>('items', { ...e }));

export const useEditEvent = () =>
  useItemMutation(
    ({
      id,
      ...patch
    }: {
      id: string;
      title?: string;
      points?: number;
      start?: string;
      end?: string;
    }) => appApi<{ item_id: string }>(`items/${id}`, patch, 'PATCH'),
  );

export const useDeleteEvent = () =>
  useItemMutation((id: string) => appApi<{ item_id: string }>(`items/${id}`, undefined, 'DELETE'));

export const useScheduleTask = () =>
  useItemMutation(({ id, start, end }: { id: string; start: string; end: string }) =>
    appApi<{ item_id: string }>(`items/${id}/schedule`, { start, end }),
  );

/** Items with a logical date in the range, 0-point blocks included (Calendar view). */
export function useCalendarRange(from: string, to: string) {
  return useQuery({
    queryKey: ['calendar', from, to],
    queryFn: () => rpc<DayItem[]>('calendar_range', { p_from: from, p_to: to }),
    placeholderData: (previous) => previous,
  });
}
