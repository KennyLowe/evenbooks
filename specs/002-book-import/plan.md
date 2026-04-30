# Implementation Plan: evenBooks v2 — Import Your Own Books

**Branch**: `002-book-import` | **Date**: 2026-04-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/002-book-import/spec.md`
**Constitution**: [v3.0.0](../../.specify/memory/constitution.md)

## Summary

Extend the v1 single-book reader into a real ebook reader that lets the user import their own EPUB and plain-text books from phone storage. The v1 read loop on the glasses is preserved verbatim — pagination, frames, reducer, persistence-of-reading-position all unchanged per FR-017. The new surface is entirely phone-side: a library list (showing the bundled sample plus any imported books), an "Add book" affordance that opens the system file picker, an import pipeline (EPUB unpacking via JSZip + plain-text UTF-8 decoding + naive char-count pagination via the existing engine), DRM detection that refuses with a clear message, six typed refusal categories surfaced through an import error slot, a non-blocking import progress indicator, content-hash–based duplicate detection, and a one-time migration of v1's saved reading position onto the bundled sample's per-book entry.

The technical approach commits to: **JSZip** for EPUB unpacking; the **WebView's native DOMParser** for OPF/XHTML parsing; **`SubtleCrypto.digest`** for content hashing; a **hybrid storage model** with `bridge.setLocalStorage` for small/durable metadata (library index, reading positions) and **WebView IndexedDB** for bulky derived content (book text, paginated pages); the existing pure `paginate()` from v1 (no fork) for both bundled and imported content; and a clean v1 → v2 migration on first launch that surfaces an explicit notice if anything goes wrong.

## Technical Context

**Language/Version**: TypeScript 5.7 with `strict: true`. Target: ES2022. Carries forward from v1.

**Primary Dependencies** (additions in v2):

- `jszip` ^3.10 — ZIP unpacking for EPUBs. Pure JS, no platform-specific bindings, broad browser/WebView compatibility, MIT license, ~100 KB minified. The de-facto standard in this niche.

Carries forward from v1:

- `@evenrealities/even_hub_sdk` ^0.0.10 — SDK (unchanged).
- `@evenrealities/evenhub-cli`, `@evenrealities/evenhub-simulator`, `vite`, `vitest`, `typescript`, `@types/node` — dev tooling (unchanged).

No EPUB-specific parsing library beyond JSZip. OPF (`content.opf`), container (`META-INF/container.xml`), and XHTML content documents are parsed with the WebView's built-in `DOMParser`. EPUBJS and similar full-stack ebook libraries are explicitly rejected (see Phase 0 R1).

**Storage**:

- `bridge.setLocalStorage` (carries forward from v1) — used for `evenBooks.library.v2` (the library index), `evenBooks.position.<bookId>` (per-book reading positions), and migration of the v1 key. Small payloads only.
- WebView IndexedDB (new) — stores per-book bulky content (`{ text, pages }`) keyed by bookId. Used because individual books can be multi-megabyte and the SDK's KV channel may impose size caps; IndexedDB is the standard browser storage primitive for blobs of this size.

**Testing**:

- Vitest unit tests for: pagination (existing, unchanged), reader reducer (existing), frames (existing), v1 persistence (existing), phone-status mapping (existing), and new modules: EPUB parser, plain-text import, DRM detection, content hashing / duplicate detection, library state management, persistence v2 + migration, file-picker boundary.
- EPUB fixtures synthesised at test time using JSZip (no binary blobs in the repo). DRM-protected fixture is a synthetic ZIP with a `META-INF/encryption.xml` containing the canonical Adobe ADEPT marker.
- Manual integration runs against `evenhub-simulator` for the import flow, library list, and reader continuity.

**Target Platform**: same as v1 — Even Hub plugin (web app inside the Even Realities companion app's WebView, on iOS / Android phones). `min_sdk_version: "0.0.10"`. The system file picker is reached via a hidden `<input type="file" accept=".epub,.txt">` element triggered programmatically.

**Project Type**: same single-project Even Hub plugin from v1, extended.

**Performance Goals** (provisional, simulator-tested; revisit on hardware):

- Happy-path 5 MB EPUB import in under 30 s (SC-001).
- Resume from library tap in under 3 s (SC-002).
- Library scroll and tap-to-open in under 200 ms for ≤ 10 books (SC-007).
- 100 % surfaced refusal rate for the six failure categories (SC-004).
- v1 read-loop performance unchanged (inherits v1's ≤ 500 ms page-turn budget).

**Constraints**:

- All v1 constitution constraints carry forward (single text container, glanceable frames, phone-authoritative state, etc.).
- Maximum imported file size 50 MB (Spec Assumption 6).
- Plain-text encoding: UTF-8 only (Spec Assumption 4).
- EPUB scope: EPUB 2 + EPUB 3 body text; nav doc, ToC, footnotes, embedded media all ignored (Spec Assumption 5).
- Fully offline at runtime — no network calls, including for imports (file is local).
- All errors either recover with a user-visible recovery, surface in the import error slot, or surface in the v1 transient notice channel — the choice depends on lifecycle semantics (Constitution Principle V).

**Scale/Scope**: Library design point ≤ 10 books (SC-007). Higher counts work but UX is not optimised for them in v2; sorting, search, and virtualisation are 003-library concerns.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design._

Constitution v3.0.0 has one **NON-NEGOTIABLE** principle (I) and five soft principles (II–VI). Each is evaluated against this plan:

| Principle                                         | Verdict | Evidence in plan                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I. Every Frame Is Glanceable (NN)**             | ✅ Pass | The glasses-side read loop is unchanged (FR-017). The new phone-side library list and import flow live entirely on the phone WebView, not on the glasses. No new glasses frames, no chrome added to existing frames.                                                                                                                                                                                 |
| **II. Data Minimalism**                           | ✅ Pass | No microphone, no IMU, no network. Imported book content lives only on the device (companion app KV + WebView IndexedDB). Content hashing is local; no telemetry. The 50 MB per-file cap (Assumption 6) and explicit `storage-full` refusal (FR-014, FR-015) keep storage usage bounded and visible.                                                                                                 |
| **III. Phone Is the Brain, Glasses Are the Lens** | ✅ Pass | Library, import pipeline, and persistence all phone-side. Glasses display continues to be a derived projection of the active reader state. The reducer (`src/reader/reader.ts`) is unchanged; it operates on whatever `Book + Page[]` it receives, regardless of source (bundled or imported).                                                                                                       |
| **IV. Battery and Bandwidth Are Sacred**          | ✅ Pass | Import does not touch BLE — imports happen entirely on the phone before the user opens the book. Reading still uses `textContainerUpgrade` per v1. No new IMU or audio. The pre-paginate-once-cache-forever model (Assumption 8) avoids repeated rendering work per page-turn.                                                                                                                       |
| **V. Crash Without Lying**                        | ✅ Pass | Six typed refusal categories (FR-014, FR-015) surface through the import error slot with non-technical messages. The v1 transient notice channel is preserved for ephemeral status (`save-failed`, recovery notices). The migration step (FR-021) is wrapped in error handling that surfaces a notice on failure rather than silently regressing. The `storage-full-during-import` path is explicit. |
| **VI. Simulator-First, Hardware-Verified**        | ✅ Pass | The full import pipeline is testable in the simulator: the WebView hosts the file picker, JSZip runs in the WebView, IndexedDB is available, and the bundled sample preserves v1's read-loop verification. Hardware verification of the import flow happens in the same hardware-validation pass as v1's R1/R2/R3/R5 (post-2026-05-21).                                                              |

**SDK invariants** (from constitution): all respected.

- One container, ≤ 12: ✅ (still 1 text container).
- Exactly one `isEventCapture: 1`: ✅ (unchanged).
- `createStartUpPageContainer` called once: ✅ (unchanged).
- `textContainerUpgrade` payload ≤ 2000 chars: ✅ (the existing 600-char hard cap from v1 still applies regardless of book source).
- Long press not bound: ✅ (no new event handlers).
- Image sends serial: ✅ (still no image sends).

**Result**: Gate **PASSES**. No Complexity Tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/002-book-import/
├── spec.md                    # Feature specification (clarified, v2 ready)
├── plan.md                    # This file
├── research.md                # Phase 0 — resolves R1–R7
├── data-model.md              # Phase 1 — Book, LibraryEntry, Library, ImportOutcome
├── quickstart.md              # Phase 1 — clone, install, dev loop, fixtures
├── contracts/
│   ├── persistence-v2.md      # Storage schema (KV keys, IndexedDB store, migration)
│   ├── import-pipeline.md     # File → typed outcome contract (EPUB and plain-text paths)
│   └── library-ui.md          # Phone-side library + import UI surface contract
├── checklists/
│   └── requirements.md        # Spec quality checklist (already passing)
└── tasks.md                   # Phase 2 output — generated by /speckit-tasks (NOT created here)
```

### Source code (project root: `C:\git\even\evenBooks`)

```text
evenBooks/
├── app.json, package.json, tsconfig.json, vite.config.ts, vitest.config.ts, index.html (extended)
├── src/
│   ├── main.ts                                  # Bootstrap (extended: migration → load library → render UI / open glasses reader)
│   ├── content/
│   │   └── sample-text.ts                       # (unchanged — bundled "The Tell-Tale Heart")
│   ├── library/
│   │   ├── library.ts                           # Library state: in-memory list + persisted index sync
│   │   ├── library-entry.ts                     # LibraryEntry shape, sort comparator, sample bootstrap
│   │   └── duplicates.ts                        # SubtleCrypto-based content hashing for dedup
│   ├── import/
│   │   ├── import-pipeline.ts                   # Orchestrates: file → format detection → parse → paginate → store → library entry
│   │   ├── epub.ts                              # EPUB parser: JSZip + DOMParser; extracts metadata + body text
│   │   ├── drm.ts                               # DRM detection (ADEPT, FairPlay markers in META-INF/encryption.xml)
│   │   ├── text-import.ts                       # Plain-text path (UTF-8 + BOM strip)
│   │   └── outcomes.ts                          # ImportOutcome typed result + refusal-message text
│   ├── platform/
│   │   ├── bridge.ts, errors.ts, teardown.ts, events.ts, connection.ts   # (unchanged from v1)
│   │   ├── persistence.ts                       # (extended: per-book reading-position read/write)
│   │   ├── persistence-v2-migration.ts          # One-shot v1 → v2 migration on first launch
│   │   └── book-store.ts                        # IndexedDB wrapper: getBookContent, putBookContent, deleteBook
│   ├── reader/
│   │   ├── pagination.ts, frames.ts, reader.ts  # (UNCHANGED — Constitution Principle III, FR-017)
│   ├── ui/
│   │   ├── library-view.ts                      # Phone-side library list + tap-to-open
│   │   ├── import-flow.ts                       # Add book button, file picker, import progress indicator, import error slot
│   │   └── phone-status.ts                      # (extended: works with multiple books, switches title/progress on book change)
│   └── index.html                               # (extended with library + import slots)
└── tests/
    └── unit/
        ├── (existing v1 tests carry forward; persistence.test.ts gets a mechanical signature update for the new bookId argument — see tasks.md T011)
        ├── library.test.ts                      # Library state mutations, sort order
        ├── duplicates.test.ts                   # Content-hash determinism, dedup behavior
        ├── epub.test.ts                         # EPUB parse: metadata extraction, body extraction, image skip, malformed cases
        ├── drm.test.ts                          # ADEPT + FairPlay detection on synthetic encryption.xml
        ├── text-import.test.ts                  # UTF-8, BOM strip, non-UTF-8 refusal, empty file
        ├── import-pipeline.test.ts              # End-to-end: file → outcome (success and failure cases)
        ├── persistence-v2.test.ts               # Per-book read/write recovery state machine (library index tested separately in library.test.ts; IndexedDB tested in book-store.test.ts)
        ├── book-store.test.ts                   # IndexedDB wrapper round-trip + sample short-circuit
        └── persistence-v2-migration.test.ts     # v1 key → v2 sample entry migration; idempotence; corruption handling
```

**Structure Decision**: Continue the single-project Vite + TS layout from v1. The v1 source tree is preserved verbatim under `src/reader/`, `src/content/`, and most of `src/platform/`. New top-level source dirs (`src/library/`, `src/import/`) hold the v2-specific code; the `src/ui/` dir gains library and import surfaces. All v1 unit tests carry forward unchanged; new tests live alongside in `tests/unit/`. No `frontend/` + `backend/` split (still no backend). No headless integration tests in v2 — same posture as v1.

## Complexity Tracking

> Empty. The Constitution Check passes without violations.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| _(none)_  | —          | —                                    |

## Phase 0 — Research

See `research.md` for the full research log. Items resolved:

- **R1** EPUB parsing strategy and library choice (JSZip + native DOMParser vs full ebook libraries vs hand-rolled).
- **R2** DRM detection technique (ADEPT/FairPlay markers in `META-INF/encryption.xml` + `META-INF/rights.xml`).
- **R3** Storage architecture (hybrid: SDK KV for small/durable metadata + WebView IndexedDB for bulky content; cache-loss recovery posture).
- **R4** Per-book identity scheme (truncated SHA-256 of file bytes for EPUBs, of normalised text for `.txt`; bundled sample uses fixed id `"sample"`).
- **R5** v1 → v2 migration sequencing (one-shot bootstrap step, idempotent, surfaces a notice on failure rather than silent regression).
- **R6** Plain-text encoding handling (UTF-8 with BOM strip; refuse non-UTF-8 via `TextDecoder({ fatal: true })`).
- **R7** File-picker integration in the WebView (hidden `<input type="file">` element with `accept` attribute; `change` event → `File` object → `arrayBuffer()`).

The Phase 0 research file also pre-commits the test fixture strategy — synthetic EPUBs and TXT files generated in-test via JSZip and `Blob` rather than committed binary blobs.

## Phase 1 — Design & Contracts

See:

- `data-model.md` — Book (extended), LibraryEntry (new), Library (in-memory state + persisted index), ReadingPosition (per-book), ImportOutcome (typed result), ImportJob (transient progress entity), and how these all interact with the v1 ReaderState reducer (which is unchanged).
- `contracts/persistence-v2.md` — full storage schema: SDK KV keys, IndexedDB store name and shape, migration state machine, recovery state machine for the new "content-evicted" failure mode.
- `contracts/import-pipeline.md` — input contract (a `File` from the picker), output contract (`ImportOutcome`), the typed-error shape per refusal category, and the canonical user-facing message for each.
- `contracts/library-ui.md` — phone-side surface: DOM structure, library entry component, "Add book" button, import error slot, import progress indicator, and how the library view interacts with the existing v1 phone-status block.
- `quickstart.md` — what changes for a developer compared to v1: new dev dependencies, EPUB test-fixture generation, simulator notes for the file picker, and the hardware-validation handoff for v2.

**Agent context update**: `CLAUDE.md` updated to point at this plan file (note: `CLAUDE.md` is local-only, gitignored).

**Constitution re-check after design**: Pass. The design adds no new SDK calls beyond `bridge.setLocalStorage` / `bridge.getLocalStorage` (already used in v1) and uses no new BLE channels. The IndexedDB usage is internal to the WebView and bypasses BLE entirely. The reducer + frames + pagination remain pure functions, idempotent, untouched. The phone-side surface grows but stays within the constitution's bounds (phone-authoritative, no glasses-side library projection).
