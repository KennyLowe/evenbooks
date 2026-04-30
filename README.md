# evenBooks

A read-only ebook reader for the Even Realities G2 smart glasses. v1 ships a single hardcoded short story ("The Tell-Tale Heart" by Edgar Allan Poe, public domain) and the gestures to read it on the glasses. Single press advances; double press retreats; swipe down exits.

This is the smallest possible loop on the G2 platform — it deliberately does **not** include book import, library management, or other ebook-reader features. Those land in follow-on specs (002, 003, 004) once we have hardware in hand.

## Run

```bash
npm install
npm run dev          # Vite dev server on :5173
npm run simulate     # Even Hub simulator (in another terminal)
```

To run on real glasses, generate a QR for the Even Realities phone app:

```bash
npm run dev -- --host 0.0.0.0
npx evenhub qr --url http://<your-lan-ip>:5173
```

## Test

```bash
npm test             # one-shot (44 unit tests, ~0.5 s)
npm run test:watch   # watch mode
```

Tests cover pagination, the reader state machine, frame composers, persistence (read recovery + save failure surfacing), and the phone-side state-to-text mapping. Constitution Principle V — failures surface; nothing silent — is enforced by the persistence + UI tests.

## Pack for submission

```bash
npm run build
npx evenhub validate dist
npx evenhub pack app.json dist -o evenBooks-0.1.0.ehpk
```

## Where to read more

- **Spec** — `specs/001-ebook-reader/spec.md` (what v1 does and explicitly does not do)
- **Plan** — `specs/001-ebook-reader/plan.md` (technical context, constitution check)
- **Research** — `specs/001-ebook-reader/research.md` (R1–R7 decisions, including pagination params and sample-text choice)
- **Contracts** — `specs/001-ebook-reader/contracts/` (persistence storage shape, glasses frame composition rules, phone-side UI contract)
- **Quickstart** — `specs/001-ebook-reader/quickstart.md` (setup, dev loop, hardware-verification checklist)
- **Constitution** — `.specify/memory/constitution.md` (governs every G2 app in this workspace)

For SDK reference deeper than this app needs, the parent workspace at `C:\git\even` has the full SDK docs mirror, the official starter templates, and the `evenhub-sdk` skill.

## v1 status

Dev-complete; awaiting hardware (~2026-05-21) for the R1/R2/R3/R5 measurement pass. Provisional simulator-tested numbers in `spec.md` Success Criteria and `research.md` R1 typography constants will be tightened based on real hardware measurements.
