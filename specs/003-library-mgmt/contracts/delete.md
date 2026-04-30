# Contract: Delete Orchestrator

The coordinated three-step deletion. Lives in `src/platform/delete-book.ts`.

## Entry point

```ts
async function deleteBook(args: {
  id: BookId;
  bridge: EvenAppBridge;
  channel: NoticeChannel;
  library: Library;
  exitActiveReaderIfMatching: (id: BookId) => Promise<void>;
}): Promise<DeleteOutcome>;

type DeleteOutcome =
  | { kind: "deleted"; library: Library }
  | { kind: "refused"; reason: "sample-undeletable" }
  | { kind: "failed"; reason: "library-write-failed"; library: Library };
```

`exitActiveReaderIfMatching` is supplied by the caller (main.ts). It awaits a clean reader exit if the active book matches `id`; resolves immediately otherwise.

Returns the new `Library` (with the entry removed) on success. On `refused` (sample), returns the original library; the caller should display a brief explanation. On `failed` (library write failed), the original library is returned unmutated and the caller should surface a notice.

## State machine

```text
START
 │
 ├─ if id === "sample"
 │   └─ return { kind: "refused", reason: "sample-undeletable" }
 │
 ├─ exit reader if active book matches (await fully)
 │
 ├─ STEP 1: library index
 │   nextLib = removeEntry(library, id)
 │   try await saveLibrary(bridge, channel, nextLib)
 │     on rejection / setLocalStorage failure
 │       channel.emit({ kind: "save-failed" })
 │       return { kind: "failed", reason: "library-write-failed", library }
 │
 ├─ insert tombstone(id, ttl=1000ms)   ← absorbs in-flight position writes
 │
 ├─ STEP 2: per-book position key (best-effort)
 │   try await bridge.setLocalStorage(positionKeyFor(id), "")
 │     on failure → console.warn; do NOT roll back step 1
 │
 ├─ STEP 3: IndexedDB content (best-effort)
 │   try await deleteBookContent(id)
 │     on failure → console.warn; do NOT roll back step 1
 │
 └─ return { kind: "deleted", library: nextLib }
```

## Tombstone window

Insert into a process-local Map keyed by `BookId` with a 1000 ms timeout. The persistence layer's `writePosition` checks this Map and silently drops writes for tombstoned ids. Re-imports of the same content (after the window) are unaffected — they create a fresh entry and a fresh position key.

## Test coverage (Vitest)

`tests/unit/delete-book.test.ts`:

- Happy path: deleteBook for an imported entry → `kind: "deleted"`, library no longer contains it, position key was cleared, IndexedDB content was deleted.
- Sample refusal: deleteBook(`"sample"`) → `kind: "refused"`, library unchanged, no storage touched.
- Step 1 failure: mock saveLibrary to throw → `kind: "failed"`, library returned unchanged, save-failed notice emitted.
- Step 2 best-effort: mock setLocalStorage to reject for the position key → `kind: "deleted"` still (library entry is gone); no notice for the position key.
- Step 3 best-effort: mock deleteBookContent to throw → `kind: "deleted"` still.
- Tombstone: after deleteBook, call writePosition with the same book id within 1 s → no actual setLocalStorage call (write was dropped).
- Tombstone expiry: after 1.5 s, writePosition for the same book id calls setLocalStorage normally (the tombstone has expired).
- Active-book delete: exitActiveReaderIfMatching is awaited before storage cleanup. Verified by ordering the mock fake bridges to assert sequence.
