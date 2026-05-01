# Implementation Plan: evenBooks v4 — PDF Import

**Branch**: `004-pdf-import` | **Date**: 2026-04-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/004-pdf-import/spec.md`
**Constitution**: [v3.0.0](../../.specify/memory/constitution.md)

## Summary

Add a third format to the v2 import pipeline: text-based PDF. The lift is small in user-facing terms — file picker `accept` extends to `.pdf`, library and reader work unchanged — but technically PDF parsing requires a non-trivial dependency (PDF.js / `pdfjs-dist`) and a heuristic for converting line-broken PDF text into flowing prose. The dependency is loaded **lazily** via dynamic import so users who never touch a PDF pay zero bundle cost.

New failure category: `image-only-pdf` (the only PDF-specific addition to the existing six refusal kinds). Encrypted PDFs reuse the existing `drm-protected` path; corrupt PDFs reuse `malformed`.

## Technical Context

**Language/Version**: TypeScript 5.7 with `strict: true`. Carries forward.

**Primary Dependencies** (additions in v4):

- `pdfjs-dist` ^4.x — PDF parsing. Mozilla-maintained, MIT, the de-facto standard. ~3 MB unpacked but ~600 KB gzipped of what we actually need (text extraction + worker). Dynamically imported.

Carries forward from v1/v2/v3: SDK, JSZip, Vite, Vitest, ESLint, Prettier, jsdom, fake-indexeddb, jszip.

**Storage**: Unchanged from v3. PDF imports use the same `evenBooks.library.v2` index, per-book reading-position keys, and IndexedDB content store. Library entries gain `format: "pdf"` as a third valid value.

**Testing**:

- Vitest unit tests for the PDF parser using a synthetic minimal PDF generated in-test with `pdf-lib` (a small test-only dep). Covers happy path, image-only detection, encrypted refusal, malformed refusal, metadata fallback.
- All existing v1/v2/v3 tests carry forward unchanged.
- Manual simulator validation with a real downloaded text-based PDF.

**Target Platform**: Same as v3. PDF.js's worker is served via Vite's native worker support; falls back to main-thread parsing if the worker can't load.

**Project Type**: Same single-project Vite + TS plugin.

**Performance Goals**:

- 5 MB text PDF imports in under 60 s (more generous than EPUB's 30 s; PDF parsing is heavier).
- Bundle impact: dynamic import of `pdfjs-dist` keeps the initial bundle unchanged. Lazy-loaded chunk ≤ ~600 KB gzipped (SC-004).
- Reading on the glasses uses the v1 read loop with no regression.

**Constraints**: All constitution constraints carry forward. Same 50 MB file-size cap. `BookFormat` widens to include `"pdf"`.

**Scale/Scope**: Same library design point ≤ 50 books. PDF support doesn't change scale assumptions.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design._

| Principle                                | Verdict | Evidence in plan                                                                                                                                                                                                                               |
| ---------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I. Every Frame Is Glanceable (NN)**    | ✅ Pass | No glasses-side surface added. PDF text → v1 paginate → existing frame composers. Each rendered page is one glanceable frame, exactly as for EPUB.                                                                                             |
| **II. Data Minimalism**                  | ✅ Pass | No microphone, no IMU, no network. PDF parsing is local. Dynamic import means non-PDF users incur zero cost.                                                                                                                                   |
| **III. Phone Is the Brain**              | ✅ Pass | PDF parsing + storage all phone-side. Glasses are unaffected by the new format.                                                                                                                                                                |
| **IV. Battery and Bandwidth Are Sacred** | ✅ Pass | No new BLE traffic. PDF text is paginated once at import, cached in IndexedDB. The lazy-load chunk only fetches when the user picks a `.pdf`.                                                                                                  |
| **V. Crash Without Lying**               | ✅ Pass | Image-only / encrypted / malformed PDFs surface typed canonical messages through the existing import error slot. Worker-load failure falls back gracefully to main-thread parsing with a console warning (no user-visible silent degradation). |
| **VI. Simulator-First**                  | ✅ Pass | PDF parsing runs in the WebView; testable end-to-end in the simulator. Hardware validation folds into the existing combined v1/v2/v3/v4 pass.                                                                                                  |

**Result**: Gate **PASSES**. No Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/004-pdf-import/
├── spec.md            # Feature specification
├── plan.md            # This file
├── research.md        # Phase 0 — pdfjs-dist choice; line-unwrap heuristic;
│                      #          image-only detection; lazy-load strategy;
│                      #          test fixture generation
├── data-model.md      # Phase 1 — BookFormat widened to include "pdf";
│                      #           ImportFailureReason adds "image-only-pdf"
├── contracts/
│   └── pdf-parse.md   # PDF parser contract (input → ParsedBook | failure)
├── quickstart.md      # What changes vs v3
├── checklists/
│   └── requirements.md
└── tasks.md           # (compact; 12-15 tasks)
```

### Source code

```text
src/
├── content/sample-text.ts            # Extended: BookFormat += "pdf"
├── import/
│   ├── pdf.ts                        # NEW: text-based PDF parser
│   ├── outcomes.ts                   # Extended: + "image-only-pdf"
│   ├── import-pipeline.ts            # Extended: branches on .pdf
│   ├── (drm.ts, epub.ts, text-import.ts unchanged)
├── library/
│   └── library.ts                    # (unchanged)
├── reader/                           # (UNCHANGED — v1 read loop preserved)
└── ui/                               # (unchanged)

tests/
└── unit/
    ├── pdf.test.ts                   # NEW: parser happy path + failures
    └── (import-pipeline.test.ts extended with PDF cases)
```

## Complexity Tracking

> Empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| _(none)_  | —          | —                                    |

## Phase 0 — Research

See `research.md` for the full log. Items resolved:

- **R1** PDF parser choice: `pdfjs-dist` via dynamic import. Alternatives (`unpdf`, hand-rolled) rejected.
- **R2** Line-unwrap heuristic: trailing-hyphen merge, sentence-end paragraph break, soft-line space-merge.
- **R3** Image-only detection: total extracted text < threshold across all pages → refuse with `image-only-pdf`.
- **R4** Encryption detection: PDF.js's `getDocument(...).promise` rejects with a `PasswordException` for encrypted docs; we map that to `drm-protected`.
- **R5** Worker strategy: Vite's `?worker&url` import resolves the worker URL at build time; fall back to main-thread parsing on worker-load failure.
- **R6** Test fixture generation: use `pdf-lib` (dev-only dep) to programmatically construct synthetic minimal PDFs with chosen metadata + body text. Avoids committing binary blobs.

## Phase 1 — Design & Contracts

- `data-model.md` — `BookFormat` widened to `"bundled" | "epub" | "text" | "pdf"`. `ImportFailureReason` adds `"image-only-pdf"`. No new persistent entities.
- `contracts/pdf-parse.md` — input contract (`ArrayBuffer` + `filename`), output contract (`ParsedBook` or typed `PdfFailure`), heuristic specifications.
- `quickstart.md` — what changes for a developer (one new dep, one new test file, one new failure category to know about).

**Agent context update**: `CLAUDE.md` updated to point at this plan file (local-only).

**Constitution re-check after design**: Pass. The dynamic-import strategy honours Principle II (cost localised to the feature path). No new SDK calls. The read loop, library, and frame composers are untouched.
