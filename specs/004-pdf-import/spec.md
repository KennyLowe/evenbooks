# Feature Specification: evenBooks v4 — PDF Import

**Feature Branch**: `004-pdf-import`
**Created**: 2026-04-30
**Status**: Draft
**Input**: User description: "Add the ability to import PDFs as well."

## Scope statement

Extend the v2 import pipeline to accept text-based PDF files alongside DRM-free EPUB and plain text. Imported PDFs flow through the same library + read loop the user already knows; no new on-glasses surface. Three things make PDF import meaningfully different from EPUB:

1. **Layout, not flow.** PDFs position text absolutely. Reading-order extraction is heuristic; some PDFs produce great text and some produce garbled output. v1 of PDF support ships the heuristic, documents the limitation, and surfaces a refusal when extraction yields nothing usable.
2. **Image-only PDFs exist.** Scans of physical books are PDFs that contain images, not text. We can't OCR them, and v1 of PDF support is text-only by intent. Image-only PDFs are refused with a clear message.
3. **Encrypted PDFs exist.** Password-protected and DRM-locked PDFs are refused via the existing `drm-protected` category.

Everything else carries forward from v2: file picker, 50 MB cap, content-hash-based duplicate detection, IndexedDB storage, persistent inline error slot for refusals, transient notice for storage-full saves, v1 read loop unchanged.

The phone remains authoritative for all state; the glasses are a derived viewport (constitution Principle III).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Import a text-based PDF and read it (Priority: P1)

A user has a PDF on their phone — a personal document, a public-domain book downloaded as a PDF, an academic paper, etc. They open evenBooks on the phone, tap "Add book", pick the PDF, watch the import progress indicator, and the book appears in their library with title and author extracted from the PDF metadata (or sensible fallbacks). They tap the new entry, the glasses display the first page, and the v1 read loop takes over.

**Why this priority**: Single-story spec. PDF is the only addition.

**Independent Test**: With a text-based PDF on disk (any DRM-free, non-scanned PDF — Project Gutenberg releases, academic preprints, personal exports), import it via the file picker, confirm metadata extraction, open the entry, read 5 pages on the glasses display.

**Acceptance Scenarios**:

1. **Given** the user is on the phone-side library view, **When** they tap "Add book" and select a text-based DRM-free PDF, **Then** the import progress indicator appears.
2. **Given** the import is in progress, **When** it succeeds, **Then** the book appears in the library with title and author extracted from the PDF metadata, and the indicator clears.
3. **Given** the PDF has no metadata or partial metadata, **When** import succeeds, **Then** the book appears with the filename (minus `.pdf`) as the title and "Unknown" as the author.
4. **Given** the user taps the imported PDF, **When** the reader opens, **Then** page 1 of the extracted text appears on the glasses within the same launch budget as EPUB / TXT imports.
5. **Given** the user is reading the imported PDF, **When** they single-press / double-press / swipe down, **Then** the v1 read loop applies unchanged.

### User Story 2 — Refuse PDFs that can't be read cleanly (Priority: P2)

A user attempts to import a PDF that is image-only (scanned), encrypted (password-protected), or malformed. The import fails with a typed canonical message; the library is unchanged.

**Independent Test**: Attempt three imports — a known image-only scan, a password-protected PDF, and a corrupt PDF (truncated bytes). Each surfaces a distinct canonical message in the import error slot; the library does not gain an entry for any of them.

**Acceptance Scenarios**:

1. **Given** the user picks an image-only PDF (a scanned book; pages are bitmaps), **When** import is attempted, **Then** it fails with the canonical message "This PDF appears to be image-only (scanned). evenBooks needs text-based PDFs." and the library is unchanged.
2. **Given** the user picks a password-protected / encrypted PDF, **When** import is attempted, **Then** it fails with the existing DRM-protected message ("This book is protected by DRM and can't be imported. evenBooks supports DRM-free EPUB and plain text.") and the library is unchanged. (We don't attempt to prompt for the password; PDF DRM is out of scope.)
3. **Given** the user picks a corrupt or non-PDF file with a `.pdf` extension, **When** import is attempted, **Then** it fails with the existing malformed message ("Couldn't read this file. It may be damaged or in an unsupported format.").

### Edge Cases

- **PDFs with very long lines** (academic single-column with no soft wrap): treated as a single paragraph; v1 pagination breaks it normally.
- **PDFs with multi-column layout**: text extraction uses page-order; column-merging is not attempted in v1. Some multi-column PDFs will produce out-of-order text. Documented limitation, not a refusal.
- **PDFs with hard line breaks at every visual line**: v1 unwraps with a heuristic — lines ending in a hyphen merge with the next without a space; lines ending in a sentence-terminating punctuation start a new paragraph; otherwise lines join with a single space (assuming PDF hard-broke a flowing line). Imperfect but adequate for text-heavy reading.
- **Empty PDFs / extraction yielded zero non-whitespace text**: refused with the existing `empty` category.
- **PDFs with only embedded fonts no longer present** (extraction returns gibberish): falls back to the v1 user-visible reading test — if the user reads it and it's garbled, that's a known-limitation case; we do not attempt automatic detection.
- **Form-field / annotation-only PDFs**: form fields are treated as text where extractable; annotations are ignored.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept files with a `.pdf` extension as a third importable format alongside `.epub` and `.txt`.
- **FR-002**: System MUST extract title and author from PDF document metadata (the PDF info dictionary or XMP metadata, whichever is more reliable). When metadata is missing, the filename (minus `.pdf`) MUST serve as the title and the author MUST default to "Unknown".
- **FR-003**: System MUST detect encrypted / password-protected PDFs at import time and refuse them via the existing `drm-protected` failure category and message.
- **FR-004**: System MUST detect image-only / scanned PDFs (PDFs whose body has no extractable text) and refuse them with a new typed failure category that names the cause and points to the supported alternative (text-based PDFs, or DRM-free EPUB / plain text).
- **FR-005**: System MUST extract body text from text-based PDFs in page order, applying a line-unwrapping heuristic (un-hyphenate trailing hyphens; merge soft line breaks; preserve paragraph boundaries on sentence-ending punctuation), then hand the result to the existing v1 `paginate()` engine.
- **FR-006**: System MUST refuse corrupt or non-PDF files with a `.pdf` extension via the existing `malformed` failure category.
- **FR-007**: System MUST honour the existing 50 MB file-size cap (oversize refusal).
- **FR-008**: Imported PDFs MUST behave identically to EPUB and plain-text imports under the v1 read loop, the v3 library management surface, and all of v2's error / progress UX.
- **FR-009**: Per-book identity for PDFs MUST be the SHA-256 of file bytes (matching the EPUB rule), so re-importing the same PDF produces the existing-entry duplicate path.
- **FR-010**: PDF import MUST function fully offline; no network access required.

### Key Entities

No new persistent entities. Reuses `Book`, `LibraryEntry`, `ReadingPosition`, `ImportOutcome`. Adds one new value to `ImportFailureReason`: `"image-only-pdf"`.

## Success Criteria *(mandatory)*

Numbers below are provisional; revisited after the first hardware-validation pass.

- **SC-001**: A text-based 5 MB PDF imports in under 60 seconds on a mid-range phone (more generous than the 30 s EPUB budget — PDF parsing is heavier).
- **SC-002**: 100% of image-only / encrypted / malformed / oversized PDFs surface a typed, non-technical error and leave the library unchanged.
- **SC-003**: Reading an imported PDF on the glasses uses the v1 read loop with no regression — gestures, frames, persistence, library integration all unchanged.
- **SC-004**: PDF support adds no more than ~600 KB gzipped to the production bundle. The PDF.js library is loaded lazily — the initial bundle for users who never touch a PDF is unchanged from v3.
- **SC-005**: A user opening evenBooks for the first time, given only a known-good PDF, can import and read 5 pages without consulting documentation.

## Assumptions

1. **Text-based PDFs only.** Scanned / image-only PDFs are refused; OCR is not in scope across any current spec.
2. **No PDF.js worker in tests.** Tests use a synthetic minimal PDF (or one bundled byte fixture) and exercise the parser on the main thread. Production uses the worker for large PDFs.
3. **Heuristic line unwrapping.** PDF text comes line-by-line; we apply a small heuristic to recover flowing prose. Imperfect; documented as a known limitation in the quickstart.
4. **PDF DRM = refusal.** No password prompts, no Adobe ADEPT decryption attempts. Users with DRM-protected PDFs need to remove the DRM before import.
5. **No PDF-specific UX.** No outline / table-of-contents extraction in v1; the reader walks the whole document linearly.
6. **No image extraction or rendering.** Same as the EPUB rule — the reader is text-only.
7. **No annotation / form-field UX.** Highlights, comments, and form fields are not extracted as separate user-visible artifacts (their text content may end up in the body if the extractor includes it, but they are not first-class).
8. **Single-column reading order.** Multi-column PDFs may produce out-of-order text. Documented limitation; not a refusal.

## Dependencies

- Existing v1/v2/v3 dependencies all carry forward.
- Adds **`pdfjs-dist`** as a runtime dependency. Loaded lazily (dynamic import) so the initial bundle is unchanged for users who don't import PDFs.

## Risks & Unknowns

- **R1: Text extraction quality on real-world PDFs.** PDFs vary enormously. Multi-column academic papers, marketing PDFs with text-as-curves, books with embedded subsetted fonts — each can produce poor reading-order extraction. Mitigation: ship the heuristic, document known limitations, accept that some PDFs will read poorly; the user has the option to delete the entry and try a different format.
- **R2: PDF.js bundle size.** ~3 MB unpacked. Mitigation: dynamic import scoped to the PDF parser path; users who never import a PDF pay zero bundle cost.
- **R3: Worker scripts in production WebView.** PDF.js's worker file needs to be served. Mitigation: vite handles worker URLs natively; if the WebView host has trouble loading the worker, we fall back to main-thread parsing (slower for big PDFs, but functional).
- **R4: Encrypted-PDF detection.** PDF.js exposes encryption metadata; should be reliable. Edge case: PDFs with public-key encryption that PDF.js can decrypt without a password (rare). Mitigation: treat any encrypted document as DRM regardless.
- **R5: Image-only detection threshold.** A "text-based" PDF might still have one or two image-only pages (e.g., a cover image followed by chapters). Heuristic: if the extracted text across all pages is below a threshold (e.g. < 100 chars per MB of file size, or < 200 chars total), refuse as image-only. Mitigation: tunable threshold.

## Out of Scope (v1 of PDF import)

- OCR for image-only PDFs (across all current specs).
- Password prompts for encrypted PDFs.
- Multi-column layout reconstruction.
- Embedded media, video, audio, JavaScript actions in PDFs.
- PDF outline / table-of-contents extraction.
- Highlights / annotations / comments as first-class entities.
- Form-field interaction.
- PDF-specific reader chrome (page numbers from the original PDF, etc.).
- PDF/A long-term-archival metadata.
- All other categories from spec 002's out-of-scope list (carry forward).
