// Analytics (section 12): computed in Postgres at request time.
import type { Band } from '@mjolnir/domain';
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase.ts';

export interface TrendDay {
  date: string;
  finalized: boolean;
  planned: number;
  done: number;
  rate: number;
  band: Band;
  /** Points-weighted rate over the 7 days ending this one. */
  avg7: number;
  streak_after: number | null;
}

export interface AreaWeek {
  week: string;
  area_id: string | null;
  planned: number;
  done: number;
  minutes_done: number;
}

export interface AreasReport {
  areas: AreaWeek[];
  hours: { week: string; planned_minutes: number; done_minutes: number }[];
  tags: { tag_id: string; name: string; minutes_done: number; sessions: number }[];
}

export interface MissesReport {
  /** ISO weekday (Monday = 1) and local start hour. */
  slots: { weekday: number; hour: number; planned: number; missed: number }[];
  chains: { id: string; title: string; logical_date: string; times: number; last_status: string }[];
  estimate: {
    count: number;
    planned_minutes: number;
    actual_minutes: number;
    ratio: number | null;
  };
}

export interface HeatDay {
  date: string;
  rate: number;
  band: Band;
  counts: boolean;
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

const range = (from: string, to: string) => ({ p_from: from, p_to: to });

export const useTrend = (from: string, to: string) =>
  useQuery({
    queryKey: ['analytics', 'trend', from, to],
    queryFn: () => rpc<TrendDay[]>('analytics_trend', range(from, to)),
  });

export const useAreasReport = (from: string, to: string) =>
  useQuery({
    queryKey: ['analytics', 'areas', from, to],
    queryFn: () => rpc<AreasReport>('analytics_areas', range(from, to)),
  });

export const useMisses = (from: string, to: string) =>
  useQuery({
    queryKey: ['analytics', 'misses', from, to],
    queryFn: () => rpc<MissesReport>('analytics_misses', range(from, to)),
  });

export const useHeatmap = (year: number) =>
  useQuery({
    queryKey: ['analytics', 'heatmap', year],
    queryFn: () => rpc<HeatDay[]>('analytics_heatmap', { p_year: year }),
  });

/**
 * Categorical slots for areas on the forged-iron ground: lightning first (the data hue), then the validated dark set. Colour follows the
 * area's place in the user's list, so filtering never repaints an area.
 */
export const AREA_COLORS = [
  '#9ccbff',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
  '#e66767',
];
export const NO_AREA_COLOR = '#5f5a53';

/** Points-weighted rate over closed days (decision 11), and how many counted. */
export function summarise(days: TrendDay[]) {
  const closed = days.filter((d) => d.finalized);
  const planned = closed.reduce((n, d) => n + d.planned, 0);
  const done = closed.reduce((n, d) => n + d.done, 0);
  return {
    rate: planned > 0 ? Math.round((done * 1000) / planned) / 10 : null,
    closed: closed.length,
    counted: closed.filter((d) => d.rate >= 50 && d.planned > 0).length,
    bestStreak: Math.max(0, ...days.map((d) => d.streak_after ?? 0)),
  };
}
