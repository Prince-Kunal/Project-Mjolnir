import type { DayScore } from '@mjolnir/domain';

const EDGES = [
  [50, 'Fair'],
  [75, 'Good'],
  [85, 'Excellent'],
] as const;

/** Points still needed to reach the next band, as whole points (3.6). */
export function nextBand(score: DayScore): { label: string; points: number } | null {
  if (score.planned === 0) return null;
  for (const [edge, label] of EDGES) {
    const need = Math.ceil((score.planned * edge) / 100 - 1e-9) - score.done;
    if (need > 0) return { label, points: need };
  }
  return null;
}
