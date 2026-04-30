# Phase 0 Research — evenBooks v3 (Library Management)

For each: **Decision**, **Rationale**, **Alternatives**.

---

## R1 — Sort comparator authority

**Question**: Where do per-option comparators live, and how does the library view request the right one?

**Decision**: Add a `comparatorFor(option: SortOption): Comparator<LibraryEntry>` factory in `src/library/library-entry.ts`, alongside the existing `compareLibraryEntries`. The factory returns the right comparator for each enum value. The library state machine doesn't bake a comparator in; it stores a `sort: SortOption` and calls `entries.slice().sort(comparatorFor(sort))` whenever it produces an ordered view.

Per-option rules:

- `most-recent` — `max(addedAt, lastOpenedAt ?? 0)` desc, ties by `id` asc. **Same as v2's existing comparator.**
- `title-asc` — title (case-insensitive `localeCompare`) asc, ties by author (ci) asc, then id asc.
- `author-asc` — author (ci) asc, ties by title (ci) asc, then id asc.
- `most-completed` — `(currentPage / totalPages)` desc; never-opened entries treated as 0; ties by title asc.
  - "Current page" comes from the per-book reading-position cache loaded once at app start. If the reading-position is unknown for an entry (loaded async), the comparator treats it as 0 (entry sinks to the bottom until the load completes).
- `date-added-desc` — `addedAt` desc, ties by id asc.

**Rationale**: Comparators are pure functions — easy to test exhaustively. Centralising them in `library-entry.ts` keeps sort logic next to the entry shape and away from the UI. The library view requests an order; it doesn't decide on one.

**Alternatives**:

- _Inline comparators in the UI_ — couples sort logic to the renderer, makes unit tests awkward. Rejected.
- _Class-based comparators_ — overkill for v3's five options; pure functions are simpler and faster.

---

## R2 — Delete coordination & rollback ordering

**Question**: Delete touches three storage locations. What's the right order, and how do we handle partial failure?

**Decision**: Order is **(1) library index → (2) reading-position key → (3) IndexedDB content**.

State machine:

```text
deleteBook(id):
  preconditions:
    if id === "sample" → reject with { kind: "refused", reason: "sample-undeletable" }
    if active reader has this book → first await reader.exit()

  step 1: library index
    nextLib = removeEntry(library, id)
    saveLibrary(bridge, channel, nextLib)
      on success → continue to step 2
      on failure → ROLLBACK (library state unchanged); surface notice; reject

  step 2: reading-position key
    bridge.setLocalStorage(positionKeyFor(id), "")
      on failure → log warning; do NOT roll back step 1 (the entry is already
                   gone from the library; an orphan position key is harmless
                   and will be cleaned up the next time we load+save)

  step 3: IndexedDB content
    deleteBookContent(id)
      on failure → log warning; do NOT roll back. An orphan IndexedDB record
                   is similarly harmless (no library entry references it).

  resolve with { kind: "deleted" }
```

**Why library-first**: if we deleted IndexedDB first and then failed to update the library, the user would see the entry but it would be content-evicted on next tap (an inferior recovery state). Library-first means a partial failure leaves only orphans in lower layers — invisible to the user, cleanable in the background.

**Rationale**: Three-step coordinated delete with library-first ordering minimises user-visible inconsistency on partial failure. Constitution Principle V is honoured — the rollback case (step 1 fails) surfaces a notice.

**Alternatives**:

- _Two-phase commit_ — overkill for three independent storage operations on a single device.
- _Reverse order (IndexedDB first)_ — leads to inferior recovery state on partial failure (see above).
- _All-three-fire-and-forget_ — could leave the library entry visible while content is gone, producing a confusing tap experience. Rejected.

---

## R3 — Filter strategy

**Question**: How does the filter compare a query string to library entries?

**Decision**: Pure substring match. `applyFilter(entries, query)`:

```text
if query.trim() === "" → return entries
needle = query.toLowerCase().trim()
return entries.filter(e =>
  (e.title + " " + e.author).toLowerCase().includes(needle)
)
```

Computed on every render. At design point ≤ 50 entries this is negligible (< 0.1 ms).

**Rationale**: Trivial, predictable, no regex injection surface, no library required. Case-insensitive via `toLowerCase`; that's adequate for Latin script (the v2 supported scope).

**Alternatives**:

- _Regex match_ — exposes regex-injection footguns. Rejected (Spec FR-013 explicitly forbids).
- _Fuzzy match_ (Levenshtein, fzf-style) — meaningful only for libraries 100+ items. Rejected for v3 design point.
- _Title-only match_ — author search is genuinely useful. Rejected.
- _Pre-built index_ — overkill at ≤ 50 entries.

---

## R4 — Settings persistence layer

**Question**: Where do we store the sort preference?

**Decision**: New KV key `evenBooks.settings.v3`. JSON shape:

```ts
type StoredSettings = { version: 3; sort: SortOption };
```

Read on bootstrap (after migration, before the first library render). On parse failure, recover with `default = { version: 3, sort: "most-recent" }` and emit a `recovery/unparseable` notice. Write on every sort change. Single key, < 50 bytes.

**Rationale**: Same channel and discipline as the v2 library index (`evenBooks.library.v2`). Future settings (e.g. a deletion-confirmation-suppression toggle) can extend this object without bumping the key.

**Alternatives**:

- _Inline into library index_ — couples settings churn to library churn. Rejected.
- _IndexedDB-only_ — adds a transaction for trivially small data. Rejected.

---

## R5 — Confirmation-dialog implementation

**Question**: How is the delete confirmation rendered? Native `<dialog>` element, or in-page overlay?

**Decision**: In-page overlay built from `<div>` + CSS, with focus trap, Escape-to-cancel, and backdrop-click-to-cancel. Lives in `src/ui/delete-confirm.ts`.

**Rationale**: Native `<dialog>` is broadly supported but has subtle differences across WebView versions (especially older Android WebViews) — auto-focus rules, scroll-locking behaviour, backdrop styling all vary. A handcoded overlay is more code but predictable across our deployment surface.

**Alternatives**:

- _Native `<dialog>`_ — viable; can be added in a follow-on if we want to drop the custom overlay code.
- _No confirmation_ — violates spec FR-002. Rejected.
- _Inline confirm button (slide-in undo)_ — adds an undo concept; spec explicitly defers undo to a future spec. Rejected.

---

## R6 — Race between delete and in-flight save

**Question**: If `writePosition(book=X)` is in flight when the user deletes book X, the save could land after the position-key clear, leaving an orphan key.

**Decision**: Maintain a Set-based "tombstone" of deleted ids in main.ts (or in a small module shared with persistence). When `writePosition` is called, it checks the tombstone first; if the book id is tombstoned, the write is silently dropped. Tombstone entries auto-clear after ~1 s (long enough to absorb any in-flight write).

**Rationale**: Simpler than cancellable promises. The tombstone is an explicit "we just deleted this; ignore stragglers" gate. 1 s window is conservative; in practice writes complete in tens of milliseconds.

**Alternatives**:

- _Cancel in-flight saves_ — `bridge.setLocalStorage` doesn't expose cancellation. Rejected.
- _Accept the orphan and clean it up later_ — works, but adds noise on the next load (an unexpected position key for an entry that doesn't exist). Rejected.
- _Tombstone forever_ — leaks; not necessary because re-imports get a fresh save once the user resumes reading. The 1 s window is enough.

---

## R7 — Delete-while-reading sequencing

**Question**: If the user is reading book X on the glasses and deletes it, what's the right sequence?

**Decision**:

```text
1. orchestrator notices: state.activeBook.id === target id
2. orchestrator calls reader.exit() → which:
     - runs the reader teardown registry (unsubs all SDK listeners for the active session)
     - calls bridge.shutDownPageContainer(0)
     - sets activeState = null
3. orchestrator then performs the three-step storage cleanup (R2)
4. UI re-renders: entry gone, glasses display blank (back to glasses' app menu)
```

Step 2 is awaited before step 3 starts. This ensures the glasses don't render a "ghost" of a book whose content is about to vanish.

**Rationale**: Honours Constitution Principle V (no surprises, no silent state corruption). The user sees the reader exit cleanly _before_ the entry disappears, mirroring the natural mental model.

**Alternatives**:

- _Delete first, then exit reader_ — leaves a brief window where the glasses display references state that no longer exists in the library; if any reconnect or page-change happens during that window, the reader could try to load content from a deleted IndexedDB record. Rejected.
- _Refuse to delete the active book_ — over-conservative; the user has the right to delete what they want.

---

## Summary table

| ID  | Topic                    | Decision                                                                |
| --- | ------------------------ | ----------------------------------------------------------------------- |
| R1  | Sort comparators         | `comparatorFor(option)` factory in library-entry.ts; 5 pure comparators |
| R2  | Delete order             | Library → position-key → IndexedDB; rollback only on step 1 fail        |
| R3  | Filter                   | Pure substring match on `(title + " " + author).toLowerCase()`          |
| R4  | Settings storage         | `evenBooks.settings.v3` KV key; recover-with-notice on parse failure    |
| R5  | Confirmation dialog      | Handcoded overlay with focus trap; not native `<dialog>`                |
| R6  | Delete vs in-flight save | 1 s tombstone window; pending writes for tombstoned ids drop silently   |
| R7  | Delete-while-reading     | Reader exit fully resolves before storage cleanup begins                |

All NEEDS CLARIFICATION items resolved. Phase 1 design proceeds.
