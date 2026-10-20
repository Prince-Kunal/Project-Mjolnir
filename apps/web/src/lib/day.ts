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
  tags: { id: string; name: string; source: string }[];
}

export interface DayView {
  date: string;
  today: string;
  score: DayScore;
  items: DayItem[];
}

/** `today` follows the user's logical day on the server; a date pins one day. */
export const dayKey = (date?: string) => ['day', date ?? 'today'] as const;
export const backlogKey = ['backlog'] as const;

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
      timer = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ['day'] });
        void qc.invalidateQueries({ queryKey: backlogKey });
      }, 150);
    };
    let wasDown = false;
    const channel = supabase
      .channel(`items:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: `user_id=eq.${userId}` },
        refresh,
      )
      .subscribe((status) => {
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
