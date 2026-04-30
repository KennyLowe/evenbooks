# Phase 0 Research — evenBooks v4 (PDF Import)

For each: **Decision**, **Rationale**, **Alternatives**.

---

## R1 — PDF parser choice

**Decision**: `pdfjs-dist` (Mozilla's PDF.js as an npm package). Loaded **lazily** via dynamic `import()` from inside the import pipeline; users who never pick a `.pdf` never load it.

**Rationale**:

- PDF.js is the only mature pure-JS PDF parser. It's MIT-licensed, in active development at Mozilla, runs in browsers + WebViews + Node, and exposes a stable text-extraction API (`getTextContent` per page).
- Dynamic import is supported natively by Vite. The `pdfjs-dist` chunk only downloads when the import pipeline reaches the `.pdf` branch.
- No reasonable hand-rolled alternative — PDF is a complex binary format with several layers (xref tables, content streams, font subsetting, encryption).

**Alternatives**:

- *unpdf* — thin wrapper over `pdfjs-dist`. Same underlying library; no real win. Rejected.
- *Hand-rolled PDF parser* — months of work for no compensating benefit. Rejected.
- *Server-side parsing* — violates Principle II (Data Minimalism, local-first) and adds a network dependency we explicitly forbid. Rejected.
- *Skip PDF support entirely* — explicitly the user's ask. Rejected.

---

## R2 — Line-unwrap heuristic

**Decision**: Walk PDF.js `getTextContent` items per page, build line strings by Y-coordinate, then concatenate lines with these rules:

```text
For each adjacent pair (prev, next) of non-empty lines on the same page:
  if prev ends with "-" (hyphen) and the previous character is a letter:
    join: prev[:-1] + next
  else if prev ends with sentence terminator (.!?):
    join with paragraph break: prev + "\n\n" + next
  else:
    join with single space: prev + " " + next

Between pages: insert "\n\n" (paragraph break).
```

**Rationale**:

- PDFs commonly hard-break at every visual line. To reflow for our 576×288 display we need to recover the source paragraph structure.
- The trailing-hyphen rule handles word-broken lines ("transi-\nlation" → "translation").
- The sentence-terminator-paragraph rule is a reasonable proxy for paragraph boundaries.
- The default (space-join) collapses soft line breaks within a paragraph.
- Imperfect — multi-column PDFs and PDFs with unusual punctuation will produce some odd reading. Documented as a known limitation in the spec.

**Alternatives**:

- *Preserve PDF line breaks verbatim* — produces choppy reading on the glasses; every visual line of the PDF becomes its own paragraph in our pagination. Rejected.
- *Layout-aware reconstruction* (column detection, reading-order analysis) — significantly more complex; out of scope for v1 of PDF support.
- *Use PDF.js's experimental layout-aware extraction* — not stable across versions. Revisit when PDF.js's text-layer matures.

---

## R3 — Image-only PDF detection

**Decision**: Count the total characters of extracted text across all pages. If the count is below a threshold based on file size, refuse the import with `image-only-pdf`.

```text
threshold = max(200, fileBytes / 10_000)
i.e. for a 5 MB file → 500 chars minimum
     for a 100 KB file → 200 chars minimum (the floor)

if total extracted text length (post-heuristic, whitespace-trimmed)
   < threshold:
   refuse with kind "image-only-pdf"
```

**Rationale**:

- A scanned book PDF will contain almost no extractable text — the pages are bitmaps. The character count is the simplest, most reliable signal.
- A truly tiny text-based PDF (a one-paragraph note) might trip the floor; that's a known false-positive but rare in real ebook-reading use.
- Tunable — if hardware-validation surfaces real-world PDFs that confuse the threshold, the constants move.

**Alternatives**:

- *Inspect PDF.js operator counts* — count drawing operators per page; high image-fill operators with low text operators ⇒ image-only. More accurate but more complex; revisit if the simple threshold misclassifies.
- *Refuse only on zero text* — would let through scans with stray OCR-derived text. Rejected.
- *Attempt OCR* — explicitly out of scope.

---

## R4 — Encryption detection

**Decision**: Pass-through to PDF.js's behaviour. PDF.js's `getDocument({ data: ... }).promise` rejects with a `PasswordException` (or `EncryptedPDFException`) when the document is encrypted. Catch the rejection, map to `drm-protected`.

We do **not** prompt for a password. PDFs locked behind passwords are out of scope by intent; the user removes DRM upstream of evenBooks if they want to import.

**Rationale**: Reuses an existing failure category and message. PDF.js does the cryptographic-protocol detection for us.

**Alternatives**:

- *Prompt for a password* — out of scope per spec FR-003 / Assumption 4.
- *Attempt to bypass* — illegal in many jurisdictions; rejected.

---

## R5 — Worker strategy in production

**Decision**: Use PDF.js's worker mode in production via Vite's native worker URL imports. If the worker fails to load (some restrictive WebView contexts), fall back to main-thread parsing with a `console.warn` and a slightly slower import.

```ts
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?worker&url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// In the parser, wrap getDocument in a try/catch; on a clear worker-load
// failure (NetworkError or "Setting up fake worker failed"), retry with
// `disableWorker: true`.
```

**Rationale**: The worker handles big PDFs without blocking the main thread (UI stays responsive during a 50 MB import). The main-thread fallback is graceful — it always works, just slower.

**Alternatives**:

- *Always main-thread* — blocks the UI on big PDFs. Rejected.
- *Always worker, no fallback* — fragile in unusual deployment contexts. Rejected.

---

## R6 — Test fixture generation

**Decision**: Use `pdf-lib` (dev-only dep) to programmatically construct synthetic minimal PDFs in tests. Each test generates the PDF it needs (specific title / author / body / encryption / image-only) and feeds it to the parser.

```ts
// In tests/unit/_pdf-fixtures.ts:
import { PDFDocument, StandardFonts } from "pdf-lib";

export async function buildMinimalPdf(opts: {
  title?: string;
  author?: string;
  body?: string;
}): Promise<ArrayBuffer> { ... }

export async function buildImageOnlyPdf(): Promise<ArrayBuffer> { ... }
```

**Rationale**:

- Same posture as the v2 EPUB fixtures — synthesised in-test, not committed as binary blobs.
- `pdf-lib` is a small, well-maintained library specifically for constructing PDFs.
- Dev-only dependency; no production cost.

**Alternatives**:

- *Bundle a tiny binary PDF as a base64 string* — possible (a minimal PDF is ~500 bytes) but more brittle to maintain than `pdf-lib`-generated tests.
- *Use real PDFs from the public domain* — licensing fine but the fixtures get large and tests run slowly; rejected.

---

## Summary table

| ID | Topic | Decision |
|---|---|---|
| R1 | PDF parser | `pdfjs-dist` via dynamic import |
| R2 | Line unwrapping | trailing-hyphen merge + sentence-end paragraph + space-join |
| R3 | Image-only detection | text-length threshold scaled by file size |
| R4 | Encryption detection | catch PDF.js's PasswordException → `drm-protected` |
| R5 | Worker strategy | worker in production; main-thread fallback |
| R6 | Test fixtures | `pdf-lib` (dev-only) generates synthetic PDFs in-test |
