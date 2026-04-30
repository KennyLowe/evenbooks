# Implementation Plan: evenBooks v1 — Read a Hardcoded Book

**Branch**: `001-ebook-reader` | **Date**: 2026-04-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-ebook-reader/spec.md`
**Constitution**: [v3.0.0](../../.specify/memory/constitution.md)

## Summary

The smallest possible loop on Even G2: a Vite + TypeScript Even Hub plugin that ships a single hardcoded public-domain short story, paginates it naively at runtime to fit the 576×288 display, and renders one page at a time into a single text container on the glasses. Single press advances; double press retreats; swipe down exits; first-page and end-of-book are handled with the asymmetric boundary frames decided in clarification. Page index is persisted on every change via `bridge.setLocalStorage`. The phone-side WebView shows ground-truth connection state, the book title, and "Page X of Y" — nothing else. No network, no sensors beyond touchpad input, no other books.

The technical approach commits to: `textContainerUpgrade` for in-shape page transitions (per Constitution Principle IV), a single text container with `isEventCapture: 1` (per SDK invariants), idempotent rebuilds from phone-authoritative state on every reconnect (per Constitution Principle III), and Vitest for pure-logic unit tests on the pagination engine (the only non-trivial pure logic in v1).

## Technical Context

**Language/Version**: TypeScript 5.7 with `strict: true`. Target: ES2022 (matches Vite default for the WebView host).
**Primary Dependencies**:
- `@evenrealities/even_hub_sdk` ^0.0.10 — Even Hub SDK (`waitForEvenAppBridge`, `EvenAppBridge`, container types, event types, enums).
- `@evenrealities/evenhub-cli` ^0.1.12 (dev) — `evenhub pack` / `evenhub validate` / `evenhub qr`.
- `@evenrealities/evenhub-simulator` ^0.7.2 (dev) — desktop simulator.
- `vite` ^5.4 (dev) — bundler / dev server.
- `vitest` ^2.x (dev) — pure-logic unit tests for pagination.

No EPUB parser. No state library. No UI framework. The bundled sample text is a `.ts` file exporting a string constant, embedded at build time.

**Storage**: Companion-app key-value store via `bridge.setLocalStorage` / `bridge.getLocalStorage`. Single key `"evenBooks.position.v1"`, value is a JSON string `{"book":"sample","page":N,"savedAt":<ms>}`. See `contracts/persistence.md`.
**Testing**:
- Pure-logic unit tests via Vitest for `pagination.ts` and `reader.ts` (Constitution Principle VI; encouraged for solo).
- Manual integration runs against `evenhub-simulator` for the read loop (mandatory per Principle VI).
- Headless simulator test for the read loop is *encouraged* but not blocking for solo v1; if added, lives in `tests/integration/`.
**Target Platform**: Even Hub plugin (web app inside the Even Realities companion app's WebView, on iOS / Android phones), driving an Even G2 display over BLE 5.2. `min_sdk_version: "0.0.10"`, `min_app_version: "2.0.0"` per the official `minimal` template.
**Project Type**: Single-project Even Hub plugin. Scaffold copied from `official/evenhub-templates/minimal`.
**Performance Goals** (provisional, simulator-tested; revisit on hardware per spec Risks):
- Page change feels instant — provisional ≤500 ms in simulator.
- Launch to first rendered page within 2 s.
- 30-minute continuous session without crash, lost input, or position drift.
**Constraints**:
- 576 × 288 px, 4-bit greyscale, monochrome-native design (Constitution Principle I).
- Exactly one text container per page with `isEventCapture: 1` (SDK invariant).
- `textContainerUpgrade` payload ≤ 2000 chars; `TextContainerProperty.content` ≤ 1000 chars on creation.
- Phone is authoritative; glasses display is rebuilt from phone state on reconnect (Constitution Principle III).
- Fully offline at runtime — no network calls.
- All errors either recover with a user-visible recovery or surface as a discreet status (Constitution Principle V).
**Scale/Scope**: One book of ~2,000–5,000 words, ~30–50 paginated pages. Single user, single device. One reading session at a time.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

Constitution v3.0.0 has one **NON-NEGOTIABLE** principle (I) and five soft principles (II–VI). Each is evaluated against this plan:

| Principle | Verdict | Evidence in plan |
|---|---|---|
| **I. Every Frame Is Glanceable (NN)** | ✅ Pass | Each rendered page is one glanceable frame. No within-frame scrolling. Multi-page is user-paced (single press / double press); auto-advance is forbidden by spec FR-002/003. End-of-book and clamp frames are designed monochrome-native (text-only on a 4-bit canvas). Body text is the top-left primary information; no chrome competes (FR-001). |
| **II. Data Minimalism** | ✅ Pass | No microphone, no IMU, no network. The only persisted datum is an integer page index plus a book identifier; total payload < 100 bytes. No sensors beyond the touchpad. |
| **III. Phone Is the Brain, Glasses Are the Lens** | ✅ Pass | All state (current page, paginated content, connection state) lives in the phone-side WebView. Glasses display is rebuilt from phone state on every page change and on reconnect (Phase 1 design: `frames.ts` is a pure function from `(book, pageIndex)` to a `textContainerUpgrade` payload). Idempotent: re-issuing the same upgrade is a no-op. Reconnect handler issues a full re-render of the current page. |
| **IV. Battery and Bandwidth Are Sacred** | ✅ Pass | Page changes use `textContainerUpgrade` (in-shape, flicker-free per docs) rather than `rebuildPageContainer`. Only one container in the entire app; layout never changes. No coalescing needed (page changes are bounded by human input speed). All event subscriptions tracked in a teardown registry; unsubscribed on `FOREGROUND_EXIT_EVENT` and on swipe-down exit. No `imuControl` or `audioControl` calls. |
| **V. Crash Without Lying** | ✅ Pass | FR-008 surfaces ground-truth connection state on the phone. Persistence-corruption recovery (Phase 0 R6 below): on read, if the stored value is missing or unparseable, default to page 1 AND surface a one-time "could not restore previous position" indicator on the phone-side UI. Save failure: caught, page index kept in-memory, surfaced via the same channel. Logging-and-swallowing is forbidden by the catch-block convention defined in Phase 1 `platform/errors.ts`. |
| **VI. Simulator-First, Hardware-Verified** | ✅ Pass (with documented hardware-only items) | Simulator is the primary dev loop. User Story 1's Independent Test runs in simulator first. Pure-logic tests via Vitest cover pagination. Hardware-only items (R1–R5 from spec) are explicitly tagged in Phase 0 research and will be re-evaluated after the first hardware session — no provisional numbers in the SC are treated as commitments. |

**SDK invariants** (from constitution Hardware & SDK Invariants section): all respected.
- One container, ≤12 total: ✅ (1 text container).
- Exactly one `isEventCapture: 1`: ✅.
- `createStartUpPageContainer` called once: ✅ (in `bootstrap()` in `main.ts`).
- `textContainerUpgrade` payload ≤ 2000 chars: ✅ (single G2 page is ≤ ~600 chars by canvas math; well under the limit — see research R1).
- Long press not bound: ✅ (we listen for CLICK_EVENT, DOUBLE_CLICK_EVENT, SCROLL_BOTTOM_EVENT only).

**Result**: Gate **PASSES**. No Complexity Tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/001-ebook-reader/
├── spec.md                  # Feature specification (already complete)
├── plan.md                  # This file
├── research.md              # Phase 0 output — resolves R1–R6 unknowns
├── data-model.md            # Phase 1 output — Book, Page, ReadingPosition
├── quickstart.md            # Phase 1 output — how to clone, run, test
├── contracts/
│   ├── persistence.md       # Storage key, value shape, versioning
│   ├── frames.md            # Glasses frame composition rules
│   └── phone-ui.md          # Phone-side WebView surface contract
├── checklists/
│   └── requirements.md      # Spec quality checklist (already complete)
└── tasks.md                 # Phase 2 output — generated by /speckit-tasks (NOT created here)
```

### Source code (project root: `C:\git\even\evenBooks`)

```text
evenBooks/
├── app.json                          # Even Hub manifest (package_id, version, permissions=[], min_sdk_version, supported_languages=["en"])
├── package.json                      # vite, typescript, even_hub_sdk, evenhub-cli, evenhub-simulator, vitest
├── tsconfig.json                     # strict: true, target ES2022
├── vite.config.ts                    # default Vite config (no plugins needed for v1)
├── vitest.config.ts                  # vitest config (jsdom not needed; pure unit tests only)
├── index.html                        # WebView entry — hosts the phone-side status surface
├── src/
│   ├── main.ts                       # Bootstrap: waitForEvenAppBridge → onLaunchSource → load saved position → createStartUpPageContainer → register event handler → render initial frame
│   ├── reader/
│   │   ├── reader.ts                 # State machine: { bookId, currentPage, totalPages, mode: 'reading' | 'end-of-book' | 'clamp-flash' }; reducer-style transitions
│   │   ├── pagination.ts             # Naive char-count pagination — pure function (text, charsPerPage) → string[]
│   │   └── frames.ts                 # Pure functions: pageFrame(text), endOfBookFrame(), clampIndicatorFrame(text) — return TextContainerUpgrade payloads
│   ├── content/
│   │   └── sample-text.ts            # Bundled public-domain short story (Phase 0 R7 picks the work) as a const string
│   ├── platform/
│   │   ├── bridge.ts                 # Wraps waitForEvenAppBridge + tracks teardown handles
│   │   ├── events.ts                 # Maps onEvenHubEvent → semantic events (NEXT_PAGE, PREV_PAGE, EXIT)
│   │   ├── connection.ts             # onDeviceStatusChanged → connection state observable for the phone UI
│   │   ├── persistence.ts            # setLocalStorage / getLocalStorage wrapper with read-recovery (R6) and save-failure surfacing
│   │   └── errors.ts                 # Error convention: { recover(): T | surface(message) }; forbids silent catches
│   └── ui/
│       └── phone-status.ts           # Renders the FR-008 phone-side surface into index.html
└── tests/
    └── unit/
        ├── pagination.test.ts        # Naive char-count pagination edge cases (long words, empty input, 1-page text, exact-fit)
        └── reader.test.ts            # State transitions: next/prev/clamp/end-of-book/exit
```

**Structure Decision**: Single Vite + TS project, scaffolded by copying `official/evenhub-templates/minimal/` into `evenBooks/` and extending. No `frontend/` + `backend/` split — there is no backend; the phone-side WebView is the entire app. No `tests/integration/` directory in v1 because headless simulator tests are encouraged but not mandated for solo (Constitution Principle VI). If we add them post-hardware, they slot in cleanly as `tests/integration/`.

## Complexity Tracking

> Empty. The Constitution Check passes without violations and there is no Complexity Tracking entry to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_ | — | — |

## Phase 0 — Research

See `research.md` for the full research log. Items resolved:

- **R1** Naive pagination concrete parameters (chars per line, lines per page, target chars per page) — provisional values committed; revisit after first hardware run.
- **R2** Single vs double-press distinguishability — instrumentation plan committed; gesture map locked for v1, instrumented for revision.
- **R3** `textContainerUpgrade` flicker on real hardware — observation plan committed; subjective comfort assessment scheduled for the first 10-minute hardware reading session.
- **R4** `setLocalStorage` size cap — committed to persisting only the integer page index + book ID + ms timestamp; fits well under any plausible cap.
- **R5** Glasses-menu launch cold-start cost — observation plan; SC-001's 2 s budget marked provisional and re-evaluated post-hardware.
- **R6** Persistence-corruption recovery (lifted from clarification's Outstanding column) — recover-to-page-1 + surface "could not restore previous position" on the phone-side UI.
- **R7** Sample text selection — public-domain short story; final pick is a research output (committed to a specific work in `research.md`).

## Phase 1 — Design & Contracts

See:
- `data-model.md` — entity definitions for Book, Page, ReadingPosition, plus the in-memory ReaderState reducer model.
- `contracts/persistence.md` — storage key, value JSON shape, versioning, recovery behavior.
- `contracts/frames.md` — glasses frame composition: `TextContainerProperty` for startup, `TextContainerUpgrade` payload shapes for normal page / end-of-book / clamp-flash.
- `contracts/phone-ui.md` — phone-side WebView surface (HTML structure + state-to-text mapping).
- `quickstart.md` — clone, install, dev loop, simulator run, test commands.

**Agent context update**: `CLAUDE.md` updated to point at this plan file.

**Constitution re-check after design**: Pass. The design adds no new SDK calls beyond those evaluated in the gate. The single text container, idempotent reconnect rebuild, immediate persistence on every page change, and pure-function frame composers all reinforce Principles I–VI rather than stretching them.
