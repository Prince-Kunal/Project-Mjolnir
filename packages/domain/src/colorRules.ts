// Section 3.2: event colour decides points.
import type { ColorKey, Points } from './types.ts';

export const COLOR_KEYS: readonly ColorKey[] = [
  'default',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
];

export interface ColorRule {
  colorKey: ColorKey;
  points: Points;
  /** The colour the app writes for this points value when several share it. */
  primaryForPoints: boolean;
}

/** Until the owner maps colours: calendar default = 1 point, every other colour = 0. */
export function defaultColorRules(): ColorRule[] {
  return COLOR_KEYS.map((colorKey) => ({
    colorKey,
    points: colorKey === 'default' ? 1 : 0,
    primaryForPoints: colorKey === 'default',
  }));
}

/** Points for an event's `colorId`. No `colorId` means calendar default; unknown ids are 0. */
export function pointsForColor(
  rules: readonly ColorRule[],
  colorId: string | null | undefined,
): Points {
  const key = colorId ?? 'default';
  return rules.find((r) => r.colorKey === key)?.points ?? 0;
}

/**
 * The colour the app sets when writing an event worth `points`, or null if none maps to it.
 * 0 points is a schedule-only event: a real colour (never the calendar default), Graphite unless
 * another 0-point colour is marked primary.
 */
export function colorForPoints(rules: readonly ColorRule[], points: Points): ColorKey | null {
  const mapped = rules.filter(
    (r) => r.points === points && (points > 0 || r.colorKey !== 'default'),
  );
  const fallback = points === 0 ? mapped.find((r) => r.colorKey === '8') : undefined;
  return (mapped.find((r) => r.primaryForPoints) ?? fallback ?? mapped[0])?.colorKey ?? null;
}

/** Exactly one primary per points value in use, 0 included. Keeps a valid primary. */
export function normalizePrimaries(rules: readonly ColorRule[]): ColorRule[] {
  const chosen = new Map<Points, ColorKey>();
  for (const p of [0, 1, 2, 3] as const) {
    const key = colorForPoints(rules, p);
    if (key) chosen.set(p, key);
  }
  return rules.map((r) => ({ ...r, primaryForPoints: chosen.get(r.points) === r.colorKey }));
}

export function setRulePoints(
  rules: readonly ColorRule[],
  colorKey: ColorKey,
  points: Points,
): ColorRule[] {
  return normalizePrimaries(
    rules.map((r) => (r.colorKey === colorKey ? { ...r, points, primaryForPoints: false } : r)),
  );
}

export function setPrimary(rules: readonly ColorRule[], colorKey: ColorKey): ColorRule[] {
  const target = rules.find((r) => r.colorKey === colorKey);
  if (!target || (target.points === 0 && colorKey === 'default')) return [...rules];
  return rules.map((r) =>
    r.points === target.points ? { ...r, primaryForPoints: r.colorKey === colorKey } : r,
  );
}
