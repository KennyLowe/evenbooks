# Contract: Library UI (Phone-Side)

The phone-side WebView surface in v2 grows from v1's "minimal status block" into a small but real library / import UI. It still runs in the WebView hosted by the Even Realities companion app. No framework. No router. Imperative DOM mutation against a static `index.html` skeleton.

The glasses-side reader UI is unchanged from v1.

---

## Surface

```html
<main id="phone-status">
  <header>
    <h1>evenBooks</h1>
    <p class="connection" data-state="connecting">Connecting…</p>
  </header>

  <!-- v1 reading status, shown when a book is active on the glasses -->
  <section class="reading" hidden>
    <p class="title"></p>
    <p class="author"></p>
    <p class="progress"></p>
  </section>

  <!-- v2 NEW: import flow -->
  <section class="import">
    <button class="add-book" type="button">Add book</button>
    <input class="file-picker" type="file" accept=".epub,.txt" hidden />
    <p class="import-progress" hidden>
      <span class="spinner" aria-hidden="true"></span>
      <span class="progress-text"></span>
    </p>
    <p class="import-error" hidden></p>
  </section>

  <!-- v2 NEW: library list -->
  <section class="library">
    <h2>Your library</h2>
    <ul class="entries"></ul>
  </section>

  <!-- v1 transient notice channel -->
  <aside class="notice" hidden></aside>
</main>
```

The HTML skeleton is rendered statically at build (Vite). Runtime updates only mutate text content, attributes (`hidden`, `data-state`), and the children of `.entries`.

---

## State-to-DOM mapping

### Connection state (carries forward from v1)

Unchanged from v1's `contracts/phone-ui.md`.

### Reading section

Visible only when a book is **actively open on the glasses** (i.e. the reader has been entered from a library tap or a glasses-menu launch). Hidden when the user is browsing the library without an active reader session.

When visible, mirrors v1's status block:

- `.title` — current book's title.
- `.author` — current book's author.
- `.progress` — `"Page X of Y"` (or `"Reader closed (was on Page X of Y)"` after exit, per v1 fix).

### Import section

| State                                      | DOM                                                                                                                                                                                                |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Idle (no import running, no error to show) | `.add-book` enabled; `.import-progress` hidden; `.import-error` hidden.                                                                                                                            |
| Import in progress                         | `.add-book` disabled; `.import-progress` visible with `.progress-text` set to `Importing '<filename>'…`; `.import-error` hidden.                                                                   |
| Import succeeded                           | Indicator clears (back to Idle); the new entry appears in `.entries` (by re-rendering); no error.                                                                                                  |
| Import failed                              | Indicator clears; `.import-error` visible with the canonical message for the failure `reason` (per `contracts/import-pipeline.md`); persists until next user interaction.                          |
| Duplicate detected                         | Same as Import failed visually, but with the duplicate confirmation message ("Already in your library — opening the existing copy."). The existing library entry is bumped to the top of the list. |

The `.import-error` slot is **persistent** — it is dismissed when the user takes their next interaction:

- Tapping `.add-book` again (starts a new import).
- Tapping any library entry (opens that book).
- (Optional, not v2-required) An explicit close button on the error.

### Library section

`.entries` is a `<ul>` that renders the library entries in the in-memory sort order (most-recent-action first; see `data-model.md`). Each entry is an `<li>`:

```html
<li class="entry" data-book-id="...">
  <p class="entry-title">Book title</p>
  <p class="entry-author">Author name</p>
</li>
```

Optional decoration:

- An entry whose IndexedDB content is currently absent (`getBookContent(id) === null`, e.g. evicted) gets `data-content="evicted"` and a "Content cleared by your phone — re-import to continue" sub-line; tapping is intercepted to surface a v1 transient notice rather than entering the reader.

Tapping an entry calls `openBookOnGlasses(entry.id)`, which:

1. Loads the book's content via `book-store.ts` (or short-circuits to `SAMPLE_BOOK` for `id === "sample"`).
2. If content is missing: notice "This book's content was cleared by your phone. Please re-import." (transient channel); return.
3. Updates `entry.lastOpenedAt = now`; writes the library back; re-renders the list (entry moves to the top).
4. Calls into the existing v1 read-loop bootstrap path with `state.book = book; state.pages = ...`.
5. Reveals the `.reading` section with the new book's metadata.

---

## Lifecycle hooks

`src/ui/library-view.ts` exports:

```ts
interface LibraryView {
  /** Render the full library list. Called on bootstrap and after every mutation. */
  renderEntries(library: Library): void;

  /** Hide the reading status (when no book is actively open). */
  hideReading(): void;

  /** Show the reading status with the active book's metadata. (Reuses v1 phone-status under the hood.) */
  showReading(state: ReadingStatusInput): void;
}
```

`src/ui/import-flow.ts` exports:

```ts
interface ImportFlow {
  /** Wire the file picker. Returns an unsubscriber. */
  install(onFile: (file: File) => void): () => void;

  /** Show the import progress indicator. */
  showProgress(filename: string): void;

  /** Hide the import progress indicator. */
  hideProgress(): void;

  /** Show the persistent error / duplicate message. */
  showError(message: string): void;

  /** Hide the persistent error. */
  hideError(): void;
}
```

These are pure UI-side abstractions; they take pure data in, mutate the DOM, and emit user events as callbacks. The orchestration (file → import pipeline → state update → re-render) lives in `src/main.ts`.

---

## Lifecycle: bootstrap → library → reader → exit

```text
1. waitForEvenAppBridge()
2. migrate v1 → v2 if needed (silent on success; notice on failure)
3. read library; bootstrap sample if empty
4. mount LibraryView; render entries; hideReading()
5. install ImportFlow with onFile = importPipeline → state update → re-render
6. observe glasses connection (carries forward from v1)
7. if launched from glassesMenu (per FR-019):
     - find most-recently-opened entry; or fall back to "sample"
     - openBookOnGlasses(entry.id)  ← reveals reading section, enters v1 read loop
   else (launched from appMenu, FR-018):
     - stay in library view; no auto-open
8. on reader exit (swipe-down, end-of-book press):
     - reader teardown runs (carries forward from v1)
     - hideReading()
     - bridge.shutDownPageContainer(0) (carries forward from v1) — the user is now back at the glasses' app menu; they re-open evenBooks to return to the library
```

Step 7's branching distinguishes the two launch sources per Spec FR-018 / FR-019.

Step 8 deliberately does NOT return the user to the library on the phone — it preserves v1 FR-005's "exit returns to glasses' app menu" behaviour. The phone-side library remains visible, but the user has to relaunch the app to use it.

---

## Forbidden surfaces in v2

To keep scope honest, these are explicitly **not** in v2 (mostly deferred to 003-library):

- Sort controls (alphabetical, by author, by date) — 003.
- Search box — 003.
- Delete button on entries — 003.
- "Currently reading / finished" status indicators — 003.
- Reading-progress bars next to entries — 003.
- Multi-select / batch operations — 003.
- Cover images (the source EPUB might have one; we ignore it).
- Drag-and-drop reordering.
- Settings / preferences UI.
- Localisation / i18n switcher.
- A glasses-side library list (would violate Constitution Principle I — list ≠ glanceable).

---

## Test coverage

The library + import UI is DOM-mutating, but the **logic** behind it is pure. Tests cover the pure parts:

- `src/ui/phone-status.ts` `describeStatus` — already tested in v1; carries forward unchanged.
- `src/library/library-entry.ts` sort comparator — pure function; tested for ordering invariants.
- `src/ui/library-view.ts` and `src/ui/import-flow.ts` — DOM-touching; manually validated in the simulator. No jsdom test in v2 (matching v1's posture; the surface is too thin to justify jsdom).

If/when the phone-side surface grows in 003-library, jsdom tests become worth their weight; not now.
