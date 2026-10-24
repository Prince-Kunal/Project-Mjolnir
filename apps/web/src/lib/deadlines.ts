// Deadlines, tags, item links and the Unassigned tray (3.8, 3.9).
import type { DeadlineStatus } from '@mjolnir/domain';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth.ts';
import type { DayItem } from './day.ts';
import { supabase, type Tables } from './supabase.ts';

export type Tag = Tables<'tags'>;

export type DeadlineWarning = 'overdue' | 'no_sessions' | 'needs_more_sessions';

export interface DeadlineStats {
  window_from: string;
  window_to: string;
  sessions_planned: number;
  sessions_done: number;
  sessions_missed: number;
  sessions_upcoming: number;
  minutes_planned: number;
  minutes_done: number;
  /** Negative once overdue. */
  days_left: number;
  last_session: string | null;
  next_session: {
    id: string;
    title: string;
    logical_date: string | null;
    start_at: string | null;
  } | null;
  /** Percent of the target, when one is set. */
  progress_sessions: number | null;
  progress_minutes: number | null;
}

export interface Deadline {
  id: string;
  title: string;
  area_id: string | null;
  start_date: string;
  due_date: string;
  target_sessions: number | null;
  target_minutes: number | null;
  progress_pct: number;
  status: DeadlineStatus;
  notes: string;
  completed_at: string | null;
  created_at: string;
  tags: { id: string; name: string }[];
  stats: DeadlineStats;
  warnings: DeadlineWarning[];
  /** Only when one deadline is asked for: its counted sessions, oldest first. */
  sessions?: DayItem[];
}

export interface Suggestion {
  id: string;
  tag: { id: string; name: string };
  item: DayItem;
}

export const deadlinesKey = ['deadlines'] as const;
export const unassignedKey = ['unassigned'] as const;
export const tagsKey = ['tags'] as const;

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

function check(res: { error: { message: string } | null }) {
  if (res.error) throw new Error(res.error.message);
}

/** Links change what items, deadlines and the tray show. */
function invalidateLinked(qc: QueryClient) {
  for (const queryKey of [['day'], ['calendar'], ['backlog'], deadlinesKey, unassignedKey, tagsKey])
    void qc.invalidateQueries({ queryKey });
}

export function useDeadlines() {
  return useQuery({ queryKey: deadlinesKey, queryFn: () => rpc<Deadline[]>('deadline_stats') });
}

export function useDeadline(id: string) {
  return useQuery({
    queryKey: [...deadlinesKey, id],
    queryFn: async () => (await rpc<Deadline[]>('deadline_stats', { p_id: id }))[0] ?? null,
  });
}

export function useTags() {
  return useQuery({
    queryKey: tagsKey,
    queryFn: async () => {
      const { data, error } = await supabase.from('tags').select('*').order('name');
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

/** Tag names typed as `lfx, #gsoc essay` → ['lfx', 'gsoc', 'essay']. */
export function parseTagNames(text: string): string[] {
  const names = text
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#/, '').toLowerCase())
    .filter(Boolean);
  return [...new Set(names)];
}

export const TAG_NAME = /^[a-z0-9_-]{1,32}$/;

export interface DeadlineInput {
  title: string;
  due_date: string;
  start_date?: string | null;
  area_id?: string | null;
  target_sessions?: number | null;
  target_minutes?: number | null;
  notes?: string;
  tags: string[];
}

/** Ids for tag names, creating the ones that do not exist yet. */
async function tagIds(userId: string, names: string[]): Promise<string[]> {
  if (!names.length) return [];
  check(
    await supabase.from('tags').upsert(
      names.map((name) => ({ user_id: userId, name })),
      { onConflict: 'user_id,name', ignoreDuplicates: true },
    ),
  );
  const { data, error } = await supabase.from('tags').select('id').in('name', names);
  if (error) throw new Error(error.message);
  return data.map((t) => t.id);
}

export function useSaveDeadline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, tags, ...fields }: DeadlineInput & { id?: string }) => {
      const userId = useAuth.getState().session?.user.id;
      if (!userId) throw new Error('Not signed in');
      const row = { ...fields, start_date: fields.start_date || undefined };
      const res = id
        ? await supabase.from('deadlines').update(row).eq('id', id).select('id').single()
        : await supabase
            .from('deadlines')
            .insert({ ...row, user_id: userId, start_date: row.start_date! })
            .select('id')
            .single();
      if (res.error) throw new Error(res.error.message);
      const deadlineId = res.data.id;

      const wanted = await tagIds(userId, tags);
      const { data: current, error } = await supabase
        .from('deadline_tags')
        .select('tag_id')
        .eq('deadline_id', deadlineId);
      if (error) throw new Error(error.message);
      const have = current.map((r) => r.tag_id);
      const drop = have.filter((t) => !wanted.includes(t));
      const add = wanted.filter((t) => !have.includes(t));
      if (drop.length)
        check(
          await supabase
            .from('deadline_tags')
            .delete()
            .eq('deadline_id', deadlineId)
            .in('tag_id', drop),
        );
      if (add.length)
        check(
          await supabase
            .from('deadline_tags')
            .insert(add.map((tag_id) => ({ deadline_id: deadlineId, tag_id }))),
        );
      return deadlineId;
    },
    onSettled: () => invalidateLinked(qc),
  });
}

/** Status and the manual progress bar, straight to the table. */
export function useUpdateDeadline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: { id: string } & Partial<Pick<Deadline, 'status' | 'progress_pct' | 'notes'>>) =>
      check(await supabase.from('deadlines').update(patch).eq('id', id)),
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: deadlinesKey });
      qc.setQueryData<Deadline[]>(deadlinesKey, (list) =>
        list?.map((d) => (d.id === id ? { ...d, ...patch } : d)),
      );
      qc.setQueryData<Deadline | null>([...deadlinesKey, id], (d) => d && { ...d, ...patch });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: deadlinesKey }),
  });
}

export function useDeleteDeadline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => check(await supabase.from('deadlines').delete().eq('id', id)),
    onSettled: () => invalidateLinked(qc),
  });
}

/** The item sheet's dropdown: the whole set of tags and deadlines for one item. */
export function useSetItemLinks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tags, deadlines }: { id: string; tags: string[]; deadlines: string[] }) =>
      rpc<DayItem>('set_item_links', { p_id: id, p_tags: tags, p_deadlines: deadlines }),
    onSettled: () => invalidateLinked(qc),
  });
}

export function useSaveTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, area_id }: { id: string; area_id: string | null }) =>
      check(await supabase.from('tags').update({ area_id }).eq('id', id)),
    onSettled: () => invalidateLinked(qc),
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => check(await supabase.from('tags').delete().eq('id', id)),
    onSettled: () => invalidateLinked(qc),
  });
}

export function useUnassigned() {
  return useQuery({ queryKey: unassignedKey, queryFn: () => rpc<Suggestion[]>('unassigned') });
}

export function useResolveSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, link }: { id: string; link: boolean }) =>
      rpc<void>(link ? 'accept_suggestion' : 'dismiss_suggestion', { p_id: id }),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: unassignedKey });
      qc.setQueryData<Suggestion[]>(unassignedKey, (list) => list?.filter((s) => s.id !== id));
    },
    onSettled: () => invalidateLinked(qc),
  });
}
