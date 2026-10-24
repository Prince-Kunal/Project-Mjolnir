import { describe, expect, it } from 'vitest';
import { type Export, itemsCsv, toCsv } from './account.ts';

describe('toCsv', () => {
  it('quotes commas, quotes and line breaks, and leaves the rest bare', () => {
    expect(
      toCsv(
        ['a', 'b'],
        [
          ['PR review, part 2', 'said "done"'],
          ['two\nlines', null],
        ],
      ),
    ).toBe('a,b\r\n"PR review, part 2","said ""done"""\r\n"two\nlines",\r\n');
  });
});

describe('itemsCsv', () => {
  it('writes one row per item with its tags', () => {
    const e = {
      items: [
        {
          logical_date: '2026-10-24',
          start_at: null,
          end_at: null,
          title: 'Gym',
          source: 'manual',
          points: 2,
          status: 'done',
          miss_reason: null,
          planned_minutes: 60,
          actual_minutes: 45,
          tags: ['gym', 'health'],
        },
      ],
      day_summaries: [],
    } as Export;
    expect(itemsCsv(e).split('\r\n')[1]).toBe('2026-10-24,,,Gym,manual,2,done,,60,45,gym health');
  });
});
