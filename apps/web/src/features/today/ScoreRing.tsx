import type { Band } from '@mjolnir/domain';
import { BAND_COLOR, BAND_LABEL } from '../../lib/bands.ts';

const R = 34;
const C = 2 * Math.PI * R;

/** Live success rate (3.6): ring filled to the rate, coloured by band. */
export function ScoreRing({ rate, band, size = 88 }: { rate: number; band: Band; size?: number }) {
  const filled = (Math.min(rate, 100) / 100) * C;
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Success rate ${rate}%, ${BAND_LABEL[band]}`}
    >
      <svg viewBox="0 0 80 80" className="size-full -rotate-90">
        <circle cx="40" cy="40" r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r={R}
          fill="none"
          stroke={BAND_COLOR[band]}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${C}`}
          className="transition-[stroke-dasharray] duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg leading-none font-semibold tabular-nums">{Math.round(rate)}%</span>
      </div>
    </div>
  );
}
