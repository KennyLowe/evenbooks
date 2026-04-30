# Quickstart — evenBooks v4 (PDF Import)

## New dependencies

- Runtime: `pdfjs-dist` (^4.x) — loaded lazily; not in the initial bundle.
- Dev-only: `pdf-lib` (^1.x) — generates synthetic PDFs for tests.

## New source modules

```
src/import/pdf.ts           — text-based PDF parser
```

Plus extensions to:

- `src/content/sample-text.ts` — `BookFormat` widened to include `"pdf"`.
- `src/import/outcomes.ts` — `ImportFailureReason` adds `"image-only-pdf"`.
- `src/import/import-pipeline.ts` — branches on `.pdf` extension; lazy-imports the parser.
- `index.html` — file picker `accept` attribute extends to `.pdf`.

## New tests

```
tests/unit/pdf.test.ts          — parser happy path + failures
tests/unit/_pdf-fixtures.ts     — pdf-lib helpers
tests/unit/import-pipeline.test.ts (extended)
```

## Daily dev loop

Same as v3:

```bash
npm run dev
npm run simulate
```

Test by importing a real PDF — Project Gutenberg has plenty of public-domain titles available as PDF (in addition to EPUB).

## Manual simulator validation

1. Import a text-based PDF (e.g. a Project Gutenberg title's PDF release): confirm the entry appears with extracted title/author and reads on the glasses.
2. Import a known image-only PDF (a scanned document): confirm the canonical "image-only" refusal appears.
3. Import a password-protected PDF: confirm the `drm-protected` message appears.
4. Import a non-PDF file renamed `.pdf`: confirm `malformed`.
5. Confirm v3 library management still works on the imported PDF — delete it, sort filtering by author, etc.

## Build & package

Same as v3 (bump versions to `0.4.0`):

```bash
npm run build
node node_modules/@evenrealities/evenhub-cli/main.js pack app.json dist -o evenBooks-0.4.0.ehpk
```

## Known limitations

- **Multi-column PDFs** may produce out-of-order text. Documented; not refused.
- **PDFs with only embedded subsetted fonts** may produce gibberish text. The user notices; we don't auto-detect.
- **Annotations / form fields** are not extracted as first-class artifacts.
- **PDF outlines / table of contents** are not used; the reader walks the whole document linearly.

## Why dynamic import?

`pdfjs-dist` is ~600 KB gzipped (the chunk we use). Loading it eagerly would bloat the initial bundle for every user, including those who only read EPUBs and `.txt`. The dynamic import in `import-pipeline.ts`'s `.pdf` branch means the chunk only fetches when the user actually picks a PDF — exactly when they need it. SC-004's bundle-budget claim depends on this.
