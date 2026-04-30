/**
 * Library entry — the user-perceptible record of a book in the library.
 *
 * Per data-model.md: a LibraryEntry is the lightweight metadata that lives in
 * `bridge.setLocalStorage`; it references the bulky content (text + paginated
 * pages) by id, which lives in IndexedDB.
 *
 * `compareLibraryEntries` orders by most-recent-action first
 * (max(addedAt, lastOpenedAt ?? 0) descending). Pure function.
 */

import type { BookFormat, BookId } from "../content/sample-text";

export type { BookFormat, BookId };

export interface LibraryEntry {
  readonly id: BookId;
  readonly title: string;
  readonly author: string;
  readonly format: BookFormat;
  readonly addedAt: number;
  readonly lastOpenedAt: number | null;
  readonly totalPages: number;
}

function recentActionMs(entry: LibraryEntry): number {
  return Math.max(entry.addedAt, entry.lastOpenedAt ?? 0);
}

export function compareLibraryEntries(a: LibraryEntry, b: LibraryEntry): number {
  const diff = recentActionMs(b) - recentActionMs(a);
  if (diff !== 0) return diff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
