import {
  type ColorKey,
  type ColorRule,
  colorForPoints,
  type Points,
  setPrimary,
  setRulePoints,
} from '@mjolnir/domain';
import { GOOGLE_EVENT_COLORS } from '../../lib/googleColors.ts';

const POINT_OPTIONS: Points[] = [0, 1, 2, 3];

interface Props {
  rules: ColorRule[];
  onChange(rules: ColorRule[]): void;
  /** Swatch for "calendar default": the primary calendar's colour. */
  defaultColor?: string | null;
}

/**
 * Section 3.2: map each Google event colour to 0 to 3 points, and pick the colour written per
 * value. The colour picked among the 0-point ones is the one schedule-only blocks get.
 */
export function ColorMap({ rules, onChange, defaultColor }: Props) {
  const byKey = new Map(rules.map((r) => [r.colorKey, r]));
  const sharedValues = new Set(
    ([0, 1, 2, 3] as const).filter(
      (p) => rules.filter((r) => r.points === p && (p > 0 || r.colorKey !== 'default')).length > 1,
    ),
  );
  // The colour each value writes: the stored primary, else the same fallback the server uses.
  const writes = new Map(([0, 1, 2, 3] as const).map((p) => [p, colorForPoints(rules, p)]));

  return (
    <div>
      <div className="mb-2 hidden grid-cols-[1fr_auto_4.5rem] gap-3 px-1 text-xs text-muted sm:grid">
        <span>Colour</span>
        <span className="w-44 text-center">Points (0 = not a task)</span>
        <span className="text-center">Primary</span>
      </div>
      <ul className="divide-y divide-rule">
        {GOOGLE_EVENT_COLORS.map((c) => {
          const rule = byKey.get(c.key) ?? { colorKey: c.key, points: 0, primaryForPoints: false };
          const showPrimary =
            sharedValues.has(rule.points) && (rule.points > 0 || c.key !== 'default');
          const what =
            rule.points === 0 ? 'schedule-only blocks' : `new ${rule.points}-point events`;
          return (
            <li
              key={c.key}
              className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 py-2.5 sm:grid-cols-[1fr_auto_4.5rem]"
            >
              <span className="flex min-w-0 items-center gap-2.5 text-sm">
                <span
                  aria-hidden
                  className="size-4 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: c.hex ?? defaultColor ?? 'transparent' }}
                />
                <span className="truncate">{c.name}</span>
              </span>
              <div
                role="radiogroup"
                aria-label={`${c.name} points`}
                className="flex w-48 rounded-full bg-surface-2 p-1"
              >
                {POINT_OPTIONS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={rule.points === p}
                    onClick={() => onChange(setRulePoints(rules, c.key as ColorKey, p))}
                    className={`h-8 flex-1 rounded-full text-sm transition ${
                      rule.points !== p
                        ? 'text-muted hover:text-text'
                        : p === 0
                          ? 'bg-active font-semibold text-text'
                          : 'bg-text font-semibold text-bg'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              {showPrimary ? (
                <label className="col-span-2 flex items-center gap-2 text-xs text-muted sm:col-span-1 sm:justify-center">
                  <input
                    type="radio"
                    name={`primary-${rule.points}`}
                    checked={writes.get(rule.points) === c.key}
                    onChange={() => onChange(setPrimary(rules, c.key as ColorKey))}
                    className="accent-[var(--color-accent)]"
                    aria-label={`Use ${c.name} for ${what}`}
                  />
                  <span className="sm:hidden">Use for {what}</span>
                </label>
              ) : (
                <span className="hidden sm:block" />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
