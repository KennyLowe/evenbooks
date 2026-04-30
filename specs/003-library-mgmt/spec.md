# Feature Specification: evenBooks v3 — Library Management

**Feature Branch**: `003-library-mgmt`
**Created**: 2026-04-30
**Status**: Draft
**Input**: User description: "Library management for evenBooks: delete a book (with confirmation, also deletes its IndexedDB content and per-book reading position), sort the library by user choice (last-action-first / title A-Z / author A-Z / progress / date-added), and a simple text filter to narrow the visible entries. All phone-side; glasses read loop unchanged."

## Scope statement

v3 turns the v2 library list from a passive read-only display into a real management surface. The user can delete books, choose how the list is ordered, and filter the visible entries by typing. The bundled sample is treated as undeletable (it's the always-available starting point); imports can be removed.

What's explicitly **in** v3:

- Per-entry delete affordance with a confirmation step that explains what will be deleted (the book and any saved reading position).
- Selectable sort orders: last-action (current v2 default), title (A→Z), author (A→Z), progress (most-completed first), date added (newest first).
- Text filter: a search input that narrows the visible entries by title/author substring (case-insensitive).
- All of the above as phone-side WebView UI; the glasses read loop is unchanged.

What's explicitly **out** of v3:

- Tags / collections / folders.
- Multi-select / batch delete.
- Trash / undo-delete window.
- Export / share / sync.
- Server-side library / cloud backup.
- Per-book settings (font size, line spacing — still out of scope across all specs).
- Reordering by drag-and-drop (sort orders only).
- Cross-disconnect resilience improvements (→ deferred to spec 004).

The phone remains authoritative for all state; the glasses are a derived viewport (constitution Principle III).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Delete an imported book (Priority: P1)

A user who has imported a book they no longer want taps the entry, sees a delete affordance, taps it, sees a confirmation dialog explaining what will be removed, confirms, and the entry disappears from the library. Storage (both the library index and the IndexedDB content + per-book reading position) is reclaimed.

**Why this priority**: This is the most-requested missing feature from v2's user testing. Without it, every import is permanent and the library only grows. P1 because it's the smallest valuable slice of v3.

**Independent Test**: With at least one imported book in the library, a tester invokes delete on it, confirms, and verifies (a) the entry is gone from the visible list, (b) the entry doesn't reappear after a page refresh / simulator restart in the same process, (c) the bundled sample is unaffected, and (d) tapping the deleted book's would-be entry produces no errors.

**Acceptance Scenarios**:

1. **Given** the user has an imported book in their library, **When** they activate the delete affordance for that entry, **Then** a confirmation dialog appears showing the book's title and a clear statement of what will be deleted (the book content + reading position).
2. **Given** the confirmation dialog is open, **When** the user confirms, **Then** the entry is removed from the visible library, the persisted library index is updated, the per-book reading-position key is cleared, and the IndexedDB content for that book is deleted.
3. **Given** the confirmation dialog is open, **When** the user cancels, **Then** nothing is deleted; the library is unchanged.
4. **Given** the user attempts to delete the bundled sample, **When** the delete affordance for the sample is examined, **Then** it is either absent or non-functional, and the user sees a brief explanation that the sample cannot be removed.
5. **Given** a deletion has just completed, **When** the user immediately re-imports the same file, **Then** the import succeeds and the entry reappears (the previous deletion did not poison some duplicate-detection state).
6. **Given** the user is currently reading the book they're about to delete (the reader is open on the glasses with that book active), **When** they confirm deletion, **Then** the reader is gracefully exited (glasses display goes blank, returns to glasses' app menu) before the entry is removed.

---

### User Story 2 — Sort the library (Priority: P2)

A user with several books in the library wants to find one by title rather than by recency. They open the sort selector and pick "Title (A→Z)". The library re-orders. They can change back to the default ("Most recent") at any time, and their selection is remembered across sessions.

**Why this priority**: Useful once the user has > ~5 books. Independent of P1 because deletion and sorting are orthogonal capabilities.

**Independent Test**: With ≥ 4 books of varying titles, authors, dates added, and reading positions, a tester cycles through every sort option and confirms the order matches the option's documented intent. The tester then closes and re-opens the app and confirms the last-selected sort is still active.

**Acceptance Scenarios**:

1. **Given** the user has multiple books in the library, **When** they choose "Title (A→Z)", **Then** the entries re-order alphabetically by title (case-insensitive); ties broken consistently (e.g. by author A→Z).
2. **Given** "Author (A→Z)" is selected, **When** the user views the library, **Then** entries are ordered by author surname / display name; books with author "Unknown" fall in their natural alphabetical position (under U).
3. **Given** "Most completed" is selected, **When** the user views the library, **Then** entries are ordered by reading progress (current page / total pages) descending; never-opened entries fall to the bottom.
4. **Given** "Date added (newest first)" is selected, **When** the user views the library, **Then** entries are ordered by `addedAt` descending. (Distinct from the v2 default, which uses `max(addedAt, lastOpenedAt)`.)
5. **Given** the user has selected a sort order, **When** they close and re-open the app, **Then** the same sort order is applied automatically.
6. **Given** the user adds a new book under any sort order, **When** the import completes, **Then** the new entry appears in the correct position for the active sort, without the sort being silently changed.

---

### User Story 3 — Filter the library by text (Priority: P3)

A user with many books types into a small search box and the visible library narrows to entries whose title or author contains the search text (case-insensitive). Clearing the box restores the full list.

**Why this priority**: Useful as the library grows past ~20 books. P3 because tens-of-books is the v3 design point; thousand-book libraries are out of scope across all specs.

**Independent Test**: With ≥ 6 books whose titles share substrings (e.g. "Hamlet", "Macbeth", "King Lear", "The Time Machine", "Time Out"), a tester types substrings into the filter and verifies the visible list narrows correctly and clearing restores the full list.

**Acceptance Scenarios**:

1. **Given** the library has multiple books, **When** the user types into the filter input, **Then** only entries whose title or author contains the typed substring (case-insensitive) remain visible; the order respects the active sort.
2. **Given** the filter is non-empty and matches no books, **When** the user views the library, **Then** an empty-state message appears explaining "No books match '<query>'".
3. **Given** the filter is non-empty, **When** the user clears the input (delete characters or click a clear-button), **Then** the full library re-appears.
4. **Given** the filter is active, **When** the user imports a new book whose title/author matches the filter, **Then** the new entry appears in the filtered view; if it doesn't match, the user sees a brief notice that the book was added but is not in the current filter.
5. **Given** the filter is active, **When** the user closes and re-opens the app, **Then** the filter is **cleared** (filter state is per-session, not persistent).

---

### Edge Cases

- **Delete confirmation while reader is open**: the confirmation explicitly mentions that the active reader will close.
- **Delete during an import**: the delete affordance is hidden / disabled while an import is in progress for any book; user must wait for the import to complete (the import flow already disables the Add-book button — same envelope).
- **Sort by progress with mixed states**: a book with `lastOpenedAt: null` (never opened) is treated as `progress = 0` and falls to the bottom of "most completed".
- **Filter with special characters**: filter input is treated as a literal substring; regex characters (`.`, `*`, `(`) are not interpreted.
- **Filter while sort is "most completed"**: the order within the filtered view still respects the active sort.
- **Library with only the sample**: delete is non-functional for the sample; sort and filter still work but with one item the visible result is trivial.
- **Filter input persists across renders**: typing while the library re-renders (e.g. after an import) does not lose focus or text.
- **Sort selector during in-flight import**: changing sort while an import is running does not crash; the new order applies once the import completes.
- **Delete the same book twice rapidly**: the second confirmation is impossible because the entry is gone from the list; defensive guard in the delete-handler ensures the second invocation is a no-op rather than throwing.
- **Storage write failure during delete**: per Constitution Principle V, the failure surfaces a notice; the in-memory library is rolled back to its pre-delete state if the persist failed.

## Requirements *(mandatory)*

Functional requirements describe **what** the user can do. Numbers (latencies, percentages, durations) live in Success Criteria, not here.

### Functional Requirements

#### Delete

- **FR-001**: The library view MUST present a per-entry delete affordance for every imported book (not for the bundled sample).
- **FR-002**: Activating the delete affordance MUST present a confirmation dialog that names the book by title and clearly describes what will be removed (book content + reading position).
- **FR-003**: On confirmation, the system MUST remove the library entry from the persisted library index, delete the per-book reading-position key, and delete the IndexedDB content record for that book. All three deletions MUST occur as a coordinated unit; partial failure MUST roll back the in-memory library state and surface a notice.
- **FR-004**: On cancellation of the confirmation dialog, the system MUST NOT modify any persistent state.
- **FR-005**: The bundled sample MUST be undeletable — either by hiding the delete affordance or by clearly explaining that the sample cannot be removed.
- **FR-006**: If the user is currently reading the book being deleted, the system MUST gracefully exit the reader (run teardowns, call `shutDownPageContainer`) BEFORE removing the entry, leaving the glasses display in the app-menu state.
- **FR-007**: Deleting a book MUST NOT prevent re-importing the same file later; subsequent imports of identical content MUST succeed and produce a new entry.

#### Sort

- **FR-008**: The library view MUST present a sort selector with at minimum these options: "Most recent" (v2 default — `max(addedAt, lastOpenedAt)`), "Title (A→Z)", "Author (A→Z)", "Most completed", "Date added (newest first)".
- **FR-009**: When the user changes the sort, the library MUST re-render in the new order immediately and persist the choice for future sessions.
- **FR-010**: Sort comparators MUST be deterministic — the same library + sort produces the same order across re-renders. Ties MUST be broken by a documented secondary criterion (e.g. id lexicographic) so order is fully determined.
- **FR-011**: When a new book is added (import success or duplicate-bump), the library MUST re-sort under the active sort order rather than silently switching to "Most recent".

#### Filter

- **FR-012**: The library view MUST present a text-filter input that narrows the visible entries to those whose title OR author contains the input substring (case-insensitive).
- **FR-013**: The filter MUST be a literal substring match — regex / glob characters are not interpreted.
- **FR-014**: Clearing the filter input (empty string) MUST restore the full library at the active sort order.
- **FR-015**: When the filter matches no entries, the library view MUST display an empty-state message naming the current query.
- **FR-016**: The filter state MUST be **per-session** (not persisted); on app open it starts empty.
- **FR-017**: When an import succeeds during an active filter and the new entry does not match, the user MUST be informed (a transient notice) that the book was added but is not in the current view.

#### General

- **FR-018**: All v2 functional requirements (FR-001 through FR-021 of `specs/002-book-import/spec.md`) MUST continue to hold without regression. The v1 read loop MUST be unchanged.
- **FR-019**: Delete, sort, and filter operations MUST function fully offline; no network access required.

### Key Entities

- **LibrarySettings** (new): persistent user preferences — currently just `sort: SortOption`. Filter is NOT in this entity (it's per-session).
- **SortOption** (new enum): `"most-recent" | "title-asc" | "author-asc" | "most-completed" | "date-added-desc"`.
- **Book**, **LibraryEntry**, **Library**, **ReadingPosition** — carry forward unchanged from v2.

## Success Criteria *(mandatory)*

Numbers below are provisional v3 targets, validated in the simulator and revisited after the first hardware-validation pass per the constitution's "What we don't yet know" section.

- **SC-001**: A user can complete a delete (from delete-tap to entry gone from the list) in under 5 seconds for any single book, including confirmation.
- **SC-002**: 100% of deletes correctly clear all three storage locations (library index, reading-position key, IndexedDB content). Verified by post-delete inspection.
- **SC-003**: The bundled sample cannot be deleted by any user action.
- **SC-004**: Switching sort order re-renders the library within 200 ms in the simulator for libraries up to 50 entries.
- **SC-005**: Sort selection persists across app close/reopen in 100% of cases.
- **SC-006**: Filter is responsive — typing produces visible narrowing within one frame (≤ 16 ms) for libraries up to 50 entries.
- **SC-007**: After a delete, the user can re-import the same file and see the entry return.
- **SC-008**: After a delete-while-reading, the glasses display returns cleanly to the app menu and the entry is gone from the library.

## Assumptions

These were chosen as defaults during drafting; revisit if they bite.

1. **Sample stays undeletable forever.** Even in v3, the bundled sample is the always-present "starting book" — deleting it would require re-bundling the app or providing a pseudo-delete that just hides it. Out of scope.
2. **Library design point ≤ 50 books.** Sort + filter must feel snappy at this scale. Larger libraries work but UX is not optimised for them; virtualised lists are out of scope.
3. **No undo / trash window.** Delete is immediate (after confirmation) and irreversible. Adding undo is itself a feature; not in v3.
4. **Sort persistence is a single setting.** No per-collection sort, no per-author sort.
5. **Filter is per-session.** Resets on every app open; rationale: a user opens the library to act, not to resume a search.
6. **Filter scope is title + author only.** Full-text search of book content is out of scope.
7. **Confirmation is a phone-side modal-style dialog.** Not a glasses-side prompt (deletion is a phone-only action; the glasses don't need to know about it until and unless the active book is being deleted, in which case FR-006 handles cleanup).
8. **No localisation.** UI strings are English; consistent with v1 + v2.

## Dependencies

- Carries forward all v1/v2 dependencies: Even Realities companion app + paired G2 glasses + read access to phone storage for imports.
- No new third-party services or network resources.

## Risks & Unknowns

- **R1: Storage rollback semantics.** If the IndexedDB delete succeeds but the library-index write fails, the persisted state is inconsistent until next save. Mitigation: order deletions library-first (so a failure leaves IndexedDB content with no library entry, which is a known content-evicted state v2 already handles — see `specs/002-book-import/contracts/persistence-v2.md`).
- **R2: Confirmation-dialog UX on the phone.** A native-feeling modal in a WebView is harder than it looks; HTML `<dialog>` element is broadly supported but has subtle keyboard-trap behaviour. Mitigation: use a small in-page modal-style overlay with a focus trap that we control, or accept the simpler `<dialog>` defaults and refine later.
- **R3: Sort key parsing for "Author (A→Z)".** Authors are free-form strings; "Edgar Allan Poe" should sort under E or P depending on convention. Mitigation: ship the simplest "compare full author string" comparator; document as a known approximation; hardware-validation may show the user wants surname-first sorting.
- **R4: Filter performance with very long titles / accented characters.** Case-insensitive substring on Latin script is trivial; CJK / RTL is out of scope across the project. Mitigation: confirmed via SC-006 timing.
- **R5: Race between delete and an in-flight save.** If a writePosition for the deleted book is in flight when delete fires, the post-delete state could include a stale position key. Mitigation: cancel any pending writes for the deleted book id (or accept the small one-cycle race and clean up in the next read).

## Out of Scope (v3)

- Tags, collections, folders.
- Multi-select / batch operations.
- Trash / undo-delete.
- Cloud sync, OPDS, online catalogs, store integrations.
- PDF, MOBI, AZW3, audiobook formats.
- Highlights, bookmarks, notes.
- CJK and RTL text handling.
- Multi-user profiles.
- TTS / audio output.
- Reading stats, gamification.
- Configurable font size, line spacing, brightness, theme.
- Image rendering inside book pages.
- Drag-and-drop reordering.
- Per-book metadata editing (rename, change author, replace cover).
- Reading-progress visualisation beyond the v1 status text.
- Cross-disconnect resilience improvements (→ deferred to spec 004 if/when it lands).
