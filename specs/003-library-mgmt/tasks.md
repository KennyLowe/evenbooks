---
description: "Task list for evenBooks v3 — Library Management"
---

# Tasks: evenBooks v3 — Library Management

**Input**: Design documents from `specs/003-library-mgmt/`
**Prerequisites**: `plan.md` ✓, `spec.md` ✓, `research.md` ✓, `data-model.md` ✓, `contracts/{delete,sort,filter}.md` ✓, `quickstart.md` ✓
**Constitution**: `../../.specify/memory/constitution.md` v3.0.0

**Tests**: Vitest unit tests for the new pure-logic modules. No new manual simulator tests beyond the procedure in `quickstart.md`. v1 + v2 tests carry forward unchanged.

**Organization**: Three orthogonal user stories (delete P1, sort P2, filter P3) all share the same small foundational layer. The v1 reader and v2 import pipeline are not touched.

## Format: `[ID] [P?] [Story?] Description`

---

## Phase 1: Setup

- [ ] T001 [P] Bump `package.json` version to `0.3.0`.
- [ ] T002 [P] Bump `app.json` version to `0.3.0`.

## Phase 2: Foundational

- [ ] T003 [P] Add `SortOption` enum + `LibrarySettings` interface in `src/library/library-settings.ts`; export `loadSettings(bridge, channel)` + `saveSettings(bridge, channel, settings)` per `data-model.md` and `research.md` R4. Recovery on parse failure: default to `"most-recent"` and emit a recovery notice.
- [ ] T004 [P] Extend `src/library/library-entry.ts` with `comparatorFor(option: SortOption)` factory per `contracts/sort.md`. Each per-option comparator is pure and total. Existing `compareLibraryEntries` remains as the `most-recent` implementation.
- [ ] T005 [P] Add `src/library/library-filter.ts` exporting `applyFilter(entries, query)` per `contracts/filter.md`. Pure substring match, case-insensitive, order-preserving.
- [ ] T006 Add `removeEntry(library, id)` helper in `src/library/library.ts` (returns `{ entries: entries.filter(e => e.id !== id), version: 2 }`).
- [ ] T007 Extend `src/platform/persistence.ts` with a tombstone API: `tombstone(id, ttlMs?)`, `isTombstoned(id)`. `writePosition` checks `isTombstoned(position.book)` and silently drops if true. Per `research.md` R6.
- [ ] T008 Add `src/platform/delete-book.ts` exporting `deleteBook(args)` per `contracts/delete.md`. Three-step coordinated delete with rollback semantics per `research.md` R2.

### Foundational tests

- [ ] T009 [P] `tests/unit/library-settings.test.ts`: load empty → default; load valid → returns parsed; load garbage → default + recovery notice.
- [ ] T010 [P] `tests/unit/library-comparators.test.ts`: each `SortOption` produces expected ordering on a fixture library; tie-breakers verified.
- [ ] T011 [P] `tests/unit/library-filter.test.ts`: empty query identity, case-insensitive substring, regex-character literal handling, order preservation.
- [ ] T012 [P] `tests/unit/delete-book.test.ts`: happy path, sample refusal, step-1 failure rollback, best-effort step 2 + 3, tombstone window absorbs in-flight writes, tombstone expiry.

## Phase 3: User Story 1 — Delete (P1)

- [ ] T013 [US1] Add `src/ui/delete-confirm.ts`: in-page modal-style overlay with focus trap, Escape and backdrop-click cancel, confirm/cancel callbacks. Per `research.md` R5.
- [ ] T014 [US1] Extend `src/ui/library-view.ts`: per-entry delete affordance (visible only on imported entries; absent or non-functional on the bundled sample). Wires to a `onDelete(id)` callback.
- [ ] T015 [US1] Wire delete in `src/main.ts`: tap → confirm overlay → on confirm, call `deleteBook` orchestrator (passing an `exitActiveReaderIfMatching` callback that exits the reader cleanly if the active book matches); on success, update library + re-render; on `refused`, show a brief "the sample can't be removed" notice; on `failed`, the orchestrator already emitted a notice.
- [ ] T016 [US1] Manual simulator validation: import a book, delete it, confirm the entry vanishes; the bundled sample's delete affordance is absent/non-functional; deleting an active book exits the reader cleanly first.

## Phase 4: User Story 2 — Sort (P2)

- [ ] T017 [US2] Extend `src/ui/library-view.ts` with a sort selector (a `<select>` element with the five `SortOption` values; on change, calls `onSortChange(option)`).
- [ ] T018 [US2] Wire sort in `src/main.ts`: load settings on bootstrap (after migration); apply `comparatorFor(settings.sort)` whenever rendering; on sort change, save settings + re-render.
- [ ] T019 [US2] Manual simulator validation: cycle every sort option with ≥ 4 books; close + reopen confirms sort persists.

## Phase 5: User Story 3 — Filter (P3)

- [ ] T020 [US3] Extend `src/ui/library-view.ts` with a text-filter input (an `<input type="search">`; on input, calls `onFilterChange(query)`); empty-state rendering when filter excludes all entries.
- [ ] T021 [US3] Wire filter in `src/main.ts`: per-session in-memory `filterQuery`; render pipeline = `entries → applyFilter(filterQuery) → comparatorFor(sort) → ul.entries`; on import success while filter is active, surface a transient notice if the new entry doesn't match.
- [ ] T022 [US3] Manual simulator validation: type substrings, verify narrowing; clear the filter; close + reopen and verify filter is empty (not persisted).

## Phase 6: Polish

- [ ] T023 [P] Update `README.md` to mention v3 management capabilities and bump the status line.
- [ ] T024 [P] Run `npm run ci` (typecheck + lint + format + tests). All green.
- [ ] T025 [P] Run `npm run build` and pack `evenBooks-0.3.0.ehpk`.
- [ ] T026 Final commit + push (handled by user / agent in F).

## Dependencies

- Setup (T001–T002) is independent; can run in parallel.
- Foundational implementation (T003–T008): T003, T004, T005 are [P]; T006 follows the existing `library.ts` (no parallel conflict); T007 + T008 can be parallel after T006. Tests T009–T012 depend on their corresponding implementations.
- User Story 1 (T013–T016): T013 + T014 [P]; T015 depends on both; T016 manual.
- User Story 2 (T017–T019): T017 + T018 sequential by file; T019 manual.
- User Story 3 (T020–T022): same shape; T022 manual.
- Polish (T023–T026): [P] except T026 sequential.

## Notes

- v3 adds no new SDK calls; constitution gate already passes.
- The bundled sample is permanently undeletable per Spec FR-005 / Assumption 1.
- Filter is per-session, not persisted (Spec FR-016).
- Tombstone window is process-local, not persisted.
- `npm run ci` is the canonical pre-commit check.
