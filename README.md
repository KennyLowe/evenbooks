# evenBooks

[![CI](https://github.com/KennyLowe/evenbooks/actions/workflows/ci.yml/badge.svg)](https://github.com/KennyLowe/evenbooks/actions/workflows/ci.yml)

An ebook reader for the Even Realities G2 smart glasses. Built spec-first.

**v4** adds PDF import alongside the existing EPUB and plain-text formats. PDFs are parsed with `pdfjs-dist` loaded only when a `.pdf` is picked, so the main bundle stays small. Text extraction walks PDF text content per page, groups items by Y-coordinate into lines, and applies a line-unwrap heuristic (un-hyphenate, sentence-break, soft-merge). DRM/password-protected and image-only PDFs are detected and refused with clear messages. Image-only detection uses a per-page text-density threshold.

**v3** added library management on top of v2's import: per-entry delete (with confirmation), five sort orders (most recent / title / author / progress / date added — persisted across sessions), and a per-session text filter. The bundled sample ("The Tell-Tale Heart" by Edgar Allan Poe, public domain) remains permanently. The reading experience on the glasses is unchanged from v1: single press advances, double press retreats, swipe down exits.

DRM-protected EPUBs and PDFs are detected and refused with a clear message. Embedded images are skipped silently. The reader is text-only by design.

## Run

```bash
npm install
npm run dev          # Vite dev server on :5173
npm run simulate     # Even Hub simulator (in another terminal)
```

To run on real glasses, generate a QR code for the Even Realities phone app:

```bash
npm run dev -- --host 0.0.0.0
npx evenhub qr --url http://<your-lan-ip>:5173
```

## Test, lint, format

```bash
npm test             # one-shot (~120 unit tests, ~3 s)
npm run test:watch   # watch mode
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run lint:fix     # ESLint with auto-fix
npm run format       # Prettier write-in-place
npm run format:check # Prettier verify only
npm run ci           # what GitHub Actions runs (typecheck + lint + test)
```

Tests cover pagination, the reader state machine, frame composers, persistence + migration, IndexedDB content store, content hashing, library state, EPUB parsing, DRM detection, plain-text import, and the full import pipeline (happy path + every typed refusal). Constitution Principle V — failures surface; nothing silent — is enforced by the typed-outcome and notice-channel tests.

## Pack for submission

```bash
npm run build
node node_modules/@evenrealities/evenhub-cli/main.js pack app.json dist -o evenBooks-0.4.0.ehpk
```

## Where to read more

### v4 (current — PDF import)

- **Spec** — `specs/004-pdf-import/spec.md`
- **Plan** — `specs/004-pdf-import/plan.md`
- **Research** — `specs/004-pdf-import/research.md` (R1–R6: pdfjs-dist choice, line-unwrap heuristic, image-only detection threshold, encryption detection, worker strategy, pdf-lib fixtures)
- **Data model** — `specs/004-pdf-import/data-model.md`
- **Contracts** — `specs/004-pdf-import/contracts/pdf-parse.md`
- **Quickstart** — `specs/004-pdf-import/quickstart.md`

### v3 (library management)

- **Spec** — `specs/003-library-mgmt/spec.md`
- **Plan** — `specs/003-library-mgmt/plan.md`
- **Research** — `specs/003-library-mgmt/research.md` (R1–R7: comparator factory, delete coordination, filter strategy, settings, confirmation overlay, race handling, delete-while-reading)
- **Data model** — `specs/003-library-mgmt/data-model.md`
- **Contracts** — `specs/003-library-mgmt/contracts/{delete,sort,filter}.md`
- **Quickstart** — `specs/003-library-mgmt/quickstart.md`

### v2 (book import)

- **Spec** — `specs/002-book-import/spec.md`
- **Plan** — `specs/002-book-import/plan.md`
- **Research** — `specs/002-book-import/research.md` (R1–R7: EPUB strategy, DRM detection, hybrid storage, identity scheme, migration, encoding, file picker)
- **Data model** — `specs/002-book-import/data-model.md`
- **Contracts** — `specs/002-book-import/contracts/{persistence-v2,import-pipeline,library-ui}.md`
- **Quickstart** — `specs/002-book-import/quickstart.md`

### v1 (preserved — read loop)

The v1 documents are still authoritative for the glasses-side read loop, which is unchanged in v2 per FR-017:

- `specs/001-ebook-reader/spec.md` / `plan.md` / `research.md` / `data-model.md` / `contracts/` / `quickstart.md`

### Across both

- **Constitution** — `.specify/memory/constitution.md` (governs every G2 app in this workspace; v3.0.0 at the time of v2)

For SDK reference deeper than this app needs, the parent workspace at `C:\git\even` has the full SDK docs mirror, the official starter templates, and the `evenhub-sdk` skill.

## Status

**v3 dev-complete** as of 2026-04-30. v1 + v2 + v3 all type-check, lint, and pass 143 unit tests; production build is clean; CI runs the same gates on every push. Awaiting hardware (~2026-05-21) for the combined v1/v2/v3 hardware-validation pass. Provisional simulator-tested numbers in the spec Success Criteria and the research timing budgets will be tightened based on real hardware measurements.
