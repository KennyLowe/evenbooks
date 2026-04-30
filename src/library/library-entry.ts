/**
 * Library entry — the user-perceptible record of a book in the library.
 *
 * Per data-model.md: a LibraryEntry is the lightweight metadata that lives
 * in `bridge.setLocalStorage`; it references the bulky content (text +
 * paginated pages) by id, which lives in IndexedDB.
 *
 * `compareLibraryEntries` is the v2 default comparator (most-recent-action
 * first). v3 adds `comparatorFor(option, progress)` which returns the right
 * comparator for any `SortOption`.
 */

import type { BookFormat, BookId } from "../content/sample-text";
import type { SortOption } from "./library-settings";

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

/** Per-book reading-progress lookup. Returns the current 0-based page index
 *  for a book id, or null if unknown / never opened. Provided by main.ts at
 *  sort time. */
export type ProgressLookup = (id: BookId) => number | null;

function recentActionMs(entry: LibraryEntry): number {
  return Math.max(entry.addedAt, entry.lastOpenedAt ?? 0);
}

function idTieBreak(a: LibraryEntry, b: LibraryEntry): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function ciCompare(a: string, b: string): number {
  return a.toLocaleLowerCase().localeCompare(b.toLocaleLowerCase());
}

/**
 * v2's default comparator. Most-recent-action first; ties by id asc.
 * Preserved as the implementation of `comparatorFor("most-recent")`.
 */
export function compareLibraryEntries(
  a: LibraryEntry,
  b: LibraryEntry,
): number {
  const diff = recentActionMs(b) - recentActionMs(a);
  if (diff !== 0) return diff;
  return idTieBreak(a, b);
}

/**
 * Per-SortOption comparator factory. Returns a pure, total comparator.
 *
 * `progress` is consulted only by the `most-completed` comparator. For
 * other options it can be omitted.
 */
export function comparatorFor(
  option: SortOption,
  progress?: ProgressLookup,
): (a: LibraryEntry, b: LibraryEntry) => number {
  switch (option) {
    case "most-recent":
      return compareLibraryEntries;

    case "title-asc":
      return (a, b) => {
        const t = ciCompare(a.title, b.title);
        if (t !== 0) return t;
        const au = ciCompare(a.author, b.author);
        if (au !== 0) return au;
        return idTieBreak(a, b);
      };

    case "author-asc":
      return (a, b) => {
        const au = ciCompare(a.author, b.author);
        if (au !== 0) return au;
        const t = ciCompare(a.title, b.title);
        if (t !== 0) return t;
        return idTieBreak(a, b);
      };

    case "most-completed":
      return (a, b) => {
        const fracA = fractionRead(a, progress);
        const fracB = fractionRead(b, progress);
        if (fracA !== fracB) return fracB - fracA; // desc
        const t = ciCompare(a.title, b.title);
        if (t !== 0) return t;
        return idTieBreak(a, b);
      };

    case "date-added-desc":
      return (a, b) => {
        if (a.addedAt !== b.addedAt) return b.addedAt - a.addedAt;
        return idTieBreak(a, b);
      };
  }
}

function fractionRead(
  entry: LibraryEntry,
  progress: ProgressLookup | undefined,
): number {
  if (entry.totalPages <= 0) return 0;
  // Never opened OR no progress info → treat as 0.
  if (entry.lastOpenedAt === null) return 0;
  const page = progress ? progress(entry.id) : null;
  if (page === null) return 0;
  return Math.max(0, Math.min(1, page / entry.totalPages));
}
