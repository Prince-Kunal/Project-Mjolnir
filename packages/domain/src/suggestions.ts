// Section 3.8 suggestions: an untagged title that names an existing tag as a whole word.
// The same rule runs in SQL (private.title_has_tag); suggestions.cases.json keeps them in step.

// A "word" here is a run of letters, digits, `_` and `-`, the characters a tag may contain, so
// "lfx-2" and "lfx_notes" are different words from "lfx".
const WORD_CHAR = /[\p{L}\p{N}_-]/u;

export function titleHasTag(title: string, tag: string): boolean {
  const hay = title.toLowerCase();
  const needle = tag.toLowerCase();
  if (!needle) return false;
  for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + 1)) {
    const before = hay[at - 1];
    const after = hay[at + needle.length];
    if ((!before || !WORD_CHAR.test(before)) && (!after || !WORD_CHAR.test(after))) return true;
  }
  return false;
}

/** The tags from `tagNames` that `title` names. */
export function matchTags(title: string, tagNames: string[]): string[] {
  return tagNames.filter((t) => titleHasTag(title, t));
}
