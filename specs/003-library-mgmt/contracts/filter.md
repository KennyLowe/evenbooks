# Contract: Library Filter

Pure function. Lives in `src/library/library-filter.ts`.

## Public surface

```ts
export function applyFilter(
  entries: readonly LibraryEntry[],
  query: string,
): readonly LibraryEntry[];
```

## Behaviour

- `query` is whitespace-trimmed and lowercased before matching.
- Empty query (after trimming) → returns the input array as-is (reference-equal when possible).
- Non-empty query → returns entries whose `(title + " " + author).toLowerCase()` includes the trimmed/lowered query as a literal substring.
- Order of entries is preserved — the filter does NOT sort. Caller composes with the active sort.

```text
applyFilter(sortedEntries, query)
  → (sortedEntries, if query is empty/whitespace)
  → entries.filter(matchPredicate)
```

## Examples

```ts
applyFilter(entries, "")          // ⇒ entries (unchanged)
applyFilter(entries, "  ")        // ⇒ entries (whitespace counts as empty)
applyFilter(entries, "POE")       // ⇒ all entries by Edgar Allan Poe (case-insensitive)
applyFilter(entries, "tell")      // ⇒ "The Tell-Tale Heart"
applyFilter(entries, "X.Y.Z.")    // ⇒ literal substring match (no regex interpretation)
```

## Properties

- Pure: same `(entries, query)` produces the same result.
- Stable: relative order of matched entries is preserved.
- O(n) where n = `entries.length`. At v3 design point (≤ 50 entries) this is < 0.1 ms.
- Idempotent: `applyFilter(applyFilter(e, q), q) === applyFilter(e, q)` (ignoring object identity, returns the same array of items).

## Empty-state UI behaviour (Spec FR-015)

When `applyFilter(...)` returns an empty array AND the query is non-empty, the library view renders an empty-state message naming the query: `"No books match '<query>'."` This is a UI concern, not a filter-function concern.

## Test coverage (Vitest)

`tests/unit/library-filter.test.ts`:

- Empty query → identity (input returned unchanged).
- Whitespace-only query → identity.
- Single-char query matches title and author across multiple entries.
- Case-insensitive: `"poe"` matches author `"Edgar Allan Poe"`.
- Regex-special characters in the query are matched literally (`"."`, `"*"`, `"("`, `"$"`).
- Order preservation: filter input sorted by title asc → filter output also sorted by title asc.
- No matches → empty array.
