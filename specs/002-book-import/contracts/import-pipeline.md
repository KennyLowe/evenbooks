# Contract: Import Pipeline

The import pipeline ingests a `File` from the system file picker and produces a typed `ImportOutcome`. Pure pipeline (no UI side-effects); the UI surfaces the outcome separately. Lives in `src/import/`.

---

## Entry point

```ts
async function importFile(
  file: File,
  library: Library,
  noticeChannel: NoticeChannel,
): Promise<ImportOutcome>;
```

- `file` — the `File` object from `<input type="file">.files[0]`.
- `library` — the current in-memory library, used for duplicate detection.
- `noticeChannel` — the v1 transient notice channel; used **only** for `storage-full` save failures (those surface via the transient channel, not the import error slot — see Spec Clarification Q2). All other refusals are returned as `ImportOutcome.failure` and the caller surfaces them via the import error slot.

Returns an `ImportOutcome` (per `data-model.md`). Never throws — every error path produces a typed outcome.

---

## Pipeline stages

```text
File
 │
 1. Pre-flight: extension + size check
 │   ├─ extension not in {.epub, .txt} → failure(unsupported-format)
 │   └─ file.size > MAX_FILE_BYTES (50 MB) → failure(oversize)
 │
 2. Read bytes
 │   └─ buffer = await file.arrayBuffer()
 │
 3. Format-specific parse → ParsedBook { title, author, text, format, sourceBytes }
 │   ├─ .epub → epubParse(buffer)
 │   │           ├─ DRM check → failure(drm-protected)
 │   │           ├─ ZIP unpack via JSZip
 │   │           │   └─ unpack failure → failure(malformed)
 │   │           ├─ container.xml → opf path
 │   │           │   └─ missing → failure(malformed)
 │   │           ├─ opf parse → metadata + spine
 │   │           │   └─ parse failure → failure(malformed)
 │   │           └─ spine items → DOMParser → text concat
 │   │               └─ empty after extraction → failure(empty)
 │   │
 │   └─ .txt → textImport(buffer, filename)
 │             ├─ strip UTF-8 BOM if present
 │             ├─ TextDecoder("utf-8", { fatal: true }).decode(buffer)
 │             │   └─ throws → failure(unsupported-encoding)
 │             └─ empty after whitespace normalisation → failure(empty)
 │
 4. Compute id (R4)
 │   ├─ epub: SHA-256 of file bytes → first 16 hex chars
 │   └─ text: SHA-256 of normalised text → first 16 hex chars
 │
 5. Duplicate check
 │   └─ library.entries contains entry with this id?
 │       └─ yes → bump existing entry's addedAt to now; return duplicate(existingEntry)
 │
 6. Paginate
 │   └─ pages = paginate(parsed.text)  ← v1's existing function, unchanged
 │       └─ pages.length === 0 → failure(empty)  // defence in depth
 │
 7. Persist content (IndexedDB)
 │   └─ putBookContent({ id, text, pages: pages.map(p => p.text), storedAt: now })
 │       └─ throws (storage full) → failure(storage-full); emit save-failed notice
 │
 8. Persist library entry (KV)
 │   └─ entry = { id, title, author, format, addedAt: now, lastOpenedAt: null,
 │                totalPages: pages.length }
 │       update library.entries; write evenBooks.library.v2
 │
 9. Return success({ book: parsedBook, entry })
```

Each stage is independently testable; stages 3, 4, 6, 7, 8 each get their own unit test file.

---

## DRM detection (R2)

`src/import/drm.ts` exports:

```ts
function detectsDrm(zipFiles: {
  [path: string]: { content: Uint8Array };
}): boolean;
```

Returns `true` if **any** of the following hold:

1. `META-INF/encryption.xml` exists AND parses AND contains an `<EncryptionMethod>` whose `Algorithm` attribute is **not** the IDPF font-mangling URI (`http://www.idpf.org/2008/embedding`).
2. `META-INF/rights.xml` exists at all (Adobe ADEPT signature).
3. `META-INF/iTunesMetadata.plist` exists at all (Apple FairPlay signature).

Returns `false` otherwise. Pure function over the unpacked ZIP file map; testable without IO.

---

## EPUB parser (`src/import/epub.ts`)

```ts
async function epubParse(
  buffer: ArrayBuffer,
): Promise<ParsedBook | EpubFailure>;

type ParsedBook = {
  format: "epub";
  title: string;
  author: string;
  text: string;
  sourceBytes: ArrayBuffer; // for hashing
};

type EpubFailure =
  | { kind: "drm-protected" }
  | { kind: "malformed"; detail?: string } // detail is for console.warn, not the user
  | { kind: "empty" };
```

Algorithm (high level):

1. Unpack the ZIP via JSZip; if the ZIP is invalid → `malformed`.
2. Run DRM detection (above); if positive → `drm-protected`.
3. Read `META-INF/container.xml`; find the first `<rootfile>` with `media-type="application/oebps-package+xml"`; resolve its `full-path` attribute.
4. Read the OPF file at that path; parse with DOMParser as XML.
   - Read metadata: `<dc:title>` (first), `<dc:creator>` (all, joined with `, `).
   - Read the spine: `<spine>` → `<itemref idref="…">` in order; map each `idref` to its `<manifest>/<item href="…" media-type="application/xhtml+xml">`.
5. For each spine item, fetch its content document, parse as HTML/XHTML, walk the DOM:
   - Skip elements: `script`, `style`, `head`, `nav` (EPUB 3 navigation doc), `img`, `svg`, `audio`, `video`, `iframe`.
   - Treat as paragraph break: `p`, `div`, `section`, `article`, `h1`–`h6`, `li`, `blockquote`, `br`.
   - Treat as text: any remaining text node.
6. Concatenate paragraph blocks with `\n\n`; collapse internal whitespace to single spaces; trim.
7. If the resulting text is empty → `empty`. Otherwise return `ParsedBook`.

Edge cases:

- Title missing → use `filename` minus `.epub` extension (caller passes filename).
- Author missing → "Unknown".
- Multiple authors → joined with `, `.
- Spine empty → `malformed`.
- Spine references missing manifest item → skip that spine item silently; if all skipped → `malformed`.

---

## Plain-text parser (`src/import/text-import.ts`)

```ts
async function textImport(
  buffer: ArrayBuffer,
  filename: string,
): Promise<ParsedBook | TextFailure>;

type TextFailure = { kind: "unsupported-encoding" } | { kind: "empty" };
```

Algorithm:

1. Check for UTF-8 BOM (`0xEF 0xBB 0xBF`) at byte offset 0; strip if present.
2. `text = new TextDecoder("utf-8", { fatal: true }).decode(buffer)`. If decode throws → `unsupported-encoding`.
3. Normalise whitespace: collapse runs to single spaces, preserve `\n\n` paragraph boundaries (or convert single `\n` runs of 2+ to `\n\n`). Trim.
4. If empty → `empty`. Otherwise return:

```ts
{
  format: "text",
  title: filename.replace(/\.txt$/i, ""),
  author: "Unknown",
  text,
  sourceBytes: buffer,   // for hashing — though id is computed from normalised text per R4
}
```

---

## Content hashing (`src/library/duplicates.ts`)

```ts
async function hashFileBytes(buffer: ArrayBuffer): Promise<BookId>; // for EPUBs
async function hashNormalisedText(text: string): Promise<BookId>; // for plain text
```

Both use `crypto.subtle.digest("SHA-256", input)` and truncate the hex output to 16 characters. The bundled sample's id `"sample"` is namespace-disjoint from any hash output (which is always 16 lowercase hex chars).

---

## Refusal messages (canonical)

The `ImportOutcome.failure.reason` discriminator maps 1:1 to the exact text shown in the import error slot. These strings are part of the spec contract — changing them is a UX-policy change requiring a spec update.

| `reason`               | User-facing message                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `drm-protected`        | "This book is protected by DRM and can't be imported. evenBooks supports DRM-free EPUB and plain text." |
| `malformed`            | "Couldn't read this file. It may be damaged or in an unsupported format."                               |
| `unsupported-format`   | "evenBooks supports DRM-free EPUB and plain-text (.txt) files only."                                    |
| `oversize`             | "This file is larger than evenBooks supports right now (max 50 MB)."                                    |
| `unsupported-encoding` | "Unsupported text encoding — please save the file as UTF-8."                                            |
| `empty`                | "This book has no readable content."                                                                    |
| `storage-full`         | (transient notice, not inline) "Couldn't save this book — your phone may be out of space."              |

`duplicate` outcome surfaces the message: "Already in your library — opening the existing copy." (also via the import error slot, despite not being a failure).

---

## Test coverage (Vitest)

`tests/unit/epub.test.ts`:

- Synthesise minimal valid EPUB (JSZip + container.xml + content.opf + one XHTML spine item) → parse succeeds; metadata extracted; body text matches expected.
- Synthesise EPUB with no `<dc:title>` → filename used as title.
- Synthesise EPUB with multiple `<dc:creator>` → joined with `, `.
- Synthesise EPUB with `<img>` in body → image silently skipped; surrounding text intact.
- Synthesise corrupt ZIP (truncated central directory) → `malformed`.
- Synthesise EPUB missing `container.xml` → `malformed`.
- Synthesise EPUB with empty spine → `malformed`.

`tests/unit/drm.test.ts`:

- Synthesise EPUB with `META-INF/encryption.xml` containing ADEPT marker → DRM detected.
- Synthesise EPUB with only IDPF font-mangling encryption → DRM **not** detected.
- Synthesise EPUB with `META-INF/rights.xml` → DRM detected.
- Synthesise EPUB with `META-INF/iTunesMetadata.plist` → DRM detected.
- Plain valid EPUB → DRM not detected.

`tests/unit/text-import.test.ts`:

- UTF-8 input → success.
- UTF-8 + BOM → BOM stripped.
- Latin-1 input (non-UTF-8 byte > 0x7F sequence) → `unsupported-encoding`.
- Empty file → `empty`.
- Whitespace-only file → `empty`.

`tests/unit/duplicates.test.ts`:

- Same buffer hashes to same id; different buffers different ids.
- Hash output is 16 lowercase hex characters.
- `"sample"` is never produced by hashing.

`tests/unit/import-pipeline.test.ts`:

- End-to-end happy path: valid EPUB → `success` with correct `book` and `entry`.
- End-to-end happy path: valid TXT → `success`.
- File over size cap → `oversize`.
- Unsupported extension → `unsupported-format`.
- Duplicate (id already in library) → `duplicate`; existing entry's `addedAt` updated.
- DRM-protected → `drm-protected`.
- Each failure case verifies library is unchanged (no entry added, no IndexedDB record).
