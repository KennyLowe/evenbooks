---
description: "Task list for evenBooks v1 — Read a Hardcoded Book"
---

# Tasks: evenBooks v1 — Read a Hardcoded Book

**Input**: Design documents from `specs/001-ebook-reader/`
**Prerequisites**: `plan.md` ✓, `spec.md` ✓, `research.md` ✓, `data-model.md` ✓, `contracts/{persistence,frames,phone-ui}.md` ✓, `quickstart.md` ✓
**Constitution**: `../../.specify/memory/constitution.md` v3.0.0

**Tests**: Pure-logic unit tests are included. Constitution Principle VI says "pure-logic unit tests are encouraged" for solo projects; this project has enough pure logic (pagination, reducer, frame composers, persistence recovery) that the tests are worth their weight. They live in `tests/unit/`. No integration tests in v1.

**Organization**: Tasks are grouped by user story. v1 has exactly one story (US1) at priority P1; the foundational and setup phases are infrastructure that v1 needs and that follow-on specs (002-import, 003-library, 004-resilience) will build on without rework.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Different file, no dependencies on incomplete tasks → safe to run in parallel
- **[Story]**: Maps task to user story; required for Phase 3 only
- All file paths are project-relative to `C:\git\even\evenBooks\` unless absolute is shown

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bootstrap the Vite + TypeScript Even Hub plugin project from the official `minimal` template and add Vitest.

- [X] T001 Scaffold project from official template: copy contents of `C:\git\even\official\evenhub-templates\minimal\` into the project root (`C:\git\even\evenBooks\`), then run `npm install` in the project root to populate `node_modules`. Do **not** copy `node_modules` itself.
- [X] T002 Customize `app.json` at the project root with evenBooks identity: `package_id: "com.evenbooks.reader"`, `name: "evenBooks"`, `version: "0.1.0"`, `min_app_version: "2.0.0"`, `min_sdk_version: "0.0.10"`, `entrypoint: "index.html"`, `permissions: []`, `supported_languages: ["en"]`. Replace template values verbatim.
- [X] T003 Install Vitest and Node types as dev dependencies: `npm install -D vitest @types/node` from the project root. Confirm `package.json` lists both under `devDependencies`.
- [X] T004 [P] Create `vitest.config.ts` at the project root using the default ESM config (`import { defineConfig } from 'vitest/config'; export default defineConfig({ test: { globals: false, environment: 'node' } });`). Pure-logic tests; no DOM environment needed.
- [X] T005 [P] Create `.gitignore` at the project root if absent, covering `node_modules/`, `dist/`, `*.ehpk`, `.DS_Store`, and `coverage/`.

**Checkpoint**: `npm run dev` starts the Vite server; `npm run simulate` opens the simulator on the template's "Hello from G2" page. `npx vitest run` exits 0 (no tests yet).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cross-cutting infrastructure that the single user story needs and that follow-on specs will reuse without rework. Module boundaries match `plan.md`'s source tree.

**⚠️ CRITICAL**: User Story 1 work depends on T009 (bridge wrapper); the others can run in parallel with parts of US1 once they land.

- [X] T006 [P] Bundle the sample text in `src/content/sample-text.ts`. Export a `Book` type and a `SAMPLE_BOOK` constant per `data-model.md` Book entity. Embed the full text of "The Tell-Tale Heart" by Edgar Allan Poe (~2,200 words) as a single string. Whitespace-normalise: collapse runs of internal whitespace to single spaces; preserve paragraph boundaries as `\n\n`. Source: Project Gutenberg public-domain release.
- [X] T007 [P] Implement the error convention in `src/platform/errors.ts`. Export a `Notice` discriminated union (`{ kind: 'recovery', reason: 'unparseable' | 'wrong-book' | 'out-of-range' } | { kind: 'save-failed' }`), a `NoticeChannel` type (subscribe/emit), and a `createNoticeChannel()` factory. Forbid silent catches by convention: every catch site must call `channel.emit(...)` or rethrow. Document the convention in a top-of-file comment referencing Constitution Principle V.
- [X] T008 [P] Implement the teardown registry in `src/platform/teardown.ts`. Export a `Teardowns` class with `add(unsub: () => void): void` and `runAll(): void`. Used to track unsubscriber functions returned from `bridge.onEvenHubEvent`, `bridge.onDeviceStatusChanged`, `bridge.onLaunchSource` (Constitution Principle IV — leaks accumulate across navigation).
- [X] T009 Implement the bridge wrapper in `src/platform/bridge.ts`. Export `initBridge(teardowns: Teardowns): Promise<EvenAppBridge>` that calls `waitForEvenAppBridge()` from `@evenrealities/even_hub_sdk` and returns the bridge. Subscribe to `onLaunchSource` once here and route the `'appMenu' | 'glassesMenu'` value to the bootstrap caller via a one-shot promise; register the unsub on `teardowns`. Depends on T008.

**Checkpoint**: Phase 2 modules compile (`npx tsc --noEmit` passes); they can be imported but no behavior is wired up yet.

---

## Phase 3: User Story 1 — Read a sample book on the glasses (Priority: P1) 🎯 MVP

**Goal**: A reader opens evenBooks, sees the first (or last-read) page of "The Tell-Tale Heart" on the glasses, single-presses to advance, double-presses to retreat, hits an end-of-book frame on the last page, can swipe-down to exit, and resumes on the same page on next launch.

**Independent Test** (per `spec.md` US1): in the simulator, open the app and read end-to-end using only the temple touchpad (single press, double press, swipe down). Exit and reopen; resume on the correct page. Hit page-1 boundary (verify clamp-flash) and end-of-book boundary (verify the dedicated frame and the second-press exit).

### Tests for User Story 1

> **NOTE**: These tests target modules that don't exist yet. Author them first; they will fail until the corresponding implementation tasks land. Each test file is independent — all five tests can be authored in parallel.

- [X] T010 [P] [US1] Pagination tests in `tests/unit/pagination.test.ts`. Cover: empty input → empty array; single short paragraph → one page; exact-fit page (=`CHARS_PER_LINE`×`LINES_PER_PAGE` chars); long word > `CHARS_PER_LINE` → hard-break at the cap; multi-paragraph text → paragraph boundary preferred but not forced; deterministic given identical input. Imports from `src/reader/pagination.ts`. Per `data-model.md` Page rules and `research.md` R1.
- [X] T011 [P] [US1] Reader state-machine tests in `tests/unit/reader.test.ts`. Cover the full `data-model.md` transition table: `reading(N) + NEXT_PAGE → reading(N+1)`; `reading(last) + NEXT_PAGE → end-of-book`; `reading(0) + PREV_PAGE → clamp-flash(0)`; `clamp-flash + TIMER_EXPIRED → reading(0)`; `clamp-flash + NEXT_PAGE → queued, applied after revert`; `end-of-book + NEXT_PAGE → exiting`; `end-of-book + PREV_PAGE → reading(last)`; `any + EXIT → exiting`; `any + RECONNECT → mode unchanged + frame re-issued`. Imports from `src/reader/reader.ts`.
- [X] T012 [P] [US1] Frame-composer tests in `tests/unit/frames.test.ts`. Cover per `contracts/frames.md`: `pageFrame(page)` returns `{ containerID: 1, containerName: 'main', contentOffset: 0, contentLength: 0, content: page.text }`; `clampFlashFrame(page)` prepends `"↑ start of book\n\n"`; `endOfBookFrame(book)` includes the book title and `"Press to exit"`; all composers are pure (same input → same output, no I/O); all payloads stay under the 2000-char `textContainerUpgrade` cap given a 600-char page (property-style assertion).
- [X] T013 [P] [US1] Persistence tests in `tests/unit/persistence.test.ts`. Mock `bridge.setLocalStorage` and `bridge.getLocalStorage`. Cover the full `contracts/persistence.md` read state machine: empty raw → `fresh-start`; garbage string → `recovered/unparseable`; valid JSON wrong book → `recovered/wrong-book`; valid JSON page negative → `recovered/out-of-range`; valid JSON page === totalPages → `recovered/out-of-range`; valid JSON page in range → `resumed`. Save path: success resolves; throw is caught and emits a `save-failed` notice.
- [X] T014 [P] [US1] Phone-status mapping tests in `tests/unit/phone-status.test.ts`. Cover the pure state-to-text function from `contracts/phone-ui.md`: `(connection: 'connected', book: { title: 'X', author: 'Y' }, pageIndex: 11, totalPages: 45)` → `{ connection: 'Glasses connected', title: 'X', author: 'Y', progress: 'Page 12 of 45' }`; verify all three connection states map correctly.

### Implementation for User Story 1

> Tasks marked [P] use independent files and have no incomplete dependencies. Sequential tasks below have explicit dependency notes.

- [X] T015 [P] [US1] Implement naive char-count pagination in `src/reader/pagination.ts`. Export `CHARS_PER_LINE = 48` and `LINES_PER_PAGE = 6` as named constants (not magic numbers). Export `interface Page { readonly index: number; readonly text: string; readonly isFirst: boolean; readonly isLast: boolean; }`. Export `paginate(text: string, opts?: { charsPerLine?: number; linesPerPage?: number }): Page[]` per `research.md` R1 algorithm: greedy line fill, greedy page fill, hard-break long words at `CHARS_PER_LINE`, paragraph boundary preferred. Pure function. Hard cap each page at 600 chars defensively.
- [X] T016 [P] [US1] Implement event mapping in `src/platform/events.ts`. Export `type SemanticEvent = 'NEXT_PAGE' | 'PREV_PAGE' | 'EXIT'` and `wireEvents(bridge, teardowns, dispatch: (e: SemanticEvent) => void): void`. Map `OsEventTypeList.CLICK_EVENT → NEXT_PAGE`; `OsEventTypeList.DOUBLE_CLICK_EVENT → PREV_PAGE`; `OsEventTypeList.SCROLL_BOTTOM_EVENT → EXIT`. Add a build-time `DEBUG_GESTURES` flag (read from `import.meta.env.DEV`) that logs every received raw event with `performance.now()` timestamps to `console.debug` per `research.md` R2.
- [X] T017 [P] [US1] Implement the connection observer in `src/platform/connection.ts`. Export `type ConnectionState = 'connected' | 'connecting' | 'not-connected'` and `observeConnection(bridge, teardowns, onChange: (s: ConnectionState) => void): void`. Map `DeviceConnectType` values per `contracts/phone-ui.md`: `Connecting → 'connecting'`; `Connected → 'connected'`; everything else → `'not-connected'`. Register the unsub on `teardowns`.
- [X] T018 [US1] Implement persistence in `src/platform/persistence.ts` per `contracts/persistence.md`. Export `readPosition(bridge, book: BookId, totalPages: number): Promise<ReadResult>` and `writePosition(bridge, channel: NoticeChannel, p: StoredPosition): Promise<void>`. Storage key constant `'evenBooks.position.v1'`. Implement the read state machine exactly as documented in the contract; emit `Notice` values via the `NoticeChannel` from T007 on each `recovered/*` outcome and on save failure. Single-flight save with depth-1 queue. Depends on T007.
- [X] T019 [US1] Implement frame composers in `src/reader/frames.ts` per `contracts/frames.md`. Export a `STARTUP_CONTAINER` constant (`TextContainerProperty` with `containerID: 1`, `containerName: 'main'`, full canvas, `isEventCapture: 1`, empty initial content) and three pure functions: `pageFrame(page: Page): TextContainerUpgrade`, `clampFlashFrame(page: Page): TextContainerUpgrade`, `endOfBookFrame(book: Book): TextContainerUpgrade`. Use `new TextContainerUpgrade({...})` with the SDK class. Depends on T015 (Page type).
- [X] T020 [US1] Implement the reader state machine in `src/reader/reader.ts` per `data-model.md` ReaderState section. Export `type ReaderMode`, `interface ReaderState`, and `reduce(state: ReaderState, event: SemanticEvent | { kind: 'TIMER_EXPIRED' } | { kind: 'RECONNECT' }): { next: ReaderState; render: TextContainerUpgrade | null; persist: StoredPosition | null; exit: boolean }`. Reducer-style: pure function returning the next state plus side-effect descriptors (render frame, persist, exit). Implement the full transition table from `data-model.md`. Depends on T015 (Page) and T019 (frames).
- [X] T021 [US1] Implement the phone-status renderer in `src/ui/phone-status.ts`. Export `mountPhoneStatus(initialBook: Book): { update: (state: { connection: ConnectionState; pageIndex: number; totalPages: number }) => void; showNotice: (notice: Notice) => void }`. Implement the pure state-to-text function (target of T014's tests) plus the imperative DOM mutation against the structure from `contracts/phone-ui.md`. Notices auto-clear after 5 s. Depends on T017 (ConnectionState type).
- [X] T022 [P] [US1] Replace the template's `index.html` body with the phone-status DOM structure from `contracts/phone-ui.md` (a `<main id="phone-status">` containing header, reading section, and notice aside). Keep the `<script type="module" src="/src/main.ts"></script>` reference. Add minimal monochrome-friendly inline CSS (system sans-serif, generous line-height, sufficient contrast). No external CSS file; no framework.
- [X] T023 [US1] Implement the bootstrap entry in `src/main.ts`. Sequence per `plan.md` Constitution Check evidence:
  1. Create the notice channel (T007) and teardown registry (T008).
  2. Mount the phone-status UI (T021) with `SAMPLE_BOOK`.
  3. `await initBridge(teardowns)` (T009).
  4. `pages = paginate(SAMPLE_BOOK.text)` (T015).
  5. `const result = await readPosition(bridge, SAMPLE_BOOK.id, pages.length)` (T018); start at `result.kind === 'resumed' ? result.page : 0`; emit recovery notices for `recovered/*` outcomes.
  6. `await bridge.createStartUpPageContainer(new CreateStartUpPageContainer({ containerTotalNum: 1, textObject: [STARTUP_CONTAINER] }))` and assert `success`.
  7. Render the initial page via `bridge.textContainerUpgrade(pageFrame(pages[startPage]))`.
  8. `wireEvents(bridge, teardowns, dispatch)` and `observeConnection(bridge, teardowns, onConnState)` — `dispatch` runs the reducer; on returned `render`, send the upgrade; on returned `persist`, call `writePosition`; on `exit`, call `teardowns.runAll()` then `bridge.shutDownPageContainer(0)`.
  9. On reconnect, dispatch `{ kind: 'RECONNECT' }` to re-issue the current frame (idempotent, per Principle III).
  Depends on T009, T015, T016, T017, T018, T019, T020, T021, T022.
- [X] T024 [US1] Manual simulator validation. Run `npm run dev` and `npm run simulate`. Execute User Story 1's Independent Test: open → first page renders within 2 s; advance through every page using single press; reach end-of-book frame; second press exits; reopen → resume on the page exited from. Hit page-1 boundary and verify clamp-flash. Capture a screenshot of each frame type (page mid-book, clamp-flash, end-of-book) into `specs/001-ebook-reader/artifacts/v1-baseline-screenshots/` (create the directory). Required for the constitution's Simulator-First gate.

**Checkpoint**: User Story 1 is fully functional in the simulator. v1 is shippable to hardware for the validation pass.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Final gates before declaring v1 done. None of these add behavior; they validate what's been built and prepare for hardware handoff.

- [X] T025 [P] Update `README.md` at the project root (replace the template's). Brief project description; pointer to `specs/001-ebook-reader/quickstart.md` for setup; pointer to `specs/001-ebook-reader/spec.md` for what v1 does and doesn't do; mention the constitution at `.specify/memory/constitution.md`.
- [X] T026 [P] Run `npm run build` and verify exit-zero. Type-check (`tsc --noEmit`) and Vite build must both pass. Generated `dist/` should contain `index.html`, the bundled JS, and any static assets. No source maps in production by default; that's fine for v1.
- [X] T027 [P] Run `npx evenhub validate dist` and resolve any warnings. Then `npx evenhub pack app.json dist -o evenBooks-0.1.0.ehpk`. The `.ehpk` is the unit submitted to Even Hub when hardware validation completes.
- [X] T028 Run the full Vitest suite once more (`npx vitest run`) to confirm green; commit the v1 baseline screenshots from T024 and the produced `.ehpk` reference into the spec's artifacts directory or note their location in `specs/001-ebook-reader/artifacts/README.md` for the hardware-validation pass.

**Final checkpoint**: v1 is dev-complete. Awaiting hardware (~2026-05-21) for the R1/R2/R3/R5 validation pass — at which point `spec.md` SC numbers and `research.md` R1 typography constants get tightened based on real measurements.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 must complete first (creates the project tree); T002 + T003 follow sequentially; T004 + T005 are [P] after T001.
- **Foundational (Phase 2)**: T006, T007, T008 all [P] (different files, no deps); T009 depends on T008 (uses `Teardowns`).
- **User Story 1 (Phase 3)**: depends on Foundational completion. Tests T010–T014 can be authored as soon as Phase 2 is done. Implementation has internal dependencies — see graph below.
- **Polish (Phase 4)**: depends on Phase 3 completion. T025–T027 are [P]; T028 is sequential (depends on the others producing artifacts).

### User Story Dependencies

Only one user story; no cross-story dependencies.

### Within User Story 1 (dependency graph)

```text
T015 (pagination) ────┐
                      ├─→ T019 (frames)  ──┐
                      └─→ T020 (reader)  ──┤
T007 (errors)  ───────→ T018 (persistence)┤
T017 (connection) ────→ T021 (phone-status) ──┐
T022 (index.html)  [P]                        ├─→ T023 (main.ts)
T016 (events)      [P]                        │
T009 (bridge)  [from Phase 2]                 ├─→ T023
                                               │
                              T024 (simulator validation, depends on T023)
```

Tests (T010–T014) depend only on the existence of their target module files — author them first or in parallel with implementation; they will fail until the corresponding implementation task lands.

### Parallel Opportunities

- **Phase 1**: T004 + T005 in parallel after T001.
- **Phase 2**: T006 + T007 + T008 all in parallel; T009 starts after T008.
- **Phase 3 tests**: T010 + T011 + T012 + T013 + T014 all in parallel (different files, independent).
- **Phase 3 implementation**: T015 + T016 + T017 + T022 in parallel (different files, no incomplete deps); T019, T020, T021, T018 each unblock as their deps land; T023 is the sole sequential bottleneck near the end.
- **Phase 4**: T025 + T026 + T027 in parallel; T028 sequential.

---

## Parallel Example: User Story 1 — implementation kickoff

Once Phase 2 completes, you can launch these four implementation tasks in parallel (they touch different files and have no incomplete dependencies):

```text
Task: "T015 [P] [US1] Implement naive char-count pagination in src/reader/pagination.ts"
Task: "T016 [P] [US1] Implement event mapping in src/platform/events.ts"
Task: "T017 [P] [US1] Implement the connection observer in src/platform/connection.ts"
Task: "T022 [P] [US1] Replace index.html body with phone-status DOM structure"
```

And in parallel with those, the five test files:

```text
Task: "T010 [P] [US1] Pagination tests in tests/unit/pagination.test.ts"
Task: "T011 [P] [US1] Reader state-machine tests in tests/unit/reader.test.ts"
Task: "T012 [P] [US1] Frame-composer tests in tests/unit/frames.test.ts"
Task: "T013 [P] [US1] Persistence tests in tests/unit/persistence.test.ts"
Task: "T014 [P] [US1] Phone-status mapping tests in tests/unit/phone-status.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

v1 *is* the MVP — this is intentional per `plan.md` Summary. The strategy is therefore the only strategy:

1. Complete Phase 1 (Setup): T001–T005.
2. Complete Phase 2 (Foundational): T006–T009.
3. Complete Phase 3 (User Story 1): T010–T024.
4. **STOP and VALIDATE** in the simulator (T024).
5. Complete Phase 4 (Polish): T025–T028.
6. Hold for hardware (~2026-05-21).
7. Run hardware-validation pass (R1, R2, R3, R5 from `research.md`); update spec SC numbers and pagination constants based on measurements; ship v1 to Even Hub.

### Why no parallel team strategy

Solo project. The `[P]` markers exist so the implementing agent (or developer) can group concurrent file edits and avoid serial work that doesn't need to be serial. Not because there's a team.

### Stopping points

- After T009: bridge wrapper compiles; nothing visible yet but the platform glue is in place.
- After T020: pure reducer + pagination + frames are tested and green; no glasses yet.
- After T023: full read loop runs in the simulator.
- After T024: v1 is dev-complete and ready for hardware-validation when the device arrives.

---

## Notes

- `[P]` tasks = different files, no incomplete dependencies.
- `[US1]` label is present on every Phase 3 task; absent everywhere else.
- Constitution gate (from `plan.md` Constitution Check) was passed at plan time and re-verified at design time. No task in this list violates a principle. T024 (simulator validation) is the explicit Principle VI gate.
- Provisional numbers in `research.md` (R1 pagination constants, SC-001 launch budget, SC-002 page-change latency) get tightened in a follow-on plan revision after hardware arrives — not in v1 implementation.
- Avoid: adding a UI framework "for convenience" (violates `plan.md` constraints), adding `rebuildPageContainer` "to be safe" (violates Principle IV — `textContainerUpgrade` only in v1), adding a glasses-side connection-status frame (violates Principle I — that surface lives on the phone).
