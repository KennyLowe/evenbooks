# Feature Specification: evenBooks v1 — Read a Hardcoded Book

**Feature Branch**: `001-ebook-reader`
**Created**: 2026-04-30
**Last revised**: 2026-04-30 (slashed to MVP scope after architectural review)
**Status**: Draft
**Input**: User description: "Ebook reader for Even G2 smart glasses: a phone-side library of imported EPUB books, with the current page projected onto the glasses display one glance at a time. User advances pages with a single press on the temple touchpad and goes back with a double press. Reading position persists per book."

## Scope statement

This v1 is the **smallest possible loop that proves the platform mental model**. It ships a single hardcoded sample book and the gestures to read it. Import, library management, and resilience to extended disconnects are out of scope and will be specified in follow-on features (002-import, 003-library, 004-resilience) once we have hardware in hand and know what real reading on the G2 actually feels like.

The phone is authoritative for all state; the glasses are a derived viewport (per constitution Principle III).

## Clarifications

### Session 2026-04-30

- Q: How big is the sample text bundled with v1? → A: Short — ~2–5k words, roughly 30–50 paginated pages (e.g. a single public-domain short story).
- Q: When does the current page get persisted? → A: On every page change, written immediately (no debounce). Crash loss = zero pages.
- Q: How are the navigation-boundary frames treated? → A: Asymmetric — end-of-book replaces the page with a dedicated message frame ("End — press to exit"); first-page-clamp preserves the current page and briefly surfaces an inline indicator (~1 s) acknowledging the input.
- Q: What's on a normal reading frame on the glasses? → A: Body text only. No page chrome. Progress, if surfaced in v1, lives on the phone-side status UI.
- Q: What does the phone-side minimal UI show? → A: Connection state + currently-reading status (book title and "Page X of Y").

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Read a sample book on the glasses (Priority: P1)

A reader puts on their G2 glasses, opens evenBooks (from the phone or from the glasses' app menu), and the first page of a short pre-loaded sample text appears on the display. They walk around their home reading: a single press on the temple touchpad advances to the next page, a double press goes back. When they reach the end, an end-of-book indicator appears and a further press returns them to the menu. Swiping down on the touchpad exits at any time. The next time they open the app, they resume on the page they were last on.

**Why this priority**: This is the entire MVP. The point is to learn — what does reading on the glasses actually feel like? Is `textContainerUpgrade` page-turn flicker acceptable? Is double-press distinguishable from single-press in practice? What font size is comfortable at peripheral focus? None of these can be answered without a working read loop.

**Independent Test**: A tester (in the simulator first, then on real hardware) opens the app and reads the entire sample text from page 1 to the end using only the temple touchpad. They exit with a swipe-down, reopen, and confirm they resume on the correct page. This is the only test the MVP needs to pass.

**Acceptance Scenarios**:

1. **Given** the app is launched (from either the phone app menu or the glasses app menu), **When** initialization completes, **Then** the most-recently-read page (or page 1 on first ever launch) appears on the glasses display within 2 seconds of launch.
2. **Given** the user is reading a page, **When** they single-press the temple touchpad, **Then** the next page appears.
3. **Given** the user is reading a page, **When** they double-press the temple touchpad, **Then** the previous page appears.
4. **Given** the user is on page 1, **When** they double-press the touchpad, **Then** the page text remains visible, a brief inline indicator acknowledges the input for ~1 second, then the page reverts to its plain rendering.
5. **Given** the user is on the final page, **When** they single-press the touchpad, **Then** the page is replaced by a dedicated end-of-book frame; a further single-press from that frame exits the reader and returns to the glasses' app menu.
6. **Given** the user is reading, **When** they swipe down on the touchpad, **Then** the reader exits cleanly and the glasses' app menu returns.
7. **Given** the user has read up to page N and exited (by swipe-down, end-of-book exit, or app close), **When** they reopen the app later, **Then** the glasses display page N.

### Edge Cases

- **App opened with glasses disconnected**: phone-side WebView shows a clear "glasses not connected" indicator. The app does not crash and does not silently advance. When the glasses reconnect, the saved page renders.
- **Sample book has only one page**: `next` from the only page behaves like end-of-book; `previous` behaves like first-page clamp.
- **Word longer than one display line**: pagination breaks anywhere within the word (decided 2026-04-30; spec assumption #5).
- **Touchpad event fires during page render**: input is queued; the in-flight render completes, then the queued input applies. No dropped or duplicated events.
- **App crashes or is force-killed mid-page**: on next launch, the page the user was on at the time of crash restores. (Persistence is written immediately on every page change, so crash loss is zero pages.)

## Requirements _(mandatory)_

Functional requirements describe **what** the user can do. Numbers (latencies, percentages, durations) live in Success Criteria, not here.

### Functional Requirements

- **FR-001**: System MUST render the current page on the glasses as body text only — no page numbers, progress indicators, or other chrome — consumable in a single glance, on every launch and on every page change.
- **FR-002**: System MUST advance to the next page when the user performs a single press on a temple touchpad, with the in-flight page change feeling instant to the user.
- **FR-003**: System MUST return to the previous page when the user performs a double press on a temple touchpad.
- **FR-004**: System MUST handle navigation boundaries asymmetrically:
  - At the first page, a "previous" input MUST keep the current page rendered, briefly surface an inline indicator (~1 second) acknowledging the input was received, then revert to the plain page.
  - Past the final page, a "next" input MUST replace the page with a dedicated end-of-book frame ("End — press to exit" or equivalent monochrome-native treatment); a further single-press from that frame MUST exit the reader.
- **FR-005**: System MUST exit the reader and return to the glasses' app menu when the user swipes down on a temple touchpad.
- **FR-006**: System MUST persist the user's current page on every page change, written immediately, and MUST restore to the persisted page on the next launch (regardless of whether the prior exit was graceful or a crash).
- **FR-007**: System MUST handle launch from either source (the Even Realities phone app menu or the glasses app menu) identically: open to the most-recently-read page.
- **FR-008**: The phone-side UI MUST display, at minimum: (a) ground-truth connection state (one of "connected", "connecting", or "not connected"), (b) the title of the currently-loaded book, and (c) the current reading position as "Page X of Y". The phone-side UI MUST NOT pretend the glasses are showing content when they are not connected.
- **FR-009**: The reader MUST function fully offline; no network access is required to launch or read.

### Key Entities

- **Sample text**: a single hardcoded book bundled with the app — a public-domain short story of approximately 2,000–5,000 words, yielding roughly 30–50 paginated pages on the v1 layout. Long enough to exercise multi-page navigation and end-of-book handling; short enough that a tester can traverse it page-by-page in a single test session. Treated as immutable v1 content.
- **Reading position**: the index of the current page within the sample text. Authoritative on the phone; persisted across exits.

## Success Criteria _(mandatory)_

These are how we'll know the MVP works. Numbers in this section are **provisional v1 targets** that will be revised after the first hardware-validation pass (per the constitution's "What we don't yet know" section).

- **SC-001**: A user can read the sample text end-to-end using only the temple touchpad, without consulting documentation, without manual reload, and without the reader losing its place.
- **SC-002**: A page change feels instant — the user does not perceive a delay between their press and the new page being readable. (Provisional measurable proxy: ≤500 ms in the simulator; revisit on hardware.)
- **SC-003**: After exiting and reopening the app, the user resumes on the same page they were last on, in 100 % of attempts under normal operation. On detected save failure (storage full, etc.), the system surfaces the failure rather than silently regressing the position.
- **SC-004**: The reader runs for a continuous 30-minute session in the simulator without crash, lost input, or position drift.
- **SC-005**: A first-time user, given only "open evenBooks and read", can complete the read loop (advance, retreat, exit, reopen, resume) without external help.

## Assumptions

These were chosen as defaults during drafting; revisit if they bite.

1. **Hardcoded content.** v1 ships with one bundled sample text — a public-domain short story of ~2–5k words producing ~30–50 paginated pages. No import, no library, no external content. (Story 2 in the original draft is deferred to spec 002.)
2. **Single language.** Sample text is English (Latin script, left-to-right). Other scripts are out of scope and untested.
3. **Naive pagination.** Pages are computed by character / line count against a fixed display area at app build time (or first launch, cached thereafter). No font-size customization, no reflow on rotation, no live re-pagination. Iteration on the pagination algorithm waits on hardware feedback.
4. **No auto-advance.** Pages only change on explicit user input. (Constitution principle I.)
5. **Long-word handling.** Words longer than one display line break at any character boundary (no hyphenation, no overflow). Decided 2026-04-30.
6. **Single user, single session.** No profiles, no multi-instance, no concurrent reading sessions across devices.
7. **Phone is authoritative.** All state lives on the phone. The glasses display is rebuilt from phone state on every reconnect or page change. (Constitution principle III.)
8. **Provisional timing targets.** Latency / responsiveness targets in Success Criteria are simulator-tested guesses; they will be revisited and tightened after the first hardware run.

## Dependencies

- The Even Realities companion app and Even Hub platform must be installed and authenticated on the user's phone.
- The G2 glasses must be paired with the phone and powered on for any glasses-side rendering.
- No third-party services or network resources are required.

## Risks & Unknowns

These do not block specification but must be acknowledged before the plan locks in numbers.

- **R1: Pagination quality on real hardware.** Naive char-count pagination may produce poor breaks (orphan words, unbalanced pages). Mitigation: ship the naive version, capture screenshots of suboptimal pages on real hardware in week 1, iterate.
- **R2: Single-press vs double-press distinguishability.** The OS debounce window is unknown. If users frequently get a double-press recognized as two single-presses (or vice versa), the gesture map is wrong. Mitigation: instrument both event paths with a dev-only timing log; revisit gesture map after the first hardware session.
- **R3: `textContainerUpgrade` flicker on page turn.** The docs say it's flicker-free, but "flicker-free" is observer-subjective. Mitigation: hardware-validation pass must include subjective comfort assessment over a 10-minute reading session.
- **R4: Persistence storage size limits.** `setLocalStorage` is documented as a key-value store; we don't know the per-key or per-app size cap. Mitigation: persist only the integer page index, not the rendered page content.
- **R5: Glasses-menu launch timing.** It's unknown how quickly the WebView starts when launched from the glasses (vs. the phone) and whether the SDK bridge initialization has any cold-start cost on that path. Mitigation: SC-001's 2-second budget is provisional; if glasses-menu launch is slow, this number moves.

## Deferred Product Decisions (resolved, will apply when their feature lands)

These decisions were made during MVP drafting but are not exercised in v1. They're recorded here so the follow-on specs don't re-litigate them.

- **Image rendering inside book content** (relevant to Story 2 / spec 002): images are skipped silently. The reader is text-only by intent.
- **DRM-protected content** (relevant to Story 2 / spec 002): on detected DRM, import is refused with a clear non-technical message explaining why.
- **Long-word handling at import** (relevant to Story 2 / spec 002): break-anywhere — same policy as for the bundled sample text.
- **Pagination algorithm sophistication**: ship the naive char-count version; iterate based on real-hardware feedback rather than designing in advance.

## Out of Scope (v1)

The following were originally in the v1 spec and are explicitly deferred. They're listed so the scope contract is unambiguous and so the follow-on specs have a starting list.

- Importing books from phone storage (→ spec 002)
- Library of multiple books, sorting, deletion (→ spec 003)
- Cross-disconnect resume beyond crash-resistant local persistence (→ spec 004)
- Cloud sync, OPDS feeds, public-domain catalogs, store integrations
- PDF, MOBI, AZW3, audiobook support
- Highlights, bookmarks, notes, annotations
- Search within a book or library
- CJK and RTL script support
- Multi-user profiles
- TTS / audio output
- Reading stats, gamification, streaks
- Configurable font size, line spacing, margins
- Image rendering inside book pages
- Phone-side library UI design beyond the FR-008 minimal status (connection state + book title + "Page X of Y"). No book selection, settings, or browsing surface in v1.
