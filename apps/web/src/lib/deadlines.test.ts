import { describe, expect, it } from 'vitest';
import { parseTagNames, TAG_NAME } from './deadlines.ts';

describe('parseTagNames', () => {
  it('splits on spaces and commas, drops #, lower-cases and removes repeats', () => {
    expect(parseTagNames(' lfx, #GSoC  essay lfx ')).toEqual(['lfx', 'gsoc', 'essay']);
  });

  it('gives nothing for blank text', () => {
    expect(parseTagNames('  , ')).toEqual([]);
  });

  it('leaves invalid names for the form to reject', () => {
    expect(parseTagNames('lfx@x').filter((t) => !TAG_NAME.test(t))).toEqual(['lfx@x']);
  });
});
