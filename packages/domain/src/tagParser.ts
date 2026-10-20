// Section 3.8 (tags in titles) and 3.11 (the "✓ " completion prefix).

export interface ParsedTitle {
  /** Display title: tags and a leading "✓ " removed. */
  title: string;
  /** Lower-cased, in order of first appearance, without duplicates. */
  tags: string[];
  /** Whether the title carried the "✓ " prefix. The database, not this flag, owns completion. */
  checked: boolean;
}

const CHECK_PREFIX = /^\s*✓\s*/;

// `#` then 1 to 32 of a-z 0-9 _ -. The `#` may not follow a letter, digit or symbol that makes it
// part of a word (so `a#b@x.com` is not a tag), and the tag may not run into more tag characters
// or an `@`.
const TAG = /(?<![\p{L}\p{N}_#@&/-])#([a-z0-9_-]{1,32})(?![a-z0-9_@-])/giu;

export function parseTitle(raw: string | null | undefined): ParsedTitle {
  let text = raw ?? '';
  const checked = CHECK_PREFIX.test(text);
  if (checked) text = text.replace(CHECK_PREFIX, '');

  const tags: string[] = [];
  const title = text
    .replace(TAG, (_match, name: string) => {
      const tag = name.toLowerCase();
      if (!tags.includes(tag)) tags.push(tag);
      return '';
    })
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { title, tags, checked };
}
