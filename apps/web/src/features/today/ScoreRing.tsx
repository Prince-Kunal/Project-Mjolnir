import type { Band } from '@mjolnir/domain';
import { useEffect, useRef, useState } from 'react';
import { HammerMark } from '../../components/Mark.tsx';
import { BAND_COLOR, BAND_LABEL } from '../../lib/bands.ts';
import { useEffects } from '../../lib/effects.ts';

export const R = 80;
const C = 2 * Math.PI * R;
/** The band edges (3.6), notched on the ring like marks cut in a forge's rim. */
const NOTCHES = [50, 75, 85];

const polar = (pct: number, r: number) => {
  const a = (pct / 100) * 2 * Math.PI - Math.PI / 2;
  return { x: 100 + r * Math.cos(a), y: 100 + r * Math.sin(a) };
};

/**
 * The forge ring: today's success rate as an arc in its band colour, the band edges notched on the
 * rim, and the hammer riding the arc's tip. Crossing into Excellent makes the hammer strike; a full
 * day brings the lightning.
 */
export function ScoreRing({
  rate,
  band,
  size = 200,
  live = false,
}: {
  rate: number;
  band: Band;
  size?: number;
  /** Celebrate rises seen in this session (the day being worked), never on first paint. */
  live?: boolean;
}) {
  const pct = Math.min(Math.max(rate, 0), 100);
  const filled = (pct / 100) * C;
  const tip = polar(pct, R);
  const [striking, setStriking] = useState(false);
  const previous = useRef<number | null>(null);
  const ring = useRef<HTMLDivElement>(null);
  const strike = useEffects((s) => s.strike);

  useEffect(() => {
    const before = previous.current;
    previous.current = pct;
    if (!live || before === null || pct <= before) return;
    if (before < 85 && pct >= 85) setStriking(true);
    if (before < 100 && pct >= 100 && ring.current) {
      const r = ring.current.getBoundingClientRect();
      strike(r.left + r.width / 2, r.top + r.height * 0.15);
    }
  }, [pct, live, strike]);

  return (
    <div
      ref={ring}
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Success rate ${rate}%, ${BAND_LABEL[band]}`}
    >
      <svg viewBox="0 0 200 200" className="size-full">
        <circle
          cx="100"
          cy="100"
          r={R}
          fill="none"
          stroke="var(--color-surface-2)"
          strokeWidth="12"
        />
        <circle
          cx="100"
          cy="100"
          r={R}
          fill="none"
          stroke={BAND_COLOR[band]}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${C}`}
          transform="rotate(-90 100 100)"
          className="transition-[stroke-dasharray] duration-700 ease-[var(--ease-out-quint)]"
        />
        {NOTCHES.map((n) => {
          const a = polar(n, R + 11);
          const b = polar(n, R + 18);
          return (
            <line
              key={n}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={pct >= n ? 'var(--color-text)' : 'var(--color-border)'}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      {pct > 0 && (
        <div
          className="absolute flex size-[16%] items-center justify-center rounded-full bg-bg transition-[left,top] duration-700 ease-[var(--ease-out-quint)]"
          style={{
            left: `${(tip.x / 200) * 100 - 8}%`,
            top: `${(tip.y / 200) * 100 - 8}%`,
            transform: `rotate(${(pct / 100) * 360}deg)`,
          }}
          aria-hidden
        >
          <HammerMark
            className={`size-[74%] text-bone ${striking ? 'mj-strike' : ''}`}
            onAnimationEnd={() => setStriking(false)}
          />
        </div>
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display leading-none tabular-nums" style={{ fontSize: size * 0.21 }}>
          {Math.round(rate)}%
        </span>
        <span className="mt-1.5 text-[14px]" style={{ color: BAND_COLOR[band] }}>
          {BAND_LABEL[band]}
        </span>
      </div>
    </div>
  );
}
