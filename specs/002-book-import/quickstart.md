# Quickstart — evenBooks v2 (Book Import)

What changes for a developer compared to v1's quickstart. Most of v1's setup carries forward; this doc only covers the deltas.

## Prerequisites

Same as v1 — Node 18+, the Even Realities phone app for hardware verification, paired G2 glasses for hardware verification.

New dev dependency: **JSZip** (and `fake-indexeddb` for tests).

```bash
npm install jszip
npm install -D fake-indexeddb
```

## Daily dev loop

Same as v1:

```bash
# Terminal 1
npm run dev

# Terminal 2
npm run simulate
```

The simulator's WebView now hosts a richer phone-side UI — library list, "Add book" button, error / progress slots — alongside the v1 status block.

### Testing the file picker in the simulator

The system file picker invocation works in the simulator the same way it would on a phone — clicking "Add book" pops the OS file picker (the simulator runs as a desktop app, so you'll see the desktop OS's picker rather than a phone picker, but the `<input type="file">` semantics are identical).

For a quick happy-path test:

1. Download a known-good DRM-free EPUB from [Standard Ebooks](https://standardebooks.org/) or [Project Gutenberg](https://gutenberg.org/) (any short title — Carroll's _Alice in Wonderland_ is a good fixture).
2. In the simulator, click "Add book" and pick that file.
3. Watch the import indicator; the new book appears in the library; tap it; the v1 read loop takes over on the simulator's "Glasses Display" window.

For DRM-refusal testing: any EPUB downloaded from Apple Books, Kobo, or Adobe-Digital-Editions-protected library lending will trigger the DRM path.

For unsupported-format testing: rename a `.pdf` to `.epub` and watch it surface as `malformed`.

## Tests

```bash
npm test            # all tests, ~1 s
```

v2 adds these test files (alongside v1's, which carry forward unchanged):

- `tests/unit/library.test.ts`
- `tests/unit/duplicates.test.ts`
- `tests/unit/epub.test.ts`
- `tests/unit/drm.test.ts`
- `tests/unit/text-import.test.ts`
- `tests/unit/import-pipeline.test.ts`
- `tests/unit/persistence-v2.test.ts`
- `tests/unit/persistence-v2-migration.test.ts`
- `tests/unit/book-store.test.ts`

### Test fixtures

EPUB / TXT fixtures are **synthesised at test time** — no binary blobs in the repo. A helper at `tests/unit/_fixtures.ts` exposes:

```ts
buildMinimalEpub({ title?, author?, body?, drm?, malformed? }): Promise<ArrayBuffer>
buildTxtFile(content: string, opts?: { bom?: boolean; encoding?: "utf-8" | "latin-1" }): ArrayBuffer
```

These build valid (or deliberately invalid) ZIP/TXT byte sequences in-memory using JSZip and `Uint8Array` directly. The DRM fixture writes a synthetic `META-INF/encryption.xml` with the canonical Adobe ADEPT algorithm marker — no real DRM content needed.

### IndexedDB in tests

`fake-indexeddb` is loaded as a side-effect import in the persistence tests (`import "fake-indexeddb/auto"` at the top of the test file). This lets the IndexedDB code paths run in Node without a real browser. The behaviour is faithful to spec for the operations v2 uses (open, upgrade, get, put, delete).

## Hardware verification (post-arrival)

Replicate the validation procedure from v1, with these v2-specific additions:

1. Repeat v1's User Story 1 procedure on the bundled sample — confirm no regression.
2. Import a real EPUB from the user's phone storage (download Standard Ebooks' _Alice in Wonderland_ to the phone's Documents folder beforehand). Time the import end-to-end; confirm under 30 s for a 1–5 MB book.
3. Import a 50 MB+ EPUB → confirm `oversize` refusal.
4. Import a known DRM-protected EPUB (e.g. one purchased from Apple Books, copied to the phone) → confirm `drm-protected` refusal with the right message.
5. Import a corrupt EPUB (truncate a real EPUB to half its size, save as `.epub`) → confirm `malformed` refusal.
6. Import the same valid EPUB twice → confirm duplicate detection (no second entry).
7. Import a `.pdf` renamed to `.epub` → confirm `malformed` refusal.
8. Import a Latin-1-encoded `.txt` → confirm `unsupported-encoding` refusal.
9. Read an imported book end-to-end on the glasses → confirm the v1 read loop is unchanged in feel.
10. Reboot the phone → confirm the library and per-book reading positions all survive.
11. Force-clear the WebView's storage (via Settings on the phone) → confirm the library entries remain (in `setLocalStorage`) but tapping an evicted entry surfaces the "content cleared" notice.

Capture screenshots / notes into `specs/002-book-import/artifacts/` (mirroring v1's pattern).

## Build & package

Same as v1:

```bash
npm run build
node node_modules/@evenrealities/evenhub-cli/main.js pack app.json dist -o evenBooks-0.2.0.ehpk
```

Bump `package.json` version to `0.2.0` and `app.json` version to `0.2.0` before packing.

## Migration heads-up

The first time a v1 user opens a v2 build, the migration step runs once: their saved page on the bundled sample is preserved. If anything goes wrong (corrupt v1 payload, etc.), they'll see a one-time "Couldn't migrate previous reading position" notice via the v1 transient channel and start fresh on the sample at page 1. The v1 storage key is preserved on migration failure for forensic inspection (see `contracts/persistence-v2.md` migration state machine).

## Where to learn more

- `spec.md` — what v2 does and doesn't do
- `plan.md` — technical context, structure, constitution check
- `research.md` — the seven Phase 0 decisions (R1–R7) with rationale and alternatives
- `data-model.md` — type definitions for everything new
- `contracts/persistence-v2.md`, `contracts/import-pipeline.md`, `contracts/library-ui.md` — operational contracts the implementation must honour
- `../../.specify/memory/constitution.md` — design discipline that governs this and every other G2 app
- `../001-ebook-reader/quickstart.md` — v1's quickstart, which most of this builds on
