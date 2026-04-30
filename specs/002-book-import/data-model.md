# Phase 1 Data Model — evenBooks v2 (Book Import)

This document specifies every persistent and structural type in v2. Many extend or reuse v1's types verbatim — those are flagged. New types are introduced for the library, the import pipeline, and the multi-book persistence schema.

The phone is authoritative for all instances of these types (Constitution Principle III). The glasses display continues to be a derived projection of an active `ReaderState` (v1) — that side of the system is untouched by v2.

---

## Book (extended from v1)

A unit of reading material. v2 generalises v1's `Book` to cover both bundled and imported books.

```ts
type BookId = "sample" | string; // "sample" is reserved for the bundled book; all other ids are 16-hex-char SHA-256 truncations.

type BookFormat = "bundled" | "epub" | "text";

interface Book {
  readonly id: BookId;
  readonly title: string;
  readonly author: string;
  readonly format: BookFormat;
  readonly text: string; // Whitespace-normalised body; \n\n separates paragraphs.
}
```

Constraints:

- `id` is stable per file content (R4). The bundled sample uses literal `"sample"`.
- `text` is the input to the v1 `paginate()` function; constraints from v1 carry forward (non-empty after normalisation).
- `title.length ≤ 256` (defensive cap; phone-side UI truncates with ellipsis at display time).

The bundled instance lives at compile time in `src/content/sample-text.ts` — its shape is widened from v1's anonymous `Book` to the v2 interface above. No field renames; backwards-compatible.

---

## Page (unchanged from v1)

```ts
interface Page {
  readonly index: number; // 0-based.
  readonly text: string; // ≤ 600 chars (v1 hard cap).
  readonly isFirst: boolean;
  readonly isLast: boolean;
}
```

Computed by the **same** v1 `paginate(text, opts?)` function for both bundled and imported books. Persisted to IndexedDB as `string[]` (an array of `Page.text` values; `index`/`isFirst`/`isLast` are recomputed from array position on read).

---

## LibraryEntry (new)

A library entry is the user-perceptible record of a book — what's listed in the phone-side library view. It's intentionally lightweight (everything that fits in the SDK KV store) and references the bulky content (text + paginated pages) by id, which lives in IndexedDB.

```ts
interface LibraryEntry {
  readonly id: BookId;
  readonly title: string;
  readonly author: string;
  readonly format: BookFormat;
  readonly addedAt: number; // ms since epoch
  readonly lastOpenedAt: number | null; // ms since epoch; null until first open
  readonly totalPages: number; // computed at import time, persisted for sort/UI; never recomputed in v2
}
```

Constraints:

- `id` matches the `Book.id` produced at import time.
- `addedAt` is set once on import (or, for the bundled sample, at install / migration time) and never changes.
- `lastOpenedAt` updates each time the user opens the book on the glasses (i.e. the book becomes the active reader).
- `totalPages` is set at import and is immutable for the lifetime of the entry. If the v2 pagination engine ever changes its constants, a future spec must define a re-pagination migration; in v2 we never recompute.

---

## Library (new)

The in-memory + persisted ordered collection of library entries.

```ts
interface Library {
  readonly entries: readonly LibraryEntry[]; // ordered by sort comparator (see below)
  readonly version: 2; // schema version; bumps on incompatible migrations
}
```

**Sort comparator**: `(a, b) => recentActionMs(b) - recentActionMs(a)` where:

```ts
function recentActionMs(entry: LibraryEntry): number {
  return Math.max(entry.addedAt, entry.lastOpenedAt ?? 0);
}
```

Most-recent action first. Ties (within the same millisecond) are broken by `id` lexicographically — deterministic but practically irrelevant.

The bundled sample's `addedAt` is set to "now" the very first time the v2 library is materialised (either via migration or fresh install). Its `lastOpenedAt` is null until the user opens it.

**Persistence**: serialised as JSON to `bridge.setLocalStorage("evenBooks.library.v2", JSON.stringify(library))`. Read on bootstrap; written immediately after every mutation (matching v1's "persist on every change" discipline from spec FR-006 / FR-013, generalised).

Validation on read:

- JSON parses.
- `version === 2`.
- `entries` is an array; each entry has all required fields.

Failure → recover with an empty library (sample re-bootstrapped from the bundled `SAMPLE_BOOK`); surface a "Couldn't restore your library" notice.

---

## ReadingPosition (extended from v1)

Per-book reading position. Same shape as v1 but scoped per book.

```ts
interface ReadingPosition {
  readonly book: BookId;
  readonly page: number; // 0-based; integer in [0, totalPages)
  readonly savedAt: number; // ms since epoch; informational
}
```

Storage: `bridge.setLocalStorage("evenBooks.position." + bookId, JSON.stringify(position))`.

Read recovery (carries forward from v1's `contracts/persistence.md`, generalised to take a `bookId`): same five outcomes (`fresh-start`, `resumed`, `recovered/unparseable`, `recovered/wrong-book`, `recovered/out-of-range`), surfaced through the v1 transient notice channel.

---

## ImportOutcome (new)

Result of an import attempt. Discriminated union — every branch is reachable from spec FR-015's enumeration.

```ts
type ImportOutcome =
  | { kind: "success"; book: Book; entry: LibraryEntry }
  | { kind: "duplicate"; existingEntry: LibraryEntry }
  | { kind: "failure"; reason: ImportFailureReason };

type ImportFailureReason =
  | "drm-protected"
  | "malformed"
  | "unsupported-format"
  | "oversize"
  | "unsupported-encoding"
  | "empty"
  | "storage-full";
```

`success` carries both the parsed `Book` and the just-created `LibraryEntry` so the caller can pre-populate UI without re-reading from storage.

`duplicate` is a non-error outcome (no failure message to the user, just a confirmation that we used the existing copy).

`failure` is the typed-refusal path. Each `reason` maps 1:1 to a canonical user-facing message defined in `contracts/import-pipeline.md`.

---

## ImportJob (transient — runtime only, never persisted)

Tracks a single in-flight import for the UI's progress indicator. Lives only while the import is running.

```ts
interface ImportJob {
  readonly id: string; // generated; lasts only for this job
  readonly filename: string; // for the "Importing 'filename'…" indicator
  readonly status: "running" | "completed" | "failed";
  readonly outcome?: ImportOutcome; // populated when status !== 'running'
}
```

Lifecycle:

```text
running ──completed──→ outcome = { kind: 'success' | 'duplicate' | 'failure', ... }
        ──failed────→ (only for catastrophic JS errors that bypass the typed pipeline; rare)
```

Only one `ImportJob` runs at a time in v2: a second "Add book" tap while a job is in `running` status is ignored (with optional click-disabled visual on the button).

---

## ReaderState (unchanged from v1, with one note)

The v1 reader state machine is unchanged. The reducer's input remains `(state, event) → { next, render, persist, exit }` with `state.book: Book` and `state.pages: readonly Page[]`.

```ts
type ReaderMode =
  | { kind: "reading"; pageIndex: number }
  | { kind: "clamp-flash"; pageIndex: number; flashUntil: number }
  | { kind: "end-of-book" }
  | { kind: "exiting" };

interface ReaderState {
  readonly book: Book;
  readonly pages: readonly Page[];
  readonly mode: ReaderMode;
  readonly connection: "connected" | "connecting" | "not-connected";
}
```

The only material change at the call-site is in `main.ts`: `state.book` and `state.pages` are now constructed from the _currently-active_ `LibraryEntry` (looked up by `BookId` and joined with the IndexedDB-stored `text` + `pages`), rather than from the bundled `SAMPLE_BOOK` constant directly.

The reducer itself remains a pure function and untouched — Constitution Principle III's idempotent rebuild on reconnect still works for any `Book`.

---

## Storage layout (full picture)

| Layer                    | Key / Object                                  | Shape                                                 | Size (typical)                                |
| ------------------------ | --------------------------------------------- | ----------------------------------------------------- | --------------------------------------------- |
| `bridge.setLocalStorage` | `evenBooks.library.v2`                        | `Library` JSON                                        | ~hundreds of bytes per entry                  |
| `bridge.setLocalStorage` | `evenBooks.position.<bookId>` (one per book)  | `ReadingPosition` JSON                                | < 100 bytes each                              |
| `bridge.setLocalStorage` | `evenBooks.position.v1`                       | (deprecated, deleted on first v2 launch by migration) | —                                             |
| WebView IndexedDB        | DB `evenBooks`, store `books`, key = `BookId` | `{ text: string, pages: string[] }`                   | up to ~50 MB per book (per Spec Assumption 6) |

`bookId === "sample"` is special: there is no IndexedDB record for the sample (the content is bundled). Reads of `getBookContent("sample")` short-circuit to the compiled `SAMPLE_BOOK` constant.

---

## State transitions (high level)

```text
┌──────────────────┐        ┌────────────────────┐        ┌────────────────┐
│  Bootstrap       │ ──→    │  Library view      │ ──→    │  Reader (v1)   │
│  - migrate v1    │        │  - list entries    │        │  - active Book │
│  - load library  │        │  - import flow     │        │  - reads on    │
│  - sample boot   │        │  - tap to open     │        │    glasses     │
└──────────────────┘        └────────────────────┘        └────────────────┘
                                  │   ▲
                                  ▼   │
                            ┌──────────────────┐
                            │  Import pipeline │
                            │  - file picker   │
                            │  - parse         │
                            │  - paginate      │
                            │  - dedup         │
                            │  - store         │
                            │  - update lib    │
                            └──────────────────┘
```

Bootstrap → Library view is the new path in v2. Library view → Reader is also new (v1 went straight from bootstrap to reader). Once in Reader, the v1 state machine takes over; on exit (swipe-down or end-of-book → press), the Reader does NOT return to the Library view — it returns to the glasses' app menu (preserving v1 FR-005 behaviour). The user re-opens evenBooks to re-enter the Library view.

---

## Out-of-scope entities (deferred)

Carries forward from v1 plus v2-specific deferrals:

- `ImportJob` history / retry — v2 keeps the most recent job in memory and discards on next; no list of past imports.
- `Collection` / `Tag` — collection / tag entities are 003-library territory.
- `ReadingSession` history — analytics-style entity; never a v2 concern.
- `UserProfile` — single user assumed, no profile entity needed.
