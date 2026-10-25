import { scoreDay } from '@mjolnir/domain';
import { describe, expect, it } from 'vitest';
import { nextBand } from './nextBand.ts';

const day = (done: number, planned: number) =>
  scoreDay([
    ...Array.from({ length: done }, () => ({ points: 1 as const, status: 'done' as const })),
    ...Array.from({ length: planned - done }, () => ({
      points: 1 as const,
      status: 'pending' as const,
    })),
  ]);

describe('nextBand', () => {
  it('counts whole points to the next band edge', () => {
    expect(nextBand(day(7, 16))).toEqual({ label: 'Fair', points: 1 }); // 8 of 16 is 50%
    expect(nextBand(day(8, 16))).toEqual({ label: 'Good', points: 4 }); // 12 of 16 is 75%
    expect(nextBand(day(12, 16))).toEqual({ label: 'Excellent', points: 2 }); // 14 of 16 is 87.5%
  });

  it('uses the inclusive edges: 11 of 13 is 84.6%, so Excellent needs 12', () => {
    expect(nextBand(day(11, 13))).toEqual({ label: 'Excellent', points: 1 });
  });

  it('has nothing to say once Excellent, or with nothing planned', () => {
    expect(nextBand(day(14, 16))).toBeNull();
    expect(nextBand(day(0, 0))).toBeNull();
  });
});
