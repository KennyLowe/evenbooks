# Phase 1 Data Model — evenBooks v1

The app has three persistent / structural entities (`Book`, `Page`, `ReadingPosition`) and one in-memory state machine (`ReaderState`). All are TypeScript types; v1 has no database, no schema migrations, and a single bundled book.

The phone is authoritative for all instances of these types (Constitution Principle III). The glasses display is a derived projection of `ReaderState`.

---

## Book

A unit of reading material. v1 ships with exactly one `Book` instance, defined as a `const` at build time.

```ts
type BookId = "sample"; // v1: only one possible value; widened to string in spec 002

interface Book {
  readonly id: BookId;
  readonly title: string; // shown on phone-side UI; never on glasses
  readonly author: string; // shown on phone-side UI; never on glasses
  readonly text: string; // full body; whitespace-normalised at build (see R7)
}
```

Constraints:

- `text` must be non-empty after whitespace normalisation. Build-time check; if empty, build fails.
- `title.length ≤ 64` (phone-UI typography budget; not enforced at build but documented).

v1 instance:

```ts
export const SAMPLE_BOOK: Book = {
  id: "sample",
  title: "The Tell-Tale Heart",
  author: "Edgar Allan Poe",
  text: "True!—nervous—very, very dreadfully nervous I had been …",
} as const;
```

---

## Page

A paginated chunk of `Book.text` formatted to fit one glasses frame. Pages are _derived_ — they are not user-edited, not stored, and not transmitted across persistence boundaries. They are computed once per session by the pagination engine.

```ts
interface Page {
  readonly index: number; // 0-based; 0 = first page
  readonly text: string; // ≤ 600 chars (hard cap from R1)
  readonly isFirst: boolean; // index === 0
  readonly isLast: boolean; // index === totalPages - 1
}
```

Pagination rules (committed in `src/reader/pagination.ts`, per Phase 0 R1):

1. Walk source text in order; greedy fill of lines (≤ `CHARS_PER_LINE = 48`).
2. Greedy fill of pages (≤ `LINES_PER_PAGE = 6`).
3. Words longer than `CHARS_PER_LINE` hard-break at exactly `CHARS_PER_LINE`.
4. Paragraph break (`\n\n`) prefers a page boundary but does not force one (avoids one-line orphan pages).
5. Output: `Page[]` with `index` matching array position; `totalPages = pages.length`.
6. Pure function: `paginate(text: string, opts?: { charsPerLine, linesPerPage }): Page[]`. Deterministic given the same inputs.

**Why pure**: makes pagination unit-testable without a bridge or simulator (Constitution Principle VI — pure-logic tests encouraged).

---

## ReadingPosition

The persisted state — the only thing that crosses the app-restart boundary.

```ts
interface ReadingPosition {
  readonly book: BookId;
  readonly page: number; // 0-based index into the Page[] for that book
  readonly savedAt: number; // ms since epoch; used only for diagnostics, never read for logic
}
```

Storage: `bridge.setLocalStorage("evenBooks.position.v1", JSON.stringify(position))`.
Retrieval and recovery: see `contracts/persistence.md` for the full state machine.

Validation on read:

- JSON.parse must succeed.
- `book` must equal the currently-loaded book's id (v1: always `"sample"`).
- `page` must be an integer in `[0, totalPages)`.
- Any failure → recover per Phase 0 R6.

---

## ReaderState (in-memory)

The app's runtime state machine. Lives only while the WebView is alive; rebuilt from `ReadingPosition` + `Book` at every launch and after every reconnect.

```ts
type ReaderMode =
  | { kind: "reading"; pageIndex: number }
  | { kind: "clamp-flash"; pageIndex: number; flashUntil: number } // flashUntil = timestamp ms
  | { kind: "end-of-book" }
  | { kind: "exiting" };

interface ReaderState {
  readonly book: Book;
  readonly pages: readonly Page[];
  readonly mode: ReaderMode;
  readonly connection: "connected" | "connecting" | "not-connected";
}
```

Reducer-style transitions (committed in `src/reader/reader.ts`):

| Current mode                  | Event                                   | Next mode                        | Side effects                                                         |
| ----------------------------- | --------------------------------------- | -------------------------------- | -------------------------------------------------------------------- |
| `reading(N)`, N < lastIndex   | `NEXT_PAGE`                             | `reading(N+1)`                   | Persist position; render page N+1                                    |
| `reading(N)`, N === lastIndex | `NEXT_PAGE`                             | `end-of-book`                    | No persist (still on N); render end-of-book frame                    |
| `reading(N)`, N > 0           | `PREV_PAGE`                             | `reading(N-1)`                   | Persist position; render page N-1                                    |
| `reading(0)`                  | `PREV_PAGE`                             | `clamp-flash(0, now+1000)`       | Render clamp-flash frame; schedule revert                            |
| `clamp-flash(N, t)`           | `TIMER_EXPIRED` (now ≥ t)               | `reading(N)`                     | Render page N                                                        |
| `clamp-flash(N, t)`           | any other input                         | (queued; processed after revert) | (input queue)                                                        |
| `end-of-book`                 | `NEXT_PAGE`                             | `exiting`                        | Call `bridge.shutDownPageContainer(0)`                               |
| `end-of-book`                 | `PREV_PAGE`                             | `reading(lastIndex)`             | Render last page                                                     |
| any                           | `EXIT` (swipe down)                     | `exiting`                        | Persist position; teardown subs; `bridge.shutDownPageContainer(0)`   |
| any                           | `RECONNECT` (device status → connected) | (mode unchanged)                 | Re-issue current frame's `textContainerUpgrade` (idempotent rebuild) |

Idempotency rule (Constitution Principle III): re-rendering the current frame must produce no observable user effect beyond reaffirming the display. Specifically: the same pageIndex → same payload → same rendered frame.

Input queue rule: when the reader is in `clamp-flash`, incoming `NEXT_PAGE` / `PREV_PAGE` events queue and apply after the flash-revert. Spec edge case: "Touchpad event fires during page render — input is queued; the in-flight render completes, then the queued input applies."

---

## Out-of-scope entities (deferred)

These are intentionally absent from v1. They appear in follow-on specs:

- `Library` — multi-book collection (spec 003).
- `ImportJob` — async import progress entity (spec 002).
- `UserProfile` — settings / preferences (no spec yet).
- `ReadingSession` history — analytics (no spec yet).
