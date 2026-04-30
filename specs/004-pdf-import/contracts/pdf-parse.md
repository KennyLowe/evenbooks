# Contract: PDF Parser

Pure(-ish) function. Lives in `src/import/pdf.ts`. Loaded lazily via dynamic
`import()` from `src/import/import-pipeline.ts` only when a `.pdf` is being
imported.

## Public surface

```ts
async function pdfParse(
  buffer: ArrayBuffer,
  filename: string,
): Promise<ParsedBook | PdfFailure>;

type ParsedBook = {
  format: "pdf";
  title: string;
  author: string;
  text: string;
};

type PdfFailure =
  | { kind: "drm-protected" }
  | { kind: "malformed"; detail?: string }
  | { kind: "empty" }
  | { kind: "image-only-pdf" };
```

## Algorithm

```text
1. Lazy-import pdfjs-dist (and its worker URL).
2. Try pdfjsLib.getDocument({ data: new Uint8Array(buffer), ... }).promise.
   - on PasswordException → return { kind: "drm-protected" }
   - on any other error before the document loads → { kind: "malformed", detail }
3. Read document metadata via pdfDoc.getMetadata().
   - title: info.Title || metadata XMP title || filename minus ".pdf"
   - author: info.Author || metadata XMP creator (joined with ", ") || "Unknown"
4. For each page (1..numPages):
   - Get text content via page.getTextContent().
   - Build line strings by Y-coordinate change, in source order.
5. Apply the line-unwrap heuristic (research R2) to merge lines:
   - trailing hyphen + letter → join without space
   - sentence terminator (.!?) → join with paragraph break "\n\n"
   - otherwise → join with single space
6. Join page bodies with "\n\n".
7. Trim and whitespace-normalise the result.
8. Compute total length; if below threshold (research R3), return
   { kind: "image-only-pdf" }.
9. Otherwise return ParsedBook { format: "pdf", title, author, text }.
```

## Worker strategy (research R5)

Production: `pdfjsLib.GlobalWorkerOptions.workerSrc` is set to the URL
provided by Vite's `?worker&url` import.

Tests: same library, but in jsdom the worker is automatically unavailable;
PDF.js falls back to inline parsing. The test fixtures are small (single-page
or two-page synthetic PDFs) so this is fast.

If a worker-load failure is detected at runtime (the rare case in some
restrictive WebView hosts), the parser sets `disableWorker: true` and
retries on the main thread with a console warning.

## Test coverage (Vitest)

`tests/unit/pdf.test.ts` (jsdom env):

- Synthesise a minimal PDF with body text → `pdfParse` returns a `ParsedBook`
  with the expected text.
- Synthesise a PDF with title and author metadata → metadata is extracted.
- Synthesise a PDF with no metadata → filename is used as title; author = "Unknown".
- Synthesise an encrypted PDF (`pdf-lib` supports `encrypt()` with a password)
  → `pdfParse` returns `kind: "drm-protected"`.
- Synthesise a PDF with no text content (only a placeholder image) →
  `pdfParse` returns `kind: "image-only-pdf"`.
- Feed a non-PDF buffer (random bytes; or a `.txt` body) →
  `pdfParse` returns `kind: "malformed"`.
- Hyphen-unwrap test: synthesise a PDF whose body is `"transi-\nlation."` →
  output text contains "translation."
- Sentence-paragraph test: synthesise a PDF whose body is `"End. Next start."`
  on two lines → output paragraphs split between "End." and "Next start."
