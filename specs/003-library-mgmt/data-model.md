# Phase 1 Data Model — evenBooks v3

Adds three small types to v2. Existing types (`Book`, `LibraryEntry`, `Library`, `ReadingPosition`) are unchanged.

## SortOption (new)

```ts
export type SortOption =
  | "most-recent" // v2 default — max(addedAt, lastOpenedAt)
  | "title-asc"
  | "author-asc"
  | "most-completed" // currentPage / totalPages, desc
  | "date-added-desc";
```

Five values; closed enum. Default is `"most-recent"` (matches v2 to avoid a surprise re-sort on first launch of v3).

## LibrarySettings (new, persisted)

```ts
export interface LibrarySettings {
  readonly version: 3;
  readonly sort: SortOption;
}
```

Stored at KV key `evenBooks.settings.v3`. Validation on read mirrors the library-index validation (parse failure → default + recovery notice). Write on every sort change.

## FilterState (new, in-memory only)

Not persisted; per-session per Spec FR-016. Lives as a single string in main.ts:

```ts
let filterQuery: string = "";
```

Empty string means "show all entries". `library-filter.ts` exports a pure helper:

```ts
export function applyFilter(
  entries: readonly LibraryEntry[],
  query: string,
): readonly LibraryEntry[];
```

- Empty / whitespace-only query → returns the input array as-is.
- Non-empty query → returns entries whose `(title + " " + author).toLowerCase()` includes `query.toLowerCase().trim()`.

Pure, deterministic, O(n).

## Tombstone Set (new, in-memory only)

Holds book ids that were just deleted, to absorb in-flight writes. Cleared 1 s after each insert.

```ts
const tombstones: Map<BookId, ReturnType<typeof setTimeout>> = new Map();
```

Used by the persistence layer's `writePosition` to silently drop writes for tombstoned ids.

## ReaderState (unchanged)

The v1 reader state machine is unchanged. The **active-book ↔ delete coordination** lives in main.ts (the dispatcher knows the active book; the delete orchestrator asks the dispatcher to exit before performing storage cleanup).

## Storage layout (full picture, v3)

| Layer                    | Key / Object                                | Shape                       | Change in v3                        |
| ------------------------ | ------------------------------------------- | --------------------------- | ----------------------------------- |
| `bridge.setLocalStorage` | `evenBooks.library.v2`                      | `Library` JSON              | unchanged                           |
| `bridge.setLocalStorage` | `evenBooks.position.<bookId>`               | `ReadingPosition` JSON      | unchanged; cleared on delete        |
| `bridge.setLocalStorage` | `evenBooks.settings.v3`                     | `LibrarySettings` JSON      | **new**                             |
| WebView IndexedDB        | DB `evenBooks`, store `books`, key `BookId` | `{ text, pages, storedAt }` | unchanged; record removed on delete |

No migration needed from v2 → v3: settings is a brand-new key (absent on first v3 launch → default is used silently). The library index, position keys, and IndexedDB content are all schema-compatible with v2.

## Out-of-scope entities (deferred)

- `DeletedBookHistory` / `Trash` — undo-delete window (out of scope).
- `Tag`, `Collection` — out of scope across all current specs.
- `BookProgress` as a first-class entity — not needed; computed on demand from reading-position + library entry.
