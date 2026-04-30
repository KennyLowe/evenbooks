# Implementation Plan: evenBooks v3 — Library Management

**Branch**: `003-library-mgmt` | **Date**: 2026-04-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/003-library-mgmt/spec.md`
**Constitution**: [v3.0.0](../../.specify/memory/constitution.md)

## Summary

Add three orthogonal capabilities to the v2 library: per-entry **delete** (with confirmation; coordinated cleanup of library index + reading-position key + IndexedDB content; sample is undeletable; reader is gracefully exited if active book is being deleted), user-selectable **sort** (5 options, persisted across sessions), and a **per-session text filter** (case-insensitive substring match on title + author). All phone-side; the v1 read loop and v2 import pipeline are unchanged.

The technical approach extends v2 minimally: a new `library-settings.ts` module persists the sort choice; the existing `compareLibraryEntries` is generalised into a comparator-per-sort-option; `library.ts` gains `deleteEntry(library, id)` and a coordinated `deleteBook` orchestrator that touches all three storage layers in dependency order with rollback; the phone-side UI gains a sort selector, a filter input, and a delete-confirmation overlay. No glasses-side surface, no new SDK calls.

## Technical Context

**Language/Version**: TypeScript 5.7 with `strict: true`. Carries forward from v2.

**Primary Dependencies**: No additions. Uses only what v1 + v2 already pulled in (jszip + the SDK + Vite + Vitest + ESLint + Prettier + jsdom + fake-indexeddb).

**Storage**:

- New KV key: `evenBooks.settings.v3` — a JSON `{ sort: SortOption }` object. Small, durable, written on every sort change.
- Existing KV: `evenBooks.library.v2` (entry removed on delete), `evenBooks.position.<bookId>` (cleared on delete).
- Existing IndexedDB: object store `books` (record removed on delete via the existing `deleteBookContent` helper).

**Testing**:

- Vitest unit tests for the new comparators (per sort option), the delete orchestrator (with mocked bridge + book-store), the settings load/save, and the filter pure function.
- Manual integration runs against `evenhub-simulator` for the delete confirmation flow, sort selector behaviour, and filter responsiveness.

**Target Platform**: Same as v2 — Even Hub plugin. No `min_sdk_version` change.

**Project Type**: Same single-project Vite + TS plugin from v1/v2.

**Performance Goals** (provisional):

- Delete completes (from confirm tap to entry gone) in under 5 s (SC-001).
- Sort re-render in under 200 ms for ≤ 50 entries (SC-004).
- Filter re-render within one frame (≤ 16 ms) for ≤ 50 entries (SC-006).
- 100 % of deletes correctly clear all three storage locations (SC-002).

**Constraints**: All v1 + v2 constitution constraints carry forward. No new sensors, no network. Library design point ≤ 50 books. Sample is permanently undeletable.

**Scale/Scope**: Library design point ≤ 50 books. Sort + filter are O(n) over the library array; perfectly adequate at this scale. No virtualisation.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design._

| Principle                                         | Verdict | Evidence in plan                                                                                                                                                                                                |
| ------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I. Every Frame Is Glanceable (NN)**             | ✅ Pass | Zero glasses-side surface added. The reader is gracefully torn down if the active book is being deleted (FR-006); no new glasses frames.                                                                        |
| **II. Data Minimalism**                           | ✅ Pass | Delete _reduces_ storage (removes a library entry, a position key, and an IndexedDB record). New `evenBooks.settings.v3` key is < 50 bytes. No new sensors or network.                                          |
| **III. Phone Is the Brain, Glasses Are the Lens** | ✅ Pass | Library state, sort, filter, delete all phone-side. Glasses display is unaffected unless the active book is being deleted, in which case the standard reader teardown runs first.                               |
| **IV. Battery and Bandwidth Are Sacred**          | ✅ Pass | No new BLE traffic. No new IMU or audio. Settings write is once-per-sort-change; library write is once-per-mutation (matches v2).                                                                               |
| **V. Crash Without Lying**                        | ✅ Pass | Delete is a coordinated three-step operation with rollback (FR-003) and notice-on-failure (R1). Sort/filter failures (parse errors on stored settings) recover to the v2 default and surface a recovery notice. |
| **VI. Simulator-First, Hardware-Verified**        | ✅ Pass | Delete + sort + filter are all phone-side and fully testable in the simulator. Hardware-validation is unchanged from v2 (the read loop is untouched).                                                           |

**SDK invariants**: all preserved from v1/v2. No new SDK calls.

**Result**: Gate **PASSES**. No Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/003-library-mgmt/
├── spec.md                       # Feature specification (already complete)
├── plan.md                       # This file
├── research.md                   # Phase 0 — sort comparator rules; delete coordination; filter strategy
├── data-model.md                 # Phase 1 — LibrarySettings, SortOption, FilterState (in-memory only)
├── quickstart.md                 # Phase 1 — what changes for a developer compared to v2
├── contracts/
│   ├── delete.md                 # Delete orchestrator contract (3-step coordinated)
│   ├── sort.md                   # SortOption enum + comparator contracts
│   └── filter.md                 # Filter pure function + UI integration
├── checklists/
│   └── requirements.md           # Spec quality checklist (already passing)
└── tasks.md                      # Phase 2 output — generated by /speckit-tasks
```

### Source code

```text
evenBooks/
├── src/
│   ├── library/
│   │   ├── library.ts                       # Extended: deleteEntry helper
│   │   ├── library-entry.ts                 # Extended: comparator factory by SortOption
│   │   ├── library-settings.ts              # NEW: load/save evenBooks.settings.v3
│   │   ├── library-filter.ts                # NEW: pure filter function (entries + query → entries)
│   │   ├── duplicates.ts                    # (unchanged)
│   ├── import/
│   │   └── …                                # (unchanged from v2)
│   ├── platform/
│   │   ├── persistence.ts                   # (unchanged)
│   │   ├── persistence-v2-migration.ts      # (unchanged)
│   │   ├── book-store.ts                    # (unchanged — deleteBookContent already exists)
│   │   ├── delete-book.ts                   # NEW: coordinated deletion orchestrator
│   │   ├── …                                # rest unchanged
│   ├── reader/
│   │   └── …                                # (UNCHANGED — Constitution Principle III, FR-018)
│   ├── ui/
│   │   ├── library-view.ts                  # Extended: delete affordance per entry, filter input, sort selector
│   │   ├── delete-confirm.ts                # NEW: confirmation overlay
│   │   ├── import-flow.ts                   # (unchanged)
│   │   └── phone-status.ts                  # (unchanged)
│   ├── main.ts                              # Extended: load settings, wire delete/sort/filter, exit reader on active-book delete
│   └── content/sample-text.ts               # (unchanged)
└── tests/
    └── unit/
        ├── (existing v1 + v2 tests carry forward)
        ├── library-settings.test.ts          # NEW: load/save/recovery
        ├── library-comparators.test.ts       # NEW: each SortOption produces expected order
        ├── library-filter.test.ts            # NEW: substring match, empty query, case-insensitive
        └── delete-book.test.ts               # NEW: 3-step coordination + rollback semantics
```

**Structure Decision**: Continue v2's single-project Vite + TS layout. New v3 modules are small additions; no existing module gets a major rewrite. Tests carry forward; new test files for the new modules.

## Complexity Tracking

> Empty. The Constitution Check passes without violations.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| _(none)_  | —          | —                                    |

## Phase 0 — Research

See `research.md`. Items resolved:

- **R1** Sort comparator authority: a single `comparatorFor(option)` function returns the comparator for any `SortOption`. Each comparator is pure and deterministic.
- **R2** Delete coordination & rollback ordering: library-index first, then position key, then IndexedDB content. Library-first means a partial failure leaves IndexedDB orphans that v2's content-evicted recovery already handles cleanly.
- **R3** Filter strategy: pure substring match on `(title + " " + author).toLowerCase()`; no regex, no fuzzy, no full-text-index. Computed on every render; cheap at design point ≤ 50.
- **R4** Settings persistence layer: reuse `bridge.setLocalStorage` with key `evenBooks.settings.v3`. Validation on read mirrors the library-index validation (fall back to default + notice on parse failure).
- **R5** Confirmation-dialog implementation: in-page overlay with a focus trap, dismiss on Escape and on backdrop click. No native `<dialog>` element to keep behaviour predictable across WebView versions.
- **R6** Race between delete and in-flight save: the deleted book's id is added to a "tombstone" set for ~1 s; any pending write for that id is silently dropped. Matches FR-007 (re-import succeeds).
- **R7** Delete-while-reading sequencing: the delete orchestrator first signals the reader to exit (if the active book matches the delete target), waits for `shutDownPageContainer` to resolve, then performs the storage cleanup.

## Phase 1 — Design & Contracts

- `data-model.md` — `SortOption` enum, `LibrarySettings`, `FilterState` (in-memory), and how they relate to v2's `Library`/`LibraryEntry`.
- `contracts/delete.md` — orchestrator interface, three-step state machine, rollback semantics, tombstone window.
- `contracts/sort.md` — `comparatorFor(SortOption)` contract; per-option ordering rules; tie-breaking.
- `contracts/filter.md` — `applyFilter(entries, query)` pure function; substring rules; empty-query behaviour.
- `quickstart.md` — what changes vs v2 for a developer (no new deps; new test files; new UI affordances).

**Agent context update**: `CLAUDE.md` updated to point at this plan file (local-only).

**Constitution re-check after design**: Pass. No new SDK calls, no new BLE channels, no glasses-side surface. The reader teardown path on active-book delete reuses the existing exit flow (Constitution Principle V: graceful handoff).
