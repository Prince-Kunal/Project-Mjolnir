import { type ColorKey, type ColorRule, type Points } from '@mjolnir/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth.ts';
import { supabase, type Tables } from './supabase.ts';

export type Profile = Tables<'profiles'>;
export type Calendar = Tables<'calendars'>;
export type ProfileSettings = Partial<Omit<Profile, 'id' | 'avatar_url' | 'created_at'>>;

export interface GoogleConnection {
  connected: boolean;
  email?: string;
  status?: 'ok' | 'reconnect_needed';
  scopes?: string[];
}

function userId(): string {
  const id = useAuth.getState().session?.user.id;
  if (!id) throw new Error('Not signed in');
  return id;
}

/** Throws on a Supabase error. Data is null only for writes that select nothing back. */
function unwrap<R extends { data: unknown; error: { message: string } | null }>(
  res: R,
): NonNullable<R['data']> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<R['data']>;
}

export const keys = {
  profile: ['profile'] as const,
  calendars: ['calendars'] as const,
  colorRules: ['color_rules'] as const,
  google: ['google_connection'] as const,
};

export function useProfile() {
  const signedIn = useAuth((s) => Boolean(s.session));
  return useQuery({
    queryKey: keys.profile,
    enabled: signedIn,
    queryFn: async () => unwrap(await supabase.from('profiles').select('*').single()),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ProfileSettings) =>
      unwrap(await supabase.from('profiles').update(patch).eq('id', userId()).select().single()),
    onSuccess: (profile) => qc.setQueryData(keys.profile, profile),
  });
}

export function useGoogleConnection() {
  return useQuery({
    queryKey: keys.google,
    queryFn: async () =>
      unwrap(await supabase.rpc('google_connection')) as unknown as GoogleConnection,
  });
}

export function useCalendars() {
  return useQuery({
    queryKey: keys.calendars,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('calendars')
          .select('*')
          .order('is_primary', { ascending: false })
          .order('summary'),
      ),
  });
}

export function useSetCalendarSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) =>
      unwrap(await supabase.from('calendars').update({ sync_enabled: enabled }).eq('id', id)),
    onMutate: async ({ id, enabled }) => {
      await qc.cancelQueries({ queryKey: keys.calendars });
      const previous = qc.getQueryData<Calendar[]>(keys.calendars);
      qc.setQueryData<Calendar[]>(keys.calendars, (cals) =>
        cals?.map((c) => (c.id === id ? { ...c, sync_enabled: enabled } : c)),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => qc.setQueryData(keys.calendars, ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.calendars }),
  });
}

export function useColorRules() {
  return useQuery({
    queryKey: keys.colorRules,
    queryFn: async () => {
      const rows = unwrap(await supabase.from('color_rules').select('*'));
      return rows.map((r): ColorRule => ({
        colorKey: r.color_key as ColorKey,
        points: r.points as Points,
        primaryForPoints: r.primary_for_points,
      }));
    },
  });
}

export function useSaveColorRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rules: ColorRule[]) => {
      const user_id = userId();
      unwrap(
        await supabase.from('color_rules').upsert(
          rules.map((r) => ({
            user_id,
            color_key: r.colorKey,
            points: r.points,
            primary_for_points: r.primaryForPoints,
          })),
        ),
      );
      return rules;
    },
    onSuccess: (rules) => qc.setQueryData(keys.colorRules, rules),
  });
}

export type Area = Tables<'areas'>;
export type Habit = Tables<'habits'>;

export function useAreas() {
  return useQuery({
    queryKey: ['areas'],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('areas')
          .select('*')
          .is('archived_at', null)
          .order('sort_order')
          .order('created_at'),
      ),
  });
}

export function useSaveArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id?: string; name: string; sort_order?: number }) =>
      a.id
        ? unwrap(
            await supabase.from('areas').update({ name: a.name }).eq('id', a.id).select().single(),
          )
        : unwrap(
            await supabase
              .from('areas')
              .insert({ user_id: userId(), name: a.name, sort_order: a.sort_order ?? 0 })
              .select()
              .single(),
          ),
    onSettled: () => qc.invalidateQueries({ queryKey: ['areas'] }),
  });
}

export function useArchiveArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await supabase.from('areas').update({ archived_at: new Date().toISOString() }).eq('id', id),
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: ['areas'] }),
  });
}

export function useHabits() {
  return useQuery({
    queryKey: ['habits'],
    queryFn: async () =>
      unwrap(await supabase.from('habits').select('*').is('archived_at', null).order('created_at')),
  });
}

export type HabitInput = Pick<Habit, 'title' | 'points' | 'area_id' | 'weekdays' | 'active'>;

export function useSaveHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...h }: Partial<HabitInput> & { id?: string }) =>
      id
        ? unwrap(await supabase.from('habits').update(h).eq('id', id).select().single())
        : unwrap(
            await supabase
              .from('habits')
              .insert({ user_id: userId(), title: h.title!, points: h.points!, ...h })
              .select()
              .single(),
          ),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['habits'] });
      void qc.invalidateQueries({ queryKey: ['day'] });
    },
  });
}

export function useArchiveHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await supabase
          .from('habits')
          .update({ archived_at: new Date().toISOString() })
          .eq('id', id),
      ),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['habits'] });
      void qc.invalidateQueries({ queryKey: ['day'] });
    },
  });
}
