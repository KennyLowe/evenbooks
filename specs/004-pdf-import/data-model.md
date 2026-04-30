# Phase 1 Data Model — evenBooks v4 (PDF Import)

Tiny delta from v3:

## BookFormat (extended)

```ts
export type BookFormat = "bundled" | "epub" | "text" | "pdf";
```

`"pdf"` is the third valid value alongside `"bundled"` (the sample), `"epub"`, and `"text"`.

## ImportFailureReason (extended)

```ts
export type ImportFailureReason =
  | "drm-protected"
  | "malformed"
  | "unsupported-format"
  | "oversize"
  | "unsupported-encoding"
  | "empty"
  | "image-only-pdf"      // NEW
  | "storage-full";
```

`"image-only-pdf"` is the only new value. Canonical message:

> "This PDF appears to be image-only (scanned). evenBooks needs text-based PDFs."

## Storage layout

Unchanged from v3. PDF imports write to:

- `evenBooks.library.v2` — library entry with `format: "pdf"`.
- `evenBooks.position.<bookId>` — per-book reading position.
- WebView IndexedDB `evenBooks.books` — extracted text + paginated pages.

Per-book id rule (Phase 0 R4 from v2): SHA-256 of file bytes truncated to 16 hex chars. Same as EPUB.

## No new entities

The PDF parser produces a `ParsedBook` value identical in shape to the EPUB / TXT parsers' output. The import pipeline orchestrator routes PDFs through the same Stages 4–8 (hash, dedup, paginate, persist content, persist library entry) as EPUB and TXT.
