# Phase 0 Research — evenBooks v1

This document resolves the unknowns surfaced in `spec.md` (R1–R5) and from the clarification session's Outstanding column (R6), plus one technology / content decision (R7) that the plan needs to commit before tasks can be generated.

For each item: **Decision** (what was chosen), **Rationale** (why), **Alternatives** (what else was considered), **Hardware-revisit?** (whether the decision is provisional pending a hardware run).

---

## R1 — Naive pagination parameters

**Question**: Concrete values for chars-per-line, lines-per-page, and total-chars-per-page on the 576 × 288 4-bit greyscale display.

**Decision**: Provisional v1 values, codified as constants in `src/reader/pagination.ts`:

| Parameter             | v1 value     | Reasoning                                                                                                                    |
| --------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Display width         | 576 px       | Hardware fixed                                                                                                               |
| Display height        | 288 px       | Hardware fixed                                                                                                               |
| Side padding          | 4 px each    | Matches the official `text-heavy` template's default (Constitution Principle I — readable without focus)                     |
| Top/bottom padding    | 4 px each    | Same                                                                                                                         |
| Effective text area   | 568 × 280 px | Display minus padding                                                                                                        |
| Target chars per line | **48**       | Provisional. Approximation: ~12 px per char at a comfortable peripheral-vision size. Will measure on real glasses in week 1. |
| Target lines per page | **6**        | Provisional. ~46 px per line (text + leading). Yields a glanceable density. Will measure.                                    |
| Target chars per page | **~280**     | 48 × 6, minus typical word-boundary slack ≈ **~250–280 chars** per paginated page in practice.                               |
| Hard cap per page     | 600 chars    | Defensive cap well below the 1000-char `TextContainerProperty.content` and 2000-char `textContainerUpgrade` SDK limits.      |

The pagination algorithm:

1. Walk the text in source order, accumulating words into a buffer.
2. Track a current-line char count; when adding the next word + space would exceed `CHARS_PER_LINE`, start a new line.
3. Track a current-page line count; when starting a new line would exceed `LINES_PER_PAGE`, emit the buffer as a page and start a new one.
4. Long-word handling per spec assumption #5 (break-anywhere): if a single word exceeds `CHARS_PER_LINE`, hard-break it at exactly `CHARS_PER_LINE` characters.
5. Output is a `string[]` — index = page number; constant-time random access.

**Rationale**: We genuinely do not know the right typography parameters until we see them on real lenses (R3 below covers the rendering side). A naive char-count algorithm with hardcoded constants gets us a working read loop today; the constants are easy to tune in one PR after the first hardware run. The hard cap makes overflow impossible regardless of SDK behavior.

**Alternatives considered**:

- _Word-budget pagination by syllable count_ — overkill for v1 and mispriced given monochrome display.
- _Pre-paginated at build time_, baked into the bundle as `string[]` — saves runtime cost (~1 ms for 5k words; not worth a build step).
- _Soft hyphenation / smart breaks_ — explicitly deferred (spec Deferred Decisions section); break-anywhere is the chosen v1 policy.

**Hardware-revisit?** Yes — the _values_ of `CHARS_PER_LINE` and `LINES_PER_PAGE` are the highest-priority hardware-tunable in the project. The _algorithm_ is committed.

---

## R2 — Single press vs. double press distinguishability

**Question**: How does the SDK / OS debounce single vs. double press? Will the `CLICK_EVENT` and `DOUBLE_CLICK_EVENT` arrive cleanly distinguishable, or do we need our own debounce layer?

**Decision**:

- v1 trusts the SDK's native distinction: subscribe to `OsEventTypeList.CLICK_EVENT` for next-page and `OsEventTypeList.DOUBLE_CLICK_EVENT` for prev-page directly, no local debounce.
- Add dev-only timing instrumentation behind a `DEBUG_GESTURES` flag that logs every received event with `performance.now()` timestamps to `console.debug`. Off by default in production builds.
- Treat any stray "single-then-single" pattern at < 350 ms inter-press interval as a candidate for revision — captured as a hardware-validation observation.

**Rationale**: The SDK type definitions explicitly distinguish `CLICK_EVENT` and `DOUBLE_CLICK_EVENT`, which means the platform has already done the debounce work. Doubling that work in our app is a textbook double-debounce bug waiting to happen. The instrumentation gives us evidence to override this if the SDK's distinction proves unreliable.

**Alternatives considered**:

- _Local debounce on top of SDK events_ — risks dropping a legitimate fast double-tap. Rejected.
- _Single-press only; no double-press in v1_ — fails FR-003 (back-navigation). Rejected.
- _Double-press → single-press promotion after a timeout_ — premature complexity; ship the simple version, instrument, revisit.

**Hardware-revisit?** Yes — gesture distinguishability is a known unknown. Instrumentation lands in v1; gesture map revision (if needed) is a separate change.

---

## R3 — `textContainerUpgrade` flicker on real hardware

**Question**: The docs claim `textContainerUpgrade` is flicker-free vs. `rebuildPageContainer`'s "brief flicker". Is "flicker-free" actually flicker-free in peripheral vision over a 10-minute reading session?

**Decision**:

- v1 commits to `textContainerUpgrade` for all in-shape transitions:
  - Normal page → next page
  - Normal page → prev page
  - Normal page → clamp-flash → normal page (3 calls)
  - Normal final page → end-of-book frame
- `rebuildPageContainer` is **not used** in v1 because the layout never changes (one container, always present).
- Hardware validation in week 1 includes a 10-minute uninterrupted reading session with subjective notes: any flicker, any after-image, any reading fatigue attributable to the page-turn transition.

**Rationale**: Constitution Principle IV explicitly prefers `textContainerUpgrade` for in-shape changes. We have nothing in v1 that requires `rebuildPageContainer` (no container shape changes — the canvas is always one full-size text container). If real-hardware flicker proves intolerable, the mitigation is design-side (longer transitions, specific text-replacement strategy), not switching to `rebuildPageContainer` (which the docs say is _worse_).

**Alternatives considered**:

- _Use `rebuildPageContainer` to "reset" between page turns_ — the docs say it's worse for flicker, not better. Rejected.
- _Pre-blank the page (write empty content) then write the next page_ — two upgrades per turn doubles BLE round-trips and likely makes flicker _more_ visible. Rejected unless evidence forces revisiting.

**Hardware-revisit?** Yes — subjective flicker assessment is a scheduled observation, not a measured target.

---

## R4 — `setLocalStorage` size limits

**Question**: What's the per-key and per-app size cap on `bridge.setLocalStorage`?

**Decision**:

- Persist a single key `evenBooks.position.v1` whose value is a JSON string `{"book":"sample","page":N,"savedAt":<ms>}`. Worst-case size: ~64 bytes.
- We don't measure or test the actual cap because we're nowhere near it.
- If a future spec (002 import, 003 library) needs more storage, we revisit.

**Rationale**: SDK docs document `setLocalStorage` as a string-string KV store but don't pin the cap. The minimum plausible cap on any sane platform is several KB; our payload is 64 bytes. Engineering for an unknown cap when the actual usage is two orders of magnitude smaller is misallocated effort.

**Alternatives considered**:

- _Use IndexedDB inside the WebView for a richer schema_ — unnecessary for v1, adds dependency, and the persistence model is a phone-companion-app KV store anyway, not the WebView's own storage. Rejected for v1.
- _Batch multiple keys (book metadata, position, settings)_ — wait for 003 / settings spec.

**Hardware-revisit?** No — risk is bounded by the small payload size.

---

## R5 — Glasses-menu launch cold-start cost

**Question**: When the user opens evenBooks from the glasses' app menu (vs. the phone), is there extra cold-start latency through the SDK bridge initialization path?

**Decision**:

- Same code path for both launch sources. `onLaunchSource` callback fires once with either `'appMenu'` or `'glassesMenu'`; we route both to the same "open at saved position" handler.
- SC-001's 2-second launch budget is **provisional**. We instrument bootstrap timing in dev builds: `performance.mark()` at module load, at `waitForEvenAppBridge` resolve, at `createStartUpPageContainer` resolve, at first frame send.
- If glasses-menu launch is consistently > 2 s on real hardware, the budget moves; the architecture does not.

**Rationale**: There's no architectural difference between the two launch sources from the app's perspective — both result in the WebView opening with the bridge available. Any cold-start cost is platform-side and not something v1 can optimize. Visibility into the breakdown is the right v1 outcome.

**Alternatives considered**:

- _Two-phase boot_ (show a holding frame while loading the saved position) — premature optimization for an unmeasured cost; would also violate Principle V if the holding frame masks a real failure. Rejected.
- _Separate code paths for the two launch sources_ — would split testing surface for no architectural reason. Rejected.

**Hardware-revisit?** Yes — the _number_ (2 s) is provisional; the architecture is fixed.

---

## R6 — Persistence-corruption recovery (read-time)

**Question**: When the app launches and tries to read the saved page index, what happens if the value is missing, unparseable, references a different book, or is out of range?

**Decision** (consolidated recovery policy in `src/platform/persistence.ts`):

| Condition                                                                     | Behavior                                                                                                                                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key not present (true first-ever launch)                                      | Open at page 1. No surfaced indicator (this is the documented first-launch experience, not a failure).                                                        |
| Key present, JSON parses, `book === "sample"`, `page` is in `[0, totalPages)` | Open at `page`. Normal resume.                                                                                                                                |
| Key present, JSON does **not** parse                                          | Open at page 1. Surface a one-shot "could not restore previous position" notice on the phone-side UI for 5 s. Log to `console.warn` with the offending value. |
| Key present, parses, but `book !== "sample"` (future-proofing for spec 002)   | Open at page 1. Surface "no saved position for this book" on the phone UI for 5 s.                                                                            |
| Key present, parses, but `page` is out of range                               | Clamp to `[0, totalPages - 1]`. Surface "saved position out of range; resumed at page 1" on the phone UI for 5 s.                                             |

**Save-time corruption** (separate failure mode): if `setLocalStorage` rejects or throws on save, keep the in-memory page index, surface "could not save position; reading session continues" on the phone UI. Do not retry in a tight loop. (Constitution Principle V: surface, don't swallow.)

**Rationale**: Constitution Principle V demands either recovery-with-visibility or surfacing. For each of the failure modes above, the user-visible behavior is the same (start at page 1) but the _signal_ differs. The surfaced text appears only on the phone UI, never on the glasses (Principle I — glasses frames are reserved for the content; recovery messaging is a phone-side concern).

**Alternatives considered**:

- _Refuse to launch on parse failure_ — violates Principle V's "recovery" path; better to recover with notice. Rejected.
- _Silent fallback to page 1 with no notice_ — explicitly forbidden by Principle V. Rejected.
- _Retry queue for save failures_ — adds complexity for a failure mode we have no evidence of. Rejected for v1.

**Hardware-revisit?** No — this is a code-side decision and tested via unit tests on the persistence wrapper.

---

## R7 — Sample text selection

**Question**: Which public-domain short story is bundled as v1's sample text?

**Decision**: **"The Tell-Tale Heart"** by Edgar Allan Poe, ~2,200 words.

- Source: Project Gutenberg or Wikisource, plain-text release.
- Word count: ~2,230 words → at v1 pagination parameters (R1: ~280 chars/page) ≈ 45 paginated pages.
- License: public domain (Poe died 1849; well clear of any copyright term on any jurisdiction we operate in).
- Text characteristics:
  - Latin script, English (matches spec assumption #2).
  - Plain prose (no tables, no embedded poetry, no special formatting).
  - Several long sentences and a handful of unusually long words ("perceive", "sagacious", "hypocritical") — useful stress for pagination edge cases without being absurd.
  - Self-contained narrative — a tester reading from page 1 to end-of-book sees a complete story, not an arbitrary truncation.

**Rationale**:

- Matches the Q1 clarification answer (~2–5k words, ~30–50 paginated pages).
- Self-contained, dramatic, and engaging — useful for the SC-005 "first-time user" test where the tester must voluntarily read end-to-end.
- Sufficiently varied prose to expose pagination edge cases.
- Trivially in the public domain in every jurisdiction.

**Bundling**: the text is committed as `src/content/sample-text.ts` exporting:

```ts
export const SAMPLE_BOOK = {
  id: "sample",
  title: "The Tell-Tale Heart",
  author: "Edgar Allan Poe",
  text: "<full text as a single string>",
} as const;
```

Whitespace is normalised at build time (collapse multiple newlines to a single space; preserve paragraph breaks as `\n\n`). The pagination engine treats `\n\n` as a paragraph boundary that _prefers_ but does not force a page break.

**Alternatives considered**:

- _Aesop's Fables_ — too short, multiple disjoint stories. Rejected.
- _Lewis Carroll's "Jabberwocky"_ — too short (single poem, < 1 page). Rejected.
- _Pride and Prejudice_ (Austen, public domain) — far too long for the test loop. Rejected.
- _Sherlock Holmes — "A Scandal in Bohemia"_ — ~9,000 words, more pages than ideal. A reasonable second choice if Poe ages poorly with users.
- _A custom synthetic text generated for the project_ — loses the "real prose" signal; rejected.

**Hardware-revisit?** No — content choice is fixed for v1; can be replaced trivially in a follow-on if desired.

---

## Summary table

| ID  | Topic                    | Decision                                                                           | Hardware revisit?        |
| --- | ------------------------ | ---------------------------------------------------------------------------------- | ------------------------ |
| R1  | Pagination params        | 48 chars/line × 6 lines/page (provisional); naive char-count algorithm (committed) | Values yes, algorithm no |
| R2  | Press distinguishability | Trust SDK; instrument with `DEBUG_GESTURES` flag                                   | Yes                      |
| R3  | Page-turn flicker        | Use `textContainerUpgrade` exclusively; observe over 10-min hardware session       | Yes                      |
| R4  | Storage cap              | Persist tiny payload only; do not test the cap                                     | No                       |
| R5  | Cold-start cost          | Same code path both sources; instrument bootstrap; SC-001 budget provisional       | Yes                      |
| R6  | Read-time corruption     | Recover-to-page-1 + surface on phone UI per failure mode                           | No                       |
| R7  | Sample text              | "The Tell-Tale Heart" by Poe (~2.2k words / ~45 pages)                             | No                       |

All NEEDS CLARIFICATION items are resolved. Phase 1 design proceeds.
