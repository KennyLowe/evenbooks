# v2 baseline artifacts

Evidence that the v2 build passed Phase 3c (US1 simulator validation, T030), Phase 4c (US2 simulator validation, T034), and Phase 5b (US3 simulator validation, T036). Required before declaring v2 dev-complete and ready for the hardware-validation pass.

## v2 status (2026-04-30)

- **Implementation**: complete. 38 of 40 tasks ticked in `tasks.md`. The 2 outstanding (T030 and T036) are human-in-loop simulator validations that I (the agent) cannot perform. Wait — and if you count T034, that's 3. T030 covers US1 (EPUB happy path, FR-013 background tolerance, FR-019 glasses-menu launch); T034 covers US2 (UTF-8 + Latin-1); T036 covers US3 (the six refusal categories).
- **Code**: 116 unit tests across 15 files, all green. `npm test` exits 0. Production build is clean (200 KB JS / 70 KB gzipped). Packed `.ehpk`: `evenBooks-0.2.0.ehpk` (76 KB) at the repo root.
- **v1 read loop**: preserved verbatim per FR-017. v1's 44 tests all carry forward green; the only change to v1 code is the `Book` interface gaining a `format` field and `persistence.ts` switching from a single key to a per-book key (covered in `tasks.md` T011 with a tests update note).

## Required artifacts (T030 / T034 / T036)

Place the following PNG (or JPG) files in `v2-baseline-screenshots/`. Names are conventions; rename if you prefer.

### US1 (T030) — EPUB import

| File | What it shows |
|---|---|
| `01-library-with-imported-epub.png` | Phone-side library list showing the bundled sample plus a freshly-imported EPUB with extracted title and author. |
| `02-import-progress-indicator.png` | Mid-import: the inline "Importing 'filename'…" indicator visible alongside the spinner. |
| `03-imported-book-on-glasses.png` | The simulator's glasses-display window showing the first page of the imported book (not the bundled sample). |
| `04-glasses-menu-resume.png` | After exiting and re-launching from the glasses' app menu, the simulator resumes on the most-recently-opened book. |

### US2 (T034) — plain-text import

| File | What it shows |
|---|---|
| `05-imported-txt-book.png` | Phone-side library list showing a `.txt` import with the filename as title and "Unknown" as author. |
| `06-latin1-refusal.png` | Persistent inline error slot showing the canonical encoding-refusal message after a Latin-1 `.txt` import attempt. |

### US3 (T036) — refusals

| File | What it shows |
|---|---|
| `07-drm-refusal.png` | Inline error slot with the DRM-refusal message after attempting to import a DRM-protected EPUB. |
| `08-malformed-refusal.png` | Inline error slot with the malformed-refusal message after attempting to import a corrupt EPUB or a `.pdf` renamed to `.epub`. |
| `09-unsupported-format-refusal.png` | Inline error slot after attempting to import a `.pdf`, `.docx`, or other unsupported extension. |
| `10-oversize-refusal.png` | Inline error slot after attempting to import a file > 50 MB. |

For each, the library MUST remain unchanged (the file did not enter the library). Confirm visually that no spurious entry appears.

## Validation procedure

From `C:\git\even\evenBooks\`, in two terminals:

```bash
npm run dev
npm run simulate
```

(Make sure `npm run dev` is on `http://localhost:5173`. If it falls back to 5174 because of a stuck listener, kill the listener first or pass `npm run simulate -- http://localhost:5174` to override.)

### T030 — US1 EPUB import procedure

1. Download a small DRM-free EPUB. [Standard Ebooks](https://standardebooks.org/) has clean, well-formed releases; their shortest titles are short stories under 100 KB. Project Gutenberg also works but its EPUBs are noisier.
2. In the simulator, click "Add book". Pick the EPUB. Watch the inline indicator. Confirm the entry joins the library with extracted title and author. Capture `01-library-with-imported-epub.png` and `02-import-progress-indicator.png`.
3. Tap the new entry. Confirm the v1 read loop works on the imported book (advance / retreat / clamp at first / end-of-book / exit / resume). Capture `03-imported-book-on-glasses.png` from any mid-book page.
4. **Background tolerance (FR-013)**: start a fresh import; switch focus away mid-import; switch back. Confirm the import either completed or surfaced a typed failure. The library MUST NOT be in an inconsistent partial state.
5. **Glasses-menu launch (FR-019)**: exit the reader. Re-launch evenBooks from the simulator's app menu. Confirm the most-recently-opened book auto-resumes. Capture `04-glasses-menu-resume.png`.
6. Time the SC-001 budget (5 MB EPUB import). Record the duration in `notes.md` for the hardware-revisit comparison.

### T034 — US2 plain-text procedure

1. Prepare two files: a UTF-8 `.txt` (any modern editor saves as UTF-8 by default) and a Latin-1 `.txt` (in many editors: "Save As" with "Western European (ISO-8859-1)" encoding).
2. Import the UTF-8 file via Add book. Confirm it enters the library with the filename as title and "Unknown" as author. Read end-to-end. Capture `05-imported-txt-book.png`.
3. Import the Latin-1 file. Confirm the canonical encoding-refusal message appears in the inline error slot and the library is unchanged. Capture `06-latin1-refusal.png`.

### T036 — US3 refusals procedure

For each of the six categories, prepare a fixture, import it via Add book, and confirm:

- The canonical message text from `contracts/import-pipeline.md` appears in the inline error slot (verbatim).
- The library is unchanged after dismissing the error.

| Category | How to prepare a fixture |
|---|---|
| `drm-protected` | Any EPUB purchased from Apple Books, Kobo, B&N (legacy), or Adobe-Digital-Editions-protected library lending. |
| `malformed` | Truncate any EPUB to half its size (`head -c <half> book.epub > corrupt.epub` on Unix; PowerShell `[System.IO.File]::WriteAllBytes` partial). |
| `unsupported-format` | Any `.pdf`, `.mobi`, `.docx`, `.rtf`. |
| `oversize` | Generate a 51 MB file: `dd if=/dev/zero of=big.epub bs=1M count=51`. |
| `unsupported-encoding` | Save a `.txt` as Windows-1252 / Latin-1 / UTF-16. |
| `empty` | Create a 0-byte file: `:> empty.txt` or rename to `.epub`. |

Capture screenshots `07` through `10` per the table above. (`unsupported-encoding` and `empty` are also covered by T034 / T030 implicitly; capture an additional shot if you want full coverage.)

### 30-minute soak (T030 final check)

After all imports, read for 30 continuous minutes (or close enough) on the most engaging imported book. Note any anomalies in `notes.md`:

- Lost input or position drift?
- Flicker beyond v1's baseline?
- Phone-side UI freezes?
- Connection-state misreporting?

If everything passes: T030, T034, T036 are done. v2 is dev-complete and ready for the hardware-validation pass (~2026-05-21).

## Hardware-validation handoff (post-2026-05-21)

When the glasses arrive, the v1 hardware-validation pass (R1/R2/R3/R5 from `001-ebook-reader/spec.md`) and the v2 hardware-validation pass (R1–R5 from `002-book-import/spec.md` + the file-picker UX from R5) fold together into one session. Add a parallel `v2-hardware-screenshots/` directory and a `hardware-notes.md` capturing:

- Real-glasses comfort of the v1 read loop on imported books (does the same pagination feel comfortable? does flicker on `textContainerUpgrade` differ between bundled and imported content?).
- File-picker UX on the actual phone OS (iOS or Android) — how does it differ from the simulator's desktop picker? Spec follow-on differences if material.
- Real-world DRM detection: try a few real DRM-protected EPUBs. Does the message appear cleanly?
- IndexedDB persistence under realistic phone storage pressure: import several books, fill the phone's storage, then trigger a reload to see the content-evicted recovery path.

The provisional numbers in `spec.md` SC and `research.md` get tightened in a follow-on plan revision based on these measurements.
