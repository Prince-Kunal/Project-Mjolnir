// Export (JSON and CSV) and account deletion (section 13).
import { appApi } from './day.ts';
import { supabase } from './supabase.ts';

interface ExportedItem {
  logical_date: string | null;
  start_at: string | null;
  end_at: string | null;
  title: string;
  source: string;
  points: number;
  status: string;
  miss_reason: string | null;
  planned_minutes: number | null;
  actual_minutes: number | null;
  tags: string[];
}

interface ExportedDay {
  logical_date: string;
  planned_points: number;
  done_points: number;
  success_rate: number;
  band: string;
  counts: boolean;
  streak_after: number | null;
}

export interface Export {
  items: ExportedItem[];
  day_summaries: ExportedDay[];
  [key: string]: unknown;
}

export async function fetchExport(): Promise<Export> {
  const { data, error } = await supabase.rpc('export_data');
  if (error) throw new Error(error.message);
  return data as unknown as Export;
}

/** RFC 4180 CSV: fields with commas, quotes or line breaks are quoted, quotes doubled. */
export function toCsv(header: string[], rows: (string | number | boolean | null)[][]): string {
  const cell = (v: string | number | boolean | null) => {
    const s = v === null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function itemsCsv(e: Export): string {
  return toCsv(
    [
      'date',
      'start',
      'end',
      'title',
      'source',
      'points',
      'status',
      'miss_reason',
      'planned_minutes',
      'actual_minutes',
      'tags',
    ],
    e.items.map((i) => [
      i.logical_date,
      i.start_at,
      i.end_at,
      i.title,
      i.source,
      i.points,
      i.status,
      i.miss_reason,
      i.planned_minutes,
      i.actual_minutes,
      i.tags.join(' '),
    ]),
  );
}

export function daysCsv(e: Export): string {
  return toCsv(
    ['date', 'planned_points', 'done_points', 'success_rate', 'band', 'counted', 'streak'],
    e.day_summaries.map((d) => [
      d.logical_date,
      d.planned_points,
      d.done_points,
      d.success_rate,
      d.band,
      d.counts,
      d.streak_after,
    ]),
  );
}

export function download(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Stops Google channels, revokes Google access and deletes every row (app-api DELETE /me). */
export async function deleteAccount(): Promise<void> {
  await appApi('me', { confirm: 'delete' }, 'DELETE');
  await supabase.auth.signOut({ scope: 'local' });
}
