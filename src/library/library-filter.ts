/**
 * Library filter — pure substring match.
 *
 * Per contracts/filter.md and research.md R3.
 *
 *   - Empty / whitespace-only query → returns the input array as-is.
 *   - Non-empty query → entries where (title + " " + author).toLowerCase()
 *     contains the trimmed/lowered query.
 *   - Order is preserved.
 *   - Regex-special characters are matched literally.
 */

import type { LibraryEntry } from "./library-entry";

export function applyFilter(
  entries: readonly LibraryEntry[],
  query: string,
): readonly LibraryEntry[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return entries;

  return entries.filter((entry) => {
    const haystack = (entry.title + " " + entry.author).toLowerCase();
    return haystack.includes(needle);
  });
}
