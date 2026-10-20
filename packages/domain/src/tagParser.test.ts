import { describe, expect, it } from 'vitest';
import { parseTitle } from './tagParser.ts';

describe('parseTitle (3.8, 3.11)', () => {
  it('extracts a tag case-insensitively', () => {
    expect(parseTitle('Read docs #LFX')).toEqual({
      title: 'Read docs',
      tags: ['lfx'],
      checked: false,
    });
  });

  it('allows digits, hyphens and underscores', () => {
    expect(parseTitle('Ship #lfx-2 and #a_b').tags).toEqual(['lfx-2', 'a_b']);
  });

  it('finds tags at the start, middle and end', () => {
    expect(parseTitle('#gym leg day #health then #rest')).toEqual({
      title: 'leg day then',
      tags: ['gym', 'health', 'rest'],
      checked: false,
    });
  });

  it('does not treat an email address as a tag', () => {
    expect(parseTitle('Mail a#b@x.com')).toEqual({
      title: 'Mail a#b@x.com',
      tags: [],
      checked: false,
    });
  });

  it('ignores a # with nothing valid after it', () => {
    expect(parseTitle('Issue # 42 and #!').tags).toEqual([]);
  });

  it('allows 32 characters but not 33', () => {
    const ok = 'a'.repeat(32);
    const long = 'b'.repeat(33);
    expect(parseTitle(`x #${ok}`).tags).toEqual([ok]);
    expect(parseTitle(`x #${long}`)).toEqual({ title: `x #${long}`, tags: [], checked: false });
  });

  it('allows punctuation right after a tag', () => {
    expect(parseTitle('Sprint (#lfx), then #gym.').tags).toEqual(['lfx', 'gym']);
  });

  it('dedupes tags', () => {
    expect(parseTitle('#lfx review #LFX').tags).toEqual(['lfx']);
  });

  it('strips the ✓ prefix and reports it', () => {
    expect(parseTitle('✓ PR review #lfx')).toEqual({
      title: 'PR review',
      tags: ['lfx'],
      checked: true,
    });
  });

  it('strips a ✓ prefix with stray spacing', () => {
    expect(parseTitle('  ✓   Gym')).toEqual({ title: 'Gym', tags: [], checked: true });
  });

  it('keeps a ✓ that is not a prefix', () => {
    expect(parseTitle('Tick ✓ later').title).toBe('Tick ✓ later');
  });

  it('handles empty and missing titles', () => {
    expect(parseTitle('')).toEqual({ title: '', tags: [], checked: false });
    expect(parseTitle(undefined)).toEqual({ title: '', tags: [], checked: false });
  });
});
