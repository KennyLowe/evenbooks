# evenBooks

An ebook reader for the Even Realities G2 smart glasses. Built spec-first.

**v2** lets you import your own EPUB and plain-text books from phone storage and read them on the glasses. v1's bundled sample ("The Tell-Tale Heart" by Edgar Allan Poe, public domain) remains as a permanent library entry. The reading experience on the glasses is unchanged from v1: single press advances, double press retreats, swipe down exits.

DRM-protected EPUBs are detected and refused with a clear message. Embedded images are skipped silently. The reader is text-only by design.

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

## Test

```bash
npm test             # one-shot (~120 unit tests, ~3 s)
npm run test:watch   # watch mode
```

Tests cover pagination, the reader state machine, frame composers, persistence + migration, IndexedDB content store, content hashing, library state, EPUB parsing, DRM detection, plain-text import, and the full import pipeline (happy path + every typed refusal). Constitution Principle V — failures surface; nothing silent — is enforced by the typed-outcome and notice-channel tests.

## Pack for submission

```bash
npm run build
node node_modules/@evenrealities/evenhub-cli/main.js pack app.json dist -o evenBooks-0.2.0.ehpk
```

## Where to read more

### v2 (current — book import)

- **Spec** — `specs/002-book-import/spec.md`
- **Plan** — `specs/002-book-import/plan.md` (technical context, constitution check)
- **Research** — `specs/002-book-import/research.md` (R1–R7 decisions: EPUB strategy, DRM detection, hybrid storage, identity scheme, migration, encoding, file picker)
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

**v2 dev-complete** as of 2026-04-30. Awaiting hardware (~2026-05-21) for the combined v1/v2 hardware-validation pass. Provisional simulator-tested numbers in the spec Success Criteria and the research timing budgets will be tightened based on real hardware measurements.
