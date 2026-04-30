# Contract: Sort Comparators

Pure functions. Lives in `src/library/library-entry.ts` (extending v2's `compareLibraryEntries`).

## Public surface

```ts
import type { SortOption } from "./library-settings";

export function comparatorFor(
  option: SortOption,
): (a: LibraryEntry, b: LibraryEntry) => number;
```

Returns the right comparator for any `SortOption`. Each comparator is pure, deterministic, and total (no NaN, no order ambiguity).

## Per-option rules

| `SortOption` | Primary key (descending unless noted) | Tie-breakers |
|---|---|---|
| `"most-recent"` | `max(addedAt, lastOpenedAt ?? 0)` desc | id asc |
| `"title-asc"` | title (case-insensitive) asc | author (ci) asc, id asc |
| `"author-asc"` | author (ci) asc | title (ci) asc, id asc |
| `"most-completed"` | `(currentPage / totalPages)` desc; never-opened = 0 | title (ci) asc, id asc |
| `"date-added-desc"` | `addedAt` desc | id asc |

Notes:

- "Case-insensitive" is `toLocaleLowerCase()` then `localeCompare()`. Adequate for Latin script (the project's supported scope).
- For `most-completed`, `currentPage` is read from a per-book position cache held by main.ts. If the position is unknown for an entry (still loading), the comparator treats it as 0 (entry sinks to the bottom; will re-sort on next render once the load completes).
- `id` is always the final tie-breaker (string lexicographic asc). Ensures total ordering.

## Validation

The active sort is read at app start and every time the user changes it. If the persisted value isn't a known `SortOption`, the loader recovers to `"most-recent"` and emits a notice (see `library-settings.ts`).

## Test coverage (Vitest)

`tests/unit/library-comparators.test.ts`:

- For each `SortOption`, build a small fixture library and assert the produced order.
- Tie-breaking: two entries with identical primary keys → ordered by the documented tie-breakers.
- `most-completed`: an entry with `lastOpenedAt: null` sorts to the bottom regardless of `addedAt`.
- `comparatorFor("most-recent")` produces the same order as v2's `compareLibraryEntries` (regression check — no surprise re-sorting for v2 users on first v3 launch).
