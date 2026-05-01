---
description: "Task list for evenBooks v4 — PDF Import"
---

# Tasks: evenBooks v4 — PDF Import

**Input**: Design documents from `specs/004-pdf-import/`
**Prerequisites**: spec ✓, plan ✓, research ✓, data-model ✓, contracts ✓, quickstart ✓
**Constitution**: `../../.specify/memory/constitution.md` v3.0.0

**Tests**: Vitest unit tests for the PDF parser using `pdf-lib`-generated synthetic fixtures. v1 + v2 + v3 tests carry forward.

## Format: `[ID] [P?] [Story?] Description`

## Phase 1: Setup

- [x] T001 [P] Bump `package.json` version to `0.4.0`.
- [x] T002 [P] Bump `app.json` version to `0.4.0`.
- [x] T003 Install `pdfjs-dist` as a runtime dependency.
- [x] T004 [P] Install `pdf-lib` as a dev dependency (test fixtures only).

## Phase 2: Foundational

- [x] T005 [P] Extend `BookFormat` in `src/content/sample-text.ts` to include `"pdf"`.
- [x] T006 [P] Extend `ImportFailureReason` and `failureMessage` in `src/import/outcomes.ts` with `"image-only-pdf"`.
- [x] T007 [P] Add `tests/unit/_pdf-fixtures.ts` with `buildMinimalPdf({title, author, body, encrypt, imageOnly})` using pdf-lib.

## Phase 3: User Story 1 — Import a text-based PDF (P1)

- [x] T008 [P] [US1] PDF parser tests in `tests/unit/pdf.test.ts` (jsdom env): happy path with metadata; missing metadata → filename fallback; encrypted → drm-protected; image-only → image-only-pdf; malformed → malformed; hyphen unwrap; sentence paragraph break.
- [x] T009 [US1] Implement `src/import/pdf.ts`: `pdfParse(buffer, filename)` per `contracts/pdf-parse.md`. Lazy-imports pdfjs-dist + worker URL. Implements the 9-stage algorithm; line-unwrap heuristic per research R2; image-only detection per research R3.
- [x] T010 [US1] Wire PDF into `src/import/import-pipeline.ts`: extend `ALLOWED_EXTENSIONS` with `"pdf"`; add a `.pdf` branch that calls `pdfParse` (dynamic import); on success, hash via `hashFileBytes` (same rule as EPUB).
- [x] T011 [US1] Update `index.html` file picker `accept` attribute to `.epub,.txt,.pdf`.

## Phase 4: User Story 2 — Refuse PDFs cleanly (P2)

- [x] T012 [P] [US2] Extend `tests/unit/import-failures.test.ts` with PDF refusal cases: image-only, encrypted, malformed, oversize.

## Phase 5: Polish

- [x] T013 [P] Update `README.md` to mention PDF support and bump status.
- [x] T014 [P] Run `npm run ci` (typecheck + lint + format-check + test). All green.
- [x] T015 [P] Run `npm run build` and pack `evenBooks-0.4.0.ehpk`.
- [x] T016 Confirm dynamic-import bundle budget: lazy chunk for pdfjs-dist exists in `dist/assets/`; main bundle size is comparable to v3.

## Dependencies

- T001–T004 [P] (setup); T003 must precede the parser implementation.
- T005, T006, T007 [P] in foundational; small files, independent.
- T008 (test) and T009 (impl) can be authored in parallel; T010 depends on T009; T011 [P].
- T012 depends on T010 (the pipeline branch must exist).
- T013–T016 polish; T016 sequential after T015.

## Notes

- `pdfjs-dist` import is dynamic (`await import("pdfjs-dist")`) — kept off the initial bundle.
- `pdf-lib` is dev-only, never shipped.
- Constitution gate already passes; no Complexity Tracking entry.
