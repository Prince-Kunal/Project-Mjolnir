import { describe, expect, it } from 'vitest';
import cases from './suggestions.cases.json' with { type: 'json' };
import { matchTags, titleHasTag } from './suggestions.ts';

describe('titleHasTag (3.8 suggestions)', () => {
  for (const c of cases.cases) {
    it(`${c.name}: "${c.title}" ${c.match ? 'contains' : 'does not contain'} ${c.tag}`, () => {
      expect(titleHasTag(c.title, c.tag)).toBe(c.match);
    });
  }
});

describe('matchTags', () => {
  it('returns every tag the title names, in the order given', () => {
    expect(matchTags('lfx review then gym', ['gym', 'lfx', 'read'])).toEqual(['gym', 'lfx']);
  });

  it('matches tag names case-insensitively', () => {
    expect(matchTags('read lfx notes', ['LFX'])).toEqual(['LFX']);
  });

  it('finds nothing in an empty title', () => {
    expect(matchTags('', ['lfx'])).toEqual([]);
  });
});
