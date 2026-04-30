# Quickstart — evenBooks v3 (Library Management)

What changes for a developer compared to v2's quickstart. Most of v2's setup carries forward unchanged; this doc covers the deltas only.

## New dependencies

None. v3 uses only what v1 + v2 already pulled in.

## New source modules

```
src/library/library-settings.ts    — load/save evenBooks.settings.v3
src/library/library-filter.ts      — pure applyFilter()
src/platform/delete-book.ts        — coordinated delete orchestrator (3-step + rollback + tombstone)
src/ui/delete-confirm.ts           — confirmation overlay
```

Plus extensions to `src/library/library-entry.ts` (comparator factory), `src/library/library.ts` (`removeEntry`), `src/ui/library-view.ts` (delete affordance + sort selector + filter input), and `src/main.ts` (wires all of the above + tombstone integration with persistence).

## New tests

```
tests/unit/library-settings.test.ts        — load/save/recovery
tests/unit/library-comparators.test.ts     — every SortOption
tests/unit/library-filter.test.ts          — substring match, edge cases
tests/unit/delete-book.test.ts             — 3-step coordination + rollback + tombstone
```

## Daily dev loop

Same as v2:

```bash
# Terminal 1
npm run dev

# Terminal 2
npm run simulate
```

The dev affordances added in v2's polish phase still apply:

- `?reset` — wipes all storage on launch (clears the new settings key too).
- `?lines=N` / `?chars=M` — pagination overrides.

## Tests / lint / format / CI

Same scripts as v2:

```bash
npm test
npm run typecheck
npm run lint
npm run format:check
npm run ci
```

GitHub Actions runs the same `ci` script on every push and PR.

## Manual simulator validation procedure (per task)

After implementation, walk through:

1. **Delete an imported book**: import a file, delete it, confirm the entry vanishes. Re-import the same file; confirm it returns.
2. **Delete the sample**: confirm the affordance is absent or non-functional; UI explains the sample is undeletable.
3. **Sort cycle**: with ≥ 4 books, cycle through every sort option. Verify the order changes correctly. Close + reopen the simulator; the last selection persists.
4. **Filter**: with ≥ 6 books, type substrings into the filter input. Verify visible-narrowing. Clear the filter; full library reappears. Close + reopen; filter is empty (per-session per FR-016).
5. **Delete while reading**: open a book on the glasses, then delete it from the phone-side library. Verify the glasses display goes blank cleanly (back to glasses' app menu) and the entry is gone from the library.
6. **Delete during a save race**: rapidly advance pages on a book then delete it while writes are in flight. Verify no orphan position key remains (post-delete: tap-around on the simulator, then refresh; library shape is consistent).

## Build & package

Same as v2 (bump the version):

```bash
# Bump package.json version → 0.3.0
# Bump app.json version → 0.3.0
npm run build
node node_modules/@evenrealities/evenhub-cli/main.js pack app.json dist -o evenBooks-0.3.0.ehpk
```

## Migration notes

There's no v2 → v3 migration step needed. The new `evenBooks.settings.v3` key is brand-new (absent on first v3 launch → loader uses the default `"most-recent"`); the library index, position keys, and IndexedDB content are all schema-compatible with v2.

A v1 user upgrading directly to v3 still gets the v1 → v2 migration (`migrateV1IfNeeded` runs on bootstrap and is unchanged).
