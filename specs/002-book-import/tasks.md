---
description: "Task list for evenBooks v2 — Import Your Own Books"
---

# Tasks: evenBooks v2 — Import Your Own Books

**Input**: Design documents from `specs/002-book-import/`
**Prerequisites**: `plan.md` ✓, `spec.md` ✓ (clarified), `research.md` ✓, `data-model.md` ✓, `contracts/{persistence-v2,import-pipeline,library-ui}.md` ✓, `quickstart.md` ✓
**Constitution**: `../../.specify/memory/constitution.md` v3.0.0

**Tests**: Pure-logic unit tests are included throughout, matching v1's encouraged-tests posture. v2 has more pure logic to test than v1 (EPUB parsing, content hashing, library state, persistence migration, IndexedDB wrapper, import pipeline branches), so the test surface is correspondingly larger. All tests live in `tests/unit/`. No headless integration tests in v2 — same posture as v1.

**Organization**: Tasks are grouped by user story. Spec 002 has three user stories (P1 EPUB import, P2 plain-text import, P3 refuse-cleanly) plus shared foundational work that supports all three. The v1 read loop (`src/reader/`, parts of `src/platform/`) is preserved verbatim per FR-017 — no v1 modules are touched.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Different file, no dependencies on incomplete tasks → safe to run in parallel
- **[Story]**: Maps task to user story; required for Phase 3+ only
- All file paths are project-relative to `C:\git\even\evenBooks\` unless absolute is shown

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add v2 dependencies and bump version metadata. The Vite + TS scaffold from v1 carries forward unchanged.

- [X] T001 Install JSZip as a runtime dependency: `npm install jszip` from the project root. Confirm `package.json` lists `jszip` under `dependencies`. JSZip provides ZIP unpacking for EPUBs (Phase 0 R1).
- [X] T002 [P] Install `fake-indexeddb` as a dev dependency: `npm install -D fake-indexeddb`. Used by IndexedDB-side tests in Node (`tests/unit/book-store.test.ts`).
- [X] T003 [P] Bump `package.json` version field from `0.1.0` to `0.2.0`.
- [X] T004 [P] Bump `app.json` version field from `0.1.0` to `0.2.0`. Keep `min_app_version` and `min_sdk_version` unchanged.

**Checkpoint**: `npm run dev` and `npx vitest run` both pass with the v1 codebase intact and the new deps installed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cross-cutting infrastructure that every user story depends on — the v2 type system, storage layer (IndexedDB + KV extensions), library state machine, content hashing, migration step, and shared test fixtures. None of this is user-story-specific; it's the foundation US1, US2, and US3 all sit on.

**⚠️ CRITICAL**: User Story work depends on every task in this phase. Phase 3+ cannot start until Phase 2 is complete and green.

### Type definitions

- [X] T005 [P] Define library types in `src/library/library-entry.ts`: export `BookFormat` (`"bundled" | "epub" | "text"`), `LibraryEntry` interface (per `data-model.md`), and a pure `compareLibraryEntries(a, b)` sort comparator that orders by `max(addedAt, lastOpenedAt ?? 0)` descending with `id` lexicographic tie-break. No I/O.
- [X] T006 [P] Define import outcome types in `src/import/outcomes.ts`: export `ImportFailureReason` (`"drm-protected" | "malformed" | "unsupported-format" | "oversize" | "unsupported-encoding" | "empty" | "storage-full"`), `ImportOutcome` discriminated union per `data-model.md`, and a pure `failureMessage(reason)` function returning the canonical user-facing strings from `contracts/import-pipeline.md`. No I/O.
- [X] T007 Extend the existing `Book` interface and `SAMPLE_BOOK` constant in `src/content/sample-text.ts`: widen `BookId` from `"sample"` to `"sample" | string`; add `readonly format: BookFormat` to `Book`; set `format: "bundled"` on `SAMPLE_BOOK`. Existing v1 reader code that imports `Book` continues to compile because new fields are additive.

### Test fixtures (shared)

- [X] T008 [P] Create test-fixture helpers in `tests/unit/_fixtures.ts`: export `buildMinimalEpub(opts)` that synthesises a valid EPUB (container.xml, content.opf with optional metadata, one XHTML spine item) using JSZip and returns `Promise<ArrayBuffer>`; export `buildTxtFile(content, opts)` that returns `ArrayBuffer` with optional UTF-8 BOM or Latin-1 encoding. Per `quickstart.md` test-fixture strategy. No tests of its own; it's a helper consumed by US1/US2/US3 tests.

### Storage layer

- [X] T009 [P] Implement IndexedDB wrapper in `src/platform/book-store.ts`: open database `evenBooks` with object store `books` (key path `id`); export `getBookContent(id): Promise<StoredBookContent | null>`, `putBookContent(content): Promise<void>`, `deleteBookContent(id): Promise<void>` per `contracts/persistence-v2.md`. Short-circuit `getBookContent("sample")` to load `SAMPLE_BOOK.text` and paginate it on the fly (returns the bundled content; never writes to IndexedDB for the sample).
- [X] T010 [P] Implement content hashing in `src/library/duplicates.ts`: export `hashFileBytes(buffer: ArrayBuffer): Promise<string>` and `hashNormalisedText(text: string): Promise<string>`. Both use `crypto.subtle.digest("SHA-256", input)` and return the first 16 hex chars (lowercase) per Phase 0 R4. Pure functions of input.

### Persistence and library state

- [X] T011 Extend `src/platform/persistence.ts` with per-book operations: change `STORAGE_KEY` constant into a function `positionKeyFor(bookId)` returning `"evenBooks.position." + bookId`; update `readPosition(bridge, bookId, totalPages)` and `writePosition(bridge, channel, position)` to use the per-book key. Keep the v1 read-recovery state machine and save-failure surfacing intact. Update v1's `tests/unit/persistence.test.ts` to pass a `bookId` argument; rename existing test cases to scope them to `"sample"`.
- [X] T012 Implement library state in `src/library/library.ts`: export `Library` type (`{ entries: readonly LibraryEntry[], version: 2 }`), `loadLibrary(bridge, channel)`, `saveLibrary(bridge, channel, library)`, `addEntry(library, entry)`, `bumpEntry(library, id, ts)`, `markOpened(library, id, ts)`. Bootstrap an empty library to a single sample entry with `addedAt: now, lastOpenedAt: null`, `format: "bundled"`. Persists JSON to `evenBooks.library.v2`. Validation per `contracts/persistence-v2.md`. Depends on T005, T011.
- [X] T013 Implement v1 → v2 migration in `src/platform/persistence-v2-migration.ts`: export `migrateV1IfNeeded(bridge, channel, sampleTotalPages)` that runs the migration state machine from `contracts/persistence-v2.md`. Idempotent. Silent on success; surfaces a `recovery` notice on parse failure; preserves the v1 key on parse failure for forensics. Depends on T011, T012.

### Tests for foundational

- [X] T014 [P] Library state tests in `tests/unit/library.test.ts`: bootstrap empty → contains sample entry; add a non-duplicate entry → ordered first; bump existing entry → moves to top; markOpened → updates lastOpenedAt; sort comparator deterministic. Depends on T012.
- [X] T015 [P] Content-hashing tests in `tests/unit/duplicates.test.ts`: same buffer → same id; different buffers → different ids; output is exactly 16 lowercase hex chars; hash never produces literal `"sample"`. Depends on T010.
- [X] T016 [P] IndexedDB book-store tests in `tests/unit/book-store.test.ts`: import `"fake-indexeddb/auto"` at top; round-trip put/get; get for unknown id returns null; delete then get returns null; get for `"sample"` short-circuits to bundled text without writing to DB. Depends on T009.
- [X] T017 [P] Persistence v2 tests in `tests/unit/persistence-v2.test.ts`: per-book read/write roundtrips for two distinct book ids do not interfere; v1's recovery state machine is preserved per book. Depends on T011.
- [X] T018 [P] Migration tests in `tests/unit/persistence-v2-migration.test.ts`: v1 key absent → `no-migration-needed`; valid v1 payload, no v2 library → `migrated`, sample entry created with carried page index, v1 key deleted; rerun (v1 key absent the second time) → `no-migration-needed`; garbage v1 payload → `migration-failed/v1-payload-unparseable`, v1 key preserved, notice emitted; v1 page out of range → clamped, succeeds. Depends on T013.

**Checkpoint**: All foundational tests pass; the v1 test suite still passes (with T011's bookId-argument update applied).

---

## Phase 3: User Story 1 — Import an EPUB and read it (Priority: P1) 🎯 MVP

**Goal**: A user with a DRM-free EPUB on their phone taps "Add book", picks the file, sees the book in the library with title and author extracted from EPUB metadata, taps it, and reads it on the glasses using the v1 read loop.

**Independent Test** (per `spec.md` US1): in the simulator, click "Add book" and pick a known-good DRM-free EPUB (Standard Ebooks or Project Gutenberg release). Confirm the inline indicator appears, the book joins the library with correct metadata, tapping it opens it on the glasses, and the v1 read loop (advance / retreat / boundary clamp / end-of-book / exit / resume) all behave identically to the bundled sample.

### Tests for User Story 1

- [X] T019 [P] [US1] DRM detection tests in `tests/unit/drm.test.ts`: synthesise EPUB with `META-INF/encryption.xml` + ADEPT marker → DRM detected; synthesise EPUB with only IDPF font-mangling encryption → DRM not detected; synthesise EPUB with `META-INF/rights.xml` → DRM detected; synthesise EPUB with `iTunesMetadata.plist` → DRM detected; plain valid EPUB → DRM not detected. Uses `_fixtures.ts` (T008).
- [X] T020 [P] [US1] EPUB parser tests in `tests/unit/epub.test.ts`: minimal valid EPUB → success with metadata extracted; missing `<dc:title>` → falls back to filename; multiple `<dc:creator>` → joined with `, `; `<img>` in body → image silently skipped; corrupt ZIP → `malformed`; missing `container.xml` → `malformed`; empty spine → `malformed`. Uses `_fixtures.ts` (T008).
- [X] T021 [P] [US1] Import pipeline tests (EPUB happy path) in `tests/unit/import-pipeline.test.ts`: valid EPUB → `success` with correct `Book` and `LibraryEntry`; duplicate EPUB → `duplicate` with bumped existing entry; library is mutated correctly on success; IndexedDB content is written on success. Mocks `bridge.setLocalStorage`/`getLocalStorage` and `book-store` IO. Uses `_fixtures.ts` (T008).

### Implementation for User Story 1

- [X] T022 [P] [US1] Implement DRM detector in `src/import/drm.ts`: export `detectsDrm(zipFiles)` per Phase 0 R2. Pure function over the unpacked ZIP file map. Inspects `META-INF/encryption.xml`, `META-INF/rights.xml`, `META-INF/iTunesMetadata.plist`. Returns `boolean`.
- [X] T023 [US1] Implement EPUB parser in `src/import/epub.ts`: export `epubParse(buffer, filename)` returning `Promise<ParsedBook | EpubFailure>`. Uses JSZip for unpacking; runs `detectsDrm` (T022) before content extraction; uses native `DOMParser` for OPF and XHTML; walks the spine in order, concatenating text content (skips `<img>`, `<svg>`, `<script>`, `<style>`, `<head>`, `<nav>`); applies whitespace normalisation matching v1's pagination input expectations. Implements every algorithm step in `contracts/import-pipeline.md`'s "EPUB parser" section. Depends on T022.
- [X] T024 [US1] Implement import pipeline orchestrator in `src/import/import-pipeline.ts`: export `importFile(file, library, noticeChannel)` returning `Promise<ImportOutcome>` per `contracts/import-pipeline.md` 9-stage flow. Format-detection by extension; oversize check (50 MB cap from Spec Assumption 6); unsupported-format short-circuit; calls `epubParse` (T023) for `.epub`; calls `textImport` (T032 — placeholder until US2; for US1, `.txt` returns `unsupported-format` until that lands); computes id (T010); duplicate check (against `library`); paginates via the existing v1 `paginate()` (no fork); writes to IndexedDB (T009); writes the new library entry (T012); returns typed outcome. Catches storage errors and returns `failure(storage-full)` while emitting a save-failed notice. Depends on T009, T010, T012, T023.
- [X] T025 [P] [US1] Update `index.html` per `contracts/library-ui.md` DOM skeleton: add `<section class="reading">` (initially hidden), `<section class="import">` with the Add-book button, hidden file input, import progress indicator slot, import error slot; add `<section class="library">` with `<ul class="entries"></ul>`. Add inline CSS for the new sections matching v1's monochrome-friendly styling.
- [X] T026 [US1] Extend `src/ui/phone-status.ts` for multi-book support: split the v1 monolithic `mountPhoneStatus` into a reading-status sub-handle (the v1 fields: connection, title, author, progress) plus exported `hideReading()` / `showReading(state)` helpers. Preserve the v1 `describeStatus` pure function and its tests. Re-target the seeded title/author to be set per opened book rather than at mount time.
- [X] T027 [P] [US1] Implement library view UI in `src/ui/library-view.ts`: export `mountLibraryView(onTap: (id: BookId) => void)` returning a handle with `renderEntries(library: Library)` that mutates the `<ul class="entries">` to reflect the current library. Each `<li class="entry" data-book-id="...">` has title and author. Click handlers wire to `onTap`. Includes the optional `data-content="evicted"` decoration when the runtime later flags a content-evicted entry (foundation in v2; visual treatment may stay minimal).
- [X] T028 [US1] Implement import flow UI in `src/ui/import-flow.ts`: export `mountImportFlow(onFile)` returning a handle with `showProgress(filename)`, `hideProgress()`, `showError(message)`, `hideError()` per `contracts/library-ui.md`. Wires the `<input type="file">` element per Phase 0 R7 (hidden input, programmatic click, change-event handler, value-reset for repeat selections). The import error slot persists until next user interaction (tap Add book, tap a library entry). Depends on T006 (for outcome → message mapping at the call-site).
- [X] T029 [US1] Rewrite `src/main.ts` bootstrap for v2:
   1. Notice channel + teardown registry (carries forward).
   2. Mount phone-status (v1) + library-view (T027) + import-flow (T028).
   3. `await initBridge(teardowns)` (carries forward).
   4. Run `migrateV1IfNeeded` (T013); if it returns `migration-failed`, emit notice; if `migrated`, library now has a sample entry with the migrated lastOpenedAt.
   5. `loadLibrary` (T012); seed the sample if empty.
   6. Render the library view.
   7. Wire `import-flow` `onFile` to call `importFile` (T024); on success, `addEntry` to library, save library, re-render; on duplicate, bump and re-render + show "Already in your library — opening the existing copy" via `showError`; on failure, surface the canonical message via `showError`.
   8. Wire `library-view` `onTap` to: load book content via `book-store.getBookContent`; if null, surface "content cleared" notice; else create a `ReaderState` (book + paginated pages from stored or sample), `markOpened`, save library, `showReading`, `createStartUpPageContainer`, render initial frame, wire events (carries forward from v1).
   9. Branch on launch source: `glassesMenu` → auto-open most-recently-opened entry (or sample if none); `appMenu` → stay in library view (no auto-open).
   10. On reader exit (carries forward from v1 — swipe-down or end-of-book press): teardowns runAll, `bridge.shutDownPageContainer(0)`, `hideReading()`. Library view remains visible on the phone.
   Depends on T009, T012, T013, T024, T025, T026, T027, T028.
- [X] T030 [US1] Manual simulator validation. Run `npm run dev` + `npm run simulate`. Procedure:
   1. Download a small DRM-free EPUB (e.g. Standard Ebooks' shortest title). In the simulator, click "Add book", pick the file, watch the import progress indicator, confirm the new entry appears in the library list with extracted metadata.
   2. Tap the new entry; confirm the v1 read loop (advance / retreat / boundary / end-of-book / exit / resume) all work identically to the bundled sample.
   3. **Background tolerance (FR-013)**: start a fresh import on a larger file; switch focus away from the simulator window mid-import (or send the WebView to background via simulator controls); switch back; confirm the import either completed or surfaced a typed failure in the import error slot. The library MUST NOT be in an inconsistent partial state (no half-added entry, no stuck progress indicator).
   4. **Glasses-menu launch (FR-019)**: after at least one import + open, exit the reader via swipe-down. Re-launch the app from the simulator's app menu (not the phone-side library button). Confirm the most-recently-opened book auto-resumes at its persisted page on the glasses display.
   5. Time the SC-001 budget (5 MB EPUB import) and record the duration in `specs/002-book-import/artifacts/v2-baseline-screenshots/notes.md` for the hardware-revisit comparison.
   6. Capture screenshots of: phone-side library with the imported entry, an in-progress import indicator, and the read loop on an imported book. Save into `specs/002-book-import/artifacts/v2-baseline-screenshots/` (create the directory).

**Checkpoint**: User Story 1 is end-to-end functional in the simulator. v2 is shippable for users who only have EPUBs.

---

## Phase 4: User Story 2 — Import a plain-text book (Priority: P2)

**Goal**: A user with a `.txt` file taps "Add book", picks the file, sees the book in the library with the filename as title and "Unknown" as author, and reads it on the glasses.

**Independent Test**: import a UTF-8 `.txt`; confirm it appears with correct title (filename minus `.txt`) and "Unknown" author; read end-to-end. Then import a Latin-1 `.txt`; confirm the persistent inline error reads "Unsupported text encoding — please save the file as UTF-8" and the library is unchanged.

### Tests for User Story 2

- [X] T031 [P] [US2] Plain-text import tests in `tests/unit/text-import.test.ts`: UTF-8 input → success; UTF-8 with BOM → BOM stripped, body intact; Latin-1 input → `unsupported-encoding`; empty file → `empty`; whitespace-only file → `empty`; filename minus `.txt` becomes the title; "Unknown" author. Uses `_fixtures.ts` (T008).

### Implementation for User Story 2

- [X] T032 [P] [US2] Implement plain-text parser in `src/import/text-import.ts`: export `textImport(buffer, filename)` returning `Promise<ParsedBook | TextFailure>` per `contracts/import-pipeline.md` "Plain-text parser" section. Strips UTF-8 BOM; uses `new TextDecoder("utf-8", { fatal: true })`; refuses non-UTF-8 with `unsupported-encoding`. Pure function (no I/O beyond the input buffer).
- [X] T033 [US2] Wire `textImport` into the import-pipeline branch in `src/import/import-pipeline.ts`: replace the `.txt` short-circuit from T024 with a real call to `textImport`; map its `ParsedBook` / `TextFailure` outcomes onto the pipeline's `ImportOutcome`. Hashing for `.txt` uses `hashNormalisedText` (T010) on the post-decode text rather than file bytes (Phase 0 R4). Depends on T024, T032.
- [X] T034 [US2] Manual simulator validation. With the dev server running, prepare two files on disk: `tests-fixtures/utf8.txt` (UTF-8 plain text) and `tests-fixtures/latin1.txt` (Latin-1). In the simulator: import each via Add book; confirm UTF-8 enters the library and reads end-to-end; confirm Latin-1 surfaces the canonical encoding-refusal message in the import error slot and the library is unchanged. Capture screenshots into the v2-baseline-screenshots dir.

**Checkpoint**: User Story 2 is independently functional on top of Phase 3. v2 now supports both EPUB and plain-text users.

---

## Phase 5: User Story 3 — Refuse DRM, corrupt, and unsupported imports cleanly (Priority: P3)

**Goal**: For each of the six refusal categories (DRM, malformed, unsupported-format, oversize, unsupported-encoding, empty) and the `storage-full` save-failure, the user sees a typed non-technical message and the library is unchanged.

**Independent Test**: import in turn (a) a DRM-protected EPUB, (b) a corrupt EPUB, (c) a `.pdf` renamed to `.epub`, (d) a 51 MB file, (e) an empty file, (f) a Latin-1 `.txt` (already covered in US2 but verifies the refusal channel). Each surfaces a distinct canonical message; the library is unchanged after each. The `storage-full` path is exercised by mocking IndexedDB to throw on `putBookContent` in the unit test layer.

**Note**: Most US3 implementation work is already done by US1 and US2 (the typed `ImportOutcome` and refusal-message mapping). US3 adds tests that comprehensively exercise the failure surface and a final manual validation pass.

### Tests for User Story 3

- [X] T035 [P] [US3] Comprehensive refusal tests in `tests/unit/import-failures.test.ts`: oversize file → `failure(oversize)`; unsupported extension (`.pdf`, `.mobi`, `.docx`) → `failure(unsupported-format)`; DRM-protected EPUB (uses `_fixtures.ts` ADEPT-marker variant) → `failure(drm-protected)`; corrupt ZIP → `failure(malformed)`; .pdf renamed to .epub → `failure(malformed)`; empty content (zero-byte file or empty body) → `failure(empty)`; mocked IndexedDB throw → `failure(storage-full)` and a save-failed notice is emitted; for every failure case, assert library is unchanged and no IndexedDB content was written. Depends on T024.
- [X] T036 [US3] Manual simulator validation: with the dev server running, attempt each refusal category and verify the canonical message text from `contracts/import-pipeline.md` appears in the import error slot, and that the library state is unchanged after each. Screenshot the import error for each category into the v2-baseline-screenshots dir.

**Checkpoint**: All six refusal categories produce typed, user-visible, non-technical messages. SC-004 (100 % surfaced refusal rate) is testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final gates before declaring v2 dev-complete.

- [X] T037 [P] Update `README.md` to reflect v2: short paragraph about the import feature, point at `specs/002-book-import/quickstart.md` for setup, link spec/plan/research/contracts; mention v2 status (dev-complete; awaiting hardware).
- [X] T038 [P] Run `npm run build` from project root and verify exit-zero. The build should produce `dist/` with `index.html`, the bundled JS (now including JSZip), and any static assets. Confirm bundle size is reasonable (provisional ≤ 200 KB gzipped JS; if it grows substantially, revisit).
- [X] T039 [P] Pack the v2 release: `node node_modules/@evenrealities/evenhub-cli/main.js pack app.json dist -o evenBooks-0.2.0.ehpk`. Confirm the resulting `.ehpk` exists and isn't empty.
- [X] T040 Final checks: run `npx vitest run` to confirm all tests still pass; verify all v2-baseline-screenshots from US1/US2/US3 are committed; update `specs/002-book-import/artifacts/README.md` to note v2 dev-complete; commit (when user requests).

**Final checkpoint**: v2 dev-complete. Awaiting hardware for the v2 hardware-validation pass (which folds in v1's R1/R2/R3/R5 measurement pass for free since the v1 read loop is unchanged).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 must complete first (creates `node_modules` for JSZip). T002–T004 can run in parallel after T001.
- **Foundational (Phase 2)**: depends on Phase 1. Internal dependency graph below.
- **User Story 1 (Phase 3)**: depends on Phase 2. T030 (validation) blocks on the rest of US1.
- **User Story 2 (Phase 4)**: depends on Phase 2 + T024 (US1's import-pipeline orchestrator). Otherwise independent of US1's UI work.
- **User Story 3 (Phase 5)**: depends on Phase 4 (the pipeline must be complete with both branches before its tests are meaningful) — though the DRM tests in T019 already cover the EPUB-side DRM path.
- **Polish (Phase 6)**: depends on Phases 3–5 being complete. T037–T039 are [P]; T040 is sequential.

### Foundational dependency graph (within Phase 2)

```text
T005 (library-entry types) ─────────────────┐
T006 (outcome types)        ─────────────┐  │
T007 (Book ext + SAMPLE_BOOK)   ─────┐   │  │
                                     ▼   ▼  ▼
T008 (test fixtures) [P]    ─────→ used by US1/US2/US3 tests
T009 (book-store IndexedDB) [P]
T010 (content hashing) [P]   ──────────────┐
                                            ▼
T011 (per-book persistence)  ──→ T012 (library state) ──→ T013 (migration)

Tests T014–T018 each depend on the corresponding implementation file.
```

### User Story 1 dependency graph

```text
T022 (drm.ts) ──→ T023 (epub.ts) ──┐
T010, T012, T009 [foundational] ───┴──→ T024 (import-pipeline)  ──┐
T025 (index.html) [P]                                              │
T026 (phone-status ext)                                            ├──→ T029 (main.ts)
T027 (library-view UI) [P]                                         │
T028 (import-flow UI) [depends on T006]                            │
                                                                   ▼
                                                          T030 (manual validation)
```

### User Story 2 dependency graph

```text
T032 (text-import) [P] ──┐
                          ├──→ T033 (wire into pipeline) ──→ T034 (manual validation)
T024 (US1 pipeline) ─────┘
```

### Parallel Opportunities

- **Phase 1**: T002, T003, T004 in parallel after T001.
- **Phase 2 type/fixture/storage tier**: T005, T006, T008, T009, T010 all in parallel (different files, no incomplete deps); T007 must run sequentially because it modifies an existing file (`src/content/sample-text.ts`).
- **Phase 2 state tier**: T011 follows T005 + T007; T012 follows T011; T013 follows T012.
- **Phase 2 tests**: T014, T015, T016, T017, T018 all in parallel after their corresponding implementation files exist.
- **Phase 3 tests**: T019, T020, T021 all in parallel after foundational completes.
- **Phase 3 first-wave implementation**: T022, T025, T027 in parallel; T026 can run alongside (different file) but depends on no incomplete tasks.
- **Phase 3 sequential tail**: T023 → T024 → T028 → T029 → T030.
- **Phase 4**: T031 + T032 in parallel after foundational; T033 follows T024 + T032; T034 sequential.
- **Phase 5**: T035 in parallel after T024; T036 sequential after the pipeline is complete with both branches.
- **Phase 6**: T037, T038, T039 in parallel; T040 sequential.

---

## Parallel Example: Phase 2 foundational kickoff

After Phase 1 completes, this parallel wave kicks off Phase 2:

```text
Task: "T005 [P] Define library types in src/library/library-entry.ts"
Task: "T006 [P] Define import outcome types in src/import/outcomes.ts"
Task: "T008 [P] Create test-fixture helpers in tests/unit/_fixtures.ts"
Task: "T009 [P] Implement IndexedDB wrapper in src/platform/book-store.ts"
Task: "T010 [P] Implement content hashing in src/library/duplicates.ts"
```

T007 follows because it modifies an existing file. T011 follows once T005 + T007 are done. Etc.

## Parallel Example: Phase 3 US1 first wave

Once Phase 2 completes:

```text
Task: "T019 [P] [US1] DRM detection tests in tests/unit/drm.test.ts"
Task: "T020 [P] [US1] EPUB parser tests in tests/unit/epub.test.ts"
Task: "T021 [P] [US1] Import pipeline tests in tests/unit/import-pipeline.test.ts"
Task: "T022 [P] [US1] Implement DRM detector in src/import/drm.ts"
Task: "T025 [P] [US1] Update index.html with library + import sections"
Task: "T026 [US1] Extend src/ui/phone-status.ts for multi-book support"
Task: "T027 [P] [US1] Implement library view UI in src/ui/library-view.ts"
```

T023 follows T022. T024 follows T009/T010/T012/T023. T028 follows T024. T029 is the integration bottleneck near the end. T030 caps the phase.

---

## Implementation Strategy

### MVP-shaped delivery

US1 alone is a complete shippable v2 if the user only needs EPUB import. US1 + US2 is the more rounded v2 (handles plain text too). US1 + US2 + US3 covers the failure paths comprehensively. Each phase is independently demoable.

Recommended order for solo execution:

1. Complete Phase 1 (Setup): T001–T004.
2. Complete Phase 2 (Foundational): T005–T018. **STOP and validate** — all foundational tests should pass; the v1 read loop should still work end-to-end with the new types in place.
3. Complete Phase 3 (User Story 1): T019–T030. **STOP and validate** in the simulator with a real EPUB.
4. Complete Phase 4 (User Story 2): T031–T034. **STOP and validate** with both UTF-8 and Latin-1 `.txt` files.
5. Complete Phase 5 (User Story 3): T035–T036. **STOP and validate** with all six refusal categories.
6. Complete Phase 6 (Polish): T037–T040. v2 dev-complete.
7. Hold for hardware (~2026-05-21).
8. Hardware-validation pass folds together v1's R1/R2/R3/R5 measurements (per v1 spec) AND v2's import-on-real-phone validation (per `quickstart.md` hardware-verification checklist).

### Why solo, not parallel team

Same as v1 — this is a solo project. The `[P]` markers exist so the implementing agent (or developer) can group concurrent file edits and avoid serial work that doesn't need to be serial. Not because there's a team.

### Stopping points (good places to call it a day)

- After T013: persistence + migration is complete; library state machine is testable in isolation; nothing user-visible has changed yet.
- After T024: import pipeline works end-to-end at the unit-test level (no UI yet).
- After T029: full v2 UI runs in the simulator.
- After T030: US1 is demoably done.
- After T034: US2 is demoably done.
- After T040: v2 is dev-complete.

---

## Notes

- `[P]` tasks = different files, no incomplete dependencies.
- `[US1]` / `[US2]` / `[US3]` labels are present on every Phase 3+ task; absent everywhere else.
- Constitution gate (from `plan.md` Constitution Check) was passed at plan time and re-verified at design time. No task in this list violates a principle. T030 / T034 / T036 are the explicit Principle VI gates.
- Provisional numbers in `research.md` (R3 storage cap, R4 hashing performance, R5 migration timing, R7 file-picker UX cross-platform) get tightened in the hardware-validation pass — not in v2 implementation.
- Avoid: forking the `paginate()` engine (FR-010 forbids it; use the existing v1 function); adding glasses-side library projection (Constitution Principle I forbids it); silently swallowing import failures (Constitution Principle V forbids it); persisting bulky content via `bridge.setLocalStorage` (Phase 0 R3 mandates IndexedDB for that).
