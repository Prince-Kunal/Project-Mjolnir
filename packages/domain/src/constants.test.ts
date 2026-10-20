import { describe, expect, it } from 'vitest';
import { DEFAULT_DAY_BOUNDARY_HOUR, LATE_DONE_WINDOW_HOURS, STREAK_THRESHOLD } from './index.ts';

describe('section 4 defaults', () => {
  it('match the confirmed decisions', () => {
    expect(DEFAULT_DAY_BOUNDARY_HOUR).toBe(4);
    expect(LATE_DONE_WINDOW_HOURS).toBe(48);
    expect(STREAK_THRESHOLD).toBe(50);
  });
});
