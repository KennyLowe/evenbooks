# Feature Specification: evenBooks v2 — Import Your Own Books

**Feature Branch**: `002-book-import`
**Created**: 2026-04-30
**Status**: Draft
**Input**: User description: "Import EPUB and plain-text books from phone storage into the user's evenBooks library. The user, on the phone, taps 'Add book', picks a file from their device storage, and after a brief processing step the book appears in their library ready to read on the glasses (using the existing v1 read loop). EPUB metadata (title and author) is extracted when present; plain-text files use the filename as title. DRM-protected EPUBs are detected and refused with a clear non-technical message explaining why. Embedded images in EPUBs are skipped silently — the reader is text-only. Words longer than one display line break at any character boundary. Pagination is naive char-count, computed at import time, cached per book. The library is a single ordered list (no nesting / no collections in v1 of import); subsequent specs (003-library) will handle multi-book sorting and management. Carries forward all v1 constitution gates (phone-authoritative, single-text-container, glanceable frames, etc.)."

## Scope statement

This v2 turns evenBooks from a single-book demo into a real ebook reader: the user can add EPUB and plain-text books from their phone storage, see them in a simple library, pick one, and read it on the glasses using the v1 read loop unchanged.

What's explicitly **in** v2 of import:

- An "Add book" affordance on the phone-side UI.
- An import pipeline that ingests EPUB and plain-text files, extracts title/author when available, and produces a paginated `Book` ready for the existing reader.
- A simple ordered library list on the phone showing both the bundled sample text and any imported books.
- Refusal paths for DRM-protected EPUBs, unsupported file types, and corrupt files — each with a clear non-technical user-visible message.

What's explicitly **out** of v2:

- Library management beyond the initial list — sorting controls, deletion, search, tags, collections — defer to `003-library`.
- Cloud sync, OPDS, online catalogs.
- PDF, MOBI, AZW3, audiobook formats.
- CJK and RTL script support.
- Live re-pagination, font-size or line-spacing controls.
- Image rendering inside book content (text-only by intent, decided in v1).

The phone remains authoritative for all state; the glasses are a derived viewport (constitution Principle III).

## Clarifications

### Session 2026-04-30

- Q: How does the v1 reading position migrate on first v2 launch? → A: Migrate the v1 page index onto the bundled sample's per-book entry, then delete the v1 key. Returning v1 users resume on the sample at their saved page on first v2 launch.
- Q: How do import refusal messages (DRM, malformed, unsupported, oversize, encoding, empty) surface to the user? → A: Persistent inline error in a dedicated slot near the "Add book" button, dismissed on the user's next interaction (tap Add book, tap a library entry, or explicit close). Distinct from the v1 transient notice channel, which stays for ephemeral status (save-failed, recovery messages).
- Q: How does the import progress indicator look? → A: Non-blocking inline "Importing '<filename>'…" with an indeterminate spinner, in the same import-flow area as the import error slot (Q2). No percentage, no stages. User can keep scrolling the library while the import runs.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Import an EPUB and read it (Priority: P1)

A user has a DRM-free EPUB on their phone (an email attachment, a file transfer, a public-domain download from Project Gutenberg, etc.). They open evenBooks on the phone, tap "Add book", pick the EPUB from the system file picker, and after a short processing step ("Importing…") the book appears in the library list with its title and author. They tap the new entry, the glasses display the first page, and the v1 read loop takes over (single press → next page, double press → previous, swipe down → exit).

**Why this priority**: This is the entire value proposition of v2 — letting users read their own content. Plain-text import (Story 2) and refusal paths (Story 3) round it out, but if Story 1 doesn't work, v2 doesn't matter.

**Independent Test**: With a known-good DRM-free EPUB on phone storage (Project Gutenberg's plain-EPUB release of any public-domain title is the canonical test fixture), a tester opens evenBooks, imports the file, sees it in the library with correct title and author, opens it, and reads the first ~5 pages using the temple touchpad.

**Acceptance Scenarios**:

1. **Given** the user is on the phone-side library view, **When** they tap "Add book" and select a valid DRM-free EPUB, **Then** a non-blocking inline indicator showing "Importing '<filename>'…" with an indeterminate spinner appears in the import-flow area; the rest of the library remains scrollable.
2. **Given** the import is in progress, **When** the import succeeds, **Then** the book appears in the library list with its title and author extracted from the EPUB metadata, and the import progress indicator clears.
3. **Given** the EPUB has no metadata or partial metadata, **When** the import succeeds, **Then** the book appears in the library with the filename as the title and "Unknown" as the author for any field that couldn't be extracted.
4. **Given** the user taps an imported book in the library, **When** the reader opens, **Then** page 1 of that book renders on the glasses display within the same launch budget that applies to the bundled sample (provisional ≤ 2 s in the simulator).
5. **Given** the user is reading an imported book, **When** they single-press, double-press, or swipe down on the temple touchpad, **Then** the v1 read loop applies unchanged: advance, retreat, and exit work identically to the bundled sample.
6. **Given** the user has read up to page N of an imported book and exits, **When** they reopen the same book later, **Then** they resume on page N (per-book reading position is persisted, just as for the sample).

---

### User Story 2 — Import a plain-text book (Priority: P2)

A user has a `.txt` file on their phone (a personal manuscript, notes, a public-domain text without an EPUB build). They tap "Add book", pick the text file, and the book appears in the library using the filename as its title.

**Why this priority**: Smaller variant of Story 1 with a simpler import path (no XML/ZIP unpacking, no metadata extraction). Independent because it has its own acceptance criteria and can ship without EPUB import (though they'll typically ship together).

**Independent Test**: A tester selects a known-good UTF-8 `.txt` file. The book appears in the library with the filename (minus extension) as the title and "Unknown" as the author. Reading on the glasses works the same as for an EPUB.

**Acceptance Scenarios**:

1. **Given** the user picks a UTF-8 plain-text file, **When** the import completes, **Then** the book appears with the filename (minus the `.txt` extension) as the title and "Unknown" as the author.
2. **Given** the user picks a plain-text file with a Byte-Order Mark (BOM), **When** the import completes, **Then** the BOM is stripped and the body text displays cleanly.
3. **Given** the user picks a plain-text file with non-UTF-8 encoding, **When** the import is attempted, **Then** the import fails with a clear non-technical message ("Unsupported text encoding — please save the file as UTF-8") and the library is unchanged.
4. **Given** the imported plain-text book is opened, **When** the reader runs, **Then** the same v1 read loop and pagination behavior apply.

---

### User Story 3 — Refuse DRM-protected and corrupt imports cleanly (Priority: P3)

A user accidentally tries to import a DRM-protected EPUB (e.g. one purchased from a major retailer) or a corrupt / non-ebook file. The import fails with a clear, non-technical message. The library is unchanged. The user understands why it didn't work.

**Why this priority**: Real-world failure mode. Without it, users hit cryptic errors and lose trust. P3 because the happy path (Stories 1 and 2) is independently demonstrable, but shipping without a graceful refusal path is a poor experience.

**Independent Test**: A tester attempts to import (a) a DRM-protected `.epub`, (b) a corrupt EPUB (truncated mid-file), (c) a non-ebook file with a `.epub` extension (e.g. a PDF renamed). Each should fail with a distinct non-technical message; the library should remain unchanged in all three cases.

**Acceptance Scenarios**:

1. **Given** the user picks a DRM-protected EPUB, **When** the import is attempted, **Then** it fails with a non-technical message that names DRM as the cause and points to the supported alternative (DRM-free EPUB or plain text), and the library is unchanged.
2. **Given** the user picks a corrupt or malformed EPUB, **When** the import is attempted, **Then** it fails with a "couldn't read this file" message and the library is unchanged.
3. **Given** the user picks a file whose extension is `.epub` but whose contents are not an EPUB, **When** the import is attempted, **Then** it fails with the same "couldn't read this file" message.
4. **Given** the user picks a file with an unsupported extension (`.pdf`, `.mobi`, `.azw3`, `.docx`, etc.), **When** the import is attempted, **Then** it fails with a message that names the supported formats (DRM-free EPUB and plain-text `.txt`), and the library is unchanged.
5. **Given** any failed import, **When** the user dismisses the message, **Then** they return to the library view with no residual state from the failed attempt.

---

### Edge Cases

- **Cancel from file picker**: user opens the picker and cancels — the library is unchanged; no error message; no import progress indicator left behind.
- **Empty file**: a 0-byte file or a file that paginates to zero pages — refused with an "empty content" message.
- **Massive file**: a file larger than the v2 size cap — refused with an oversize message that names the cap.
- **Duplicate import**: importing a file with the same content as an existing library entry — the existing entry is bumped to most-recently-added position; user sees a confirmation that the existing copy will be used; no duplicate entry is created.
- **EPUB with multiple authors**: all authors are joined with `, ` (e.g. "Strunk, White") in the author field. Display-truncated if it doesn't fit the phone-side typography budget.
- **EPUB with only an empty body**: same outcome as an empty file — refused.
- **EPUB with very long title**: stored verbatim; phone-side UI truncates with an ellipsis at display time.
- **App backgrounded mid-import**: import continues until completion or surfaces a failure on next foreground; the library never enters an inconsistent partial state.
- **Glasses disconnected during import**: import is independent of glasses connectivity; completes regardless. Reading the imported book later requires connection per usual.
- **Storage full during import save**: import fails with a non-technical "couldn't save" message that mentions free space. The library is unchanged.

## Requirements *(mandatory)*

Functional requirements describe **what** the user can do. Numbers (latencies, sizes, percentages) live in Success Criteria, not here.

### Functional Requirements

#### Library and import affordance

- **FR-001**: The phone-side UI MUST present a library view listing all books available to read, including the bundled sample text and any successfully imported books.
- **FR-002**: The library view MUST present an "Add book" affordance that, when activated, opens the operating system's file picker scoped to the user's accessible storage.
- **FR-003**: Each library entry MUST display its title and author. When the user taps an entry, the reader opens that book on the glasses using the v1 read loop unchanged.
- **FR-004**: Library entries MUST be ordered with the most-recently-added or most-recently-opened book first; the bundled sample text MUST appear in this same order alongside imported books.

#### Import pipeline

- **FR-005**: System MUST accept files with a `.epub` extension and parse them as standard DRM-free EPUB packages.
- **FR-006**: System MUST accept files with a `.txt` extension and treat them as plain-text books.
- **FR-007**: System MUST extract title and author from EPUB metadata when present; for missing fields the filename (minus extension) MUST serve as the title and the author MUST default to "Unknown".
- **FR-008**: System MUST detect DRM-protected EPUBs at import time and refuse them with a clear non-technical message that names the cause (DRM) and the supported alternative (DRM-free EPUB or plain text).
- **FR-009**: System MUST silently skip embedded images, illustrations, and any non-text content within EPUBs. The reader is text-only by intent.
- **FR-010**: System MUST paginate the imported text using the same naive char-count rules as the bundled sample (one shared pagination engine; not a fork).
- **FR-011**: System MUST hard-break words longer than the display line at any character boundary (carries forward v1 spec assumption).
- **FR-012**: System MUST persist the imported book (title, author, full text, paginated pages, and per-book reading position) so it survives app close, app background, glasses disconnect, and phone restart.
- **FR-013**: System MUST tolerate the user backgrounding the app mid-import without leaving the library in an inconsistent partial state.
- **FR-013a**: While an import is running, the phone-side UI MUST display a non-blocking import progress indicator showing "Importing '<filename>'…" with an indeterminate spinner, located in the same import-flow area as the import error slot. The library list MUST remain scrollable and library entries MUST remain tappable during import.

#### Failure surfacing

- **FR-014**: For every failed import, the user MUST see a non-technical message that names the cause in plain language, displayed in the import error slot near the "Add book" affordance. The message MUST persist until the user's next interaction (tapping "Add book" again, tapping a library entry, or an explicit close action), distinct from the v1 transient notice channel which is reserved for ephemeral status (save failures, recovery notices). Failures MUST NOT leave the library, the import progress indicator, or the file picker in a partial or undefined state.
- **FR-015**: System MUST distinguish at minimum these refusal categories with distinct messages: DRM-protected, malformed/corrupt, unsupported format, oversized file, unsupported text encoding, and empty content.
- **FR-016**: Duplicate imports (a file whose content matches an existing library entry) MUST NOT create a second entry; the existing entry MUST be bumped to the most-recently-added position and the user MUST see a non-technical confirmation that the existing copy will be used.

#### Reading & launch source (carries forward from v1)

- **FR-017**: Once imported, a book MUST behave identically to the bundled sample under the v1 read loop: gestures, pagination, persistence, boundary-frame treatments, and frame composition all unchanged.
- **FR-018**: When the app is launched from the phone app menu, the library view MUST appear (no auto-open of any book).
- **FR-019**: When the app is launched from the glasses' app menu, the most-recently-opened book MUST resume at its persisted page; if no book has ever been opened, the bundled sample MUST open at page 1.
- **FR-020**: The reader MUST function fully offline; no network access is required to import (from local storage), open, or read a book.

#### Migration from v1

- **FR-021**: On first launch of v2 on a phone that has v1's `evenBooks.position.v1` key populated, the system MUST migrate the saved page index onto the bundled sample text's per-book entry in the v2 library schema, then delete the v1 key. After migration, the returning v1 user MUST resume on the sample at the page they last saved under v1, with no perceptible regression from v1's resume behavior.

### Key Entities

- **Book**: a unit of reading material — bundled sample or imported. Attributes: identity (a stable opaque id), title, author, source format (`bundled` / `epub` / `text`), full text content (post-extraction), paginated pages (computed once at import), per-book reading position, date added, date last opened.
- **Library**: the ordered collection of books available to the user. Attributes: ordered list of book references, sort order (most-recent-action first by default in v2 of import).
- **Reading Position**: per-book current page index. Authoritative on the phone; persisted across exits. Same shape as v1's reading position, scoped per book.
- **Import Outcome**: per import attempt, either a successful Book or a typed Failure (`drm-protected` / `malformed` / `unsupported-format` / `oversize` / `unsupported-encoding` / `empty` / `storage-full`).

## Success Criteria *(mandatory)*

Numbers below are provisional v2-of-import targets, validated in the simulator and revisited after the first hardware-validation pass per the constitution's "What we don't yet know" section.

- **SC-001**: A user can complete a happy-path EPUB import — from "Add book" tap to the book appearing in the library — in under 30 seconds for a 5 MB DRM-free EPUB on a mid-range phone.
- **SC-002**: A user resuming an imported book sees its saved page on the glasses within 3 seconds of tapping the entry in the library (matches v1's resume budget).
- **SC-003**: A first-time user, given only "open evenBooks and import a book to read", can import a known-good EPUB and read 5 pages without consulting documentation.
- **SC-004**: 100% of imports of DRM-protected, malformed, oversized, unsupported-format, unsupported-encoding, or empty files surface a typed, non-technical error and leave the library unchanged.
- **SC-005**: After a successful import, the bundled sample text remains available in the library and continues to read end-to-end with no regression from v1 behavior.
- **SC-006**: After a phone restart, every previously imported book MUST appear in the library at its persisted ordering and resume at its persisted page when opened.
- **SC-007**: A user with a library of 10 imported books can scroll the library and tap any entry without perceptible delay (provisional ≤ 200 ms tap-to-reader-open in the simulator; revisit on hardware).

## Assumptions

These were chosen as defaults during drafting; revisit if they bite. They are pinned for v2 of import; subsequent specs (003-library and beyond) may revise them.

1. **Sample stays.** The bundled "The Tell-Tale Heart" remains a permanent library entry; it cannot be removed in v2 of import (deletion is a 003-library concern).
2. **Library ordering.** Most-recent-action first (most recently added or opened, whichever is more recent). Configurable sorting is a 003-library concern.
3. **Single user, single device.** No profiles, no multi-device sync; carries forward from v1.
4. **Encoding.** Plain-text imports are UTF-8 only. UTF-16 / Windows-1252 / other encodings are out of scope; non-UTF-8 files are refused.
5. **EPUB scope.** EPUB 2 and EPUB 3 are both supported. Only the body text is consumed; navigation document, table of contents, footnotes, and embedded media are ignored.
6. **Maximum file size.** 50 MB. Larger files are refused with a clear message.
7. **Duplicate detection.** By content hash of the imported file bytes (or, for plain text, by normalised text content). Detected duplicates bump the existing entry rather than creating a copy.
8. **Pagination caching.** Pages are computed once at import time and cached per book. Re-pagination only runs if the pagination engine itself changes (e.g. constants tune in a future release); no live re-pagination on rotation, font change, etc.
9. **Storage.** Imported book content lives in the companion-app's local storage (the same channel v1 used for reading position). No external storage, no cloud, no network.
10. **Provisional timing targets.** Latency / responsiveness numbers in Success Criteria are simulator-tested guesses; will be revisited post-hardware.
11. **Glasses-menu launch.** Resumes the most-recently-opened book; falls back to the bundled sample at page 1 if no book has ever been opened. Carries forward v1 launch-source behavior, generalized for multiple books.
12. **No phone-side reader UI for imported books.** The phone-side surface stays minimal — library list + import button + the v1 status block (connection state, current title, "Page X of Y"). All actual reading happens on the glasses.

## Dependencies

- The Even Realities companion app and Even Hub platform must be installed and authenticated on the user's phone (carries forward from v1).
- The G2 glasses must be paired with the phone and powered on for any glasses-side rendering (carries forward from v1).
- For import, the phone must grant evenBooks read access to the file storage location selected by the user via the system file picker.
- No third-party services or network resources are required.

## Risks & Unknowns

- **R1: EPUB parsing reliability in the wild.** EPUBs vary widely. Public-domain Project Gutenberg releases are well-formed; commercial DRM-free releases (e.g. Standard Ebooks, Smashwords) are also clean; but author-self-published EPUBs and old converted releases sometimes have malformed XHTML, broken ZIP central directories, or unusual content document structures. Mitigation: refuse-with-clear-message on parse failure (FR-014); keep a "weird EPUBs we've seen" log during the hardware-validation pass.
- **R2: DRM detection completeness.** Adobe ADEPT and Apple FairPlay are the two common DRM systems for EPUBs; both leave detectable signatures in the package. Less common DRM variants (Sony, Barnes & Noble's own scheme, etc.) may slip through detection. Mitigation: detect the common cases reliably; if a non-standard DRM file slips through, parsing will fail downstream and Story 3's malformed/corrupt path catches it (less precise message but still safe).
- **R3: Persistent storage capacity.** v1 persisted only an integer page index. v2 of import persists the full text of each imported book plus its paginated pages. A user with a dozen 5 MB books would push storage hard against the companion app's KV store. Mitigation: enforce the 50 MB per-file cap (Assumption #6); document in `003-library` that bulk-removal is part of library management; surface storage-full failures to the user (FR-014).
- **R4: Import latency on large EPUBs.** Pagination of a 5 MB book at 280 chars/page produces ~17,000 pages, which is a lot of array work. Naive pagination should still complete sub-second on modern phones, but the SC-001 30-second budget is set generously to allow for slow devices and ZIP/XML parsing overhead. Mitigation: surface progress while the import runs; revisit budget after measurement.
- **R5: File-picker behavior across phone OSes.** iOS and Android expose system file pickers with different UX and access models. The acceptance scenarios in this spec speak generically ("system file picker"); concrete behavior may diverge slightly between platforms. Mitigation: validate on whichever OS the user's phone runs first; spec follow-on differences as platform-specific addenda if they become material.

## Out of Scope (v2 of import)

The following were considered during drafting and are explicitly deferred. They're listed so the scope contract is unambiguous and so the follow-on specs have a starting list.

- Multi-book library management — sorting controls, deletion, search, tags, collections, "currently reading" / "finished" status (→ spec 003-library).
- Cross-disconnect resume beyond v1's crash-resistant local persistence (→ spec 004-resilience).
- Cloud sync, multi-device library sync, OPDS feeds, public-domain catalogs, store integrations.
- PDF, MOBI, AZW3, audiobook, comic, manga formats.
- Highlights, bookmarks, notes, annotations.
- In-book search and library-wide search.
- CJK and RTL script support.
- Multi-user profiles.
- TTS / audio output (no speaker hardware).
- Reading stats, gamification, streaks.
- Configurable font size, line spacing, margins, brightness, theme.
- Image rendering inside book content (text-only by intent — decided in v1's deferred decisions).
- EPUB navigation document / table-of-contents-aware navigation. v2 of import paginates the full body text linearly; chapter-jumping is a future concern.
- Live re-pagination on font/layout changes.
- Phone-side reading-progress visualisation beyond the v1 "Page X of Y" status text.
