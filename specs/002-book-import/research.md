# Phase 0 Research — evenBooks v2 (Book Import)

This document resolves the unknowns surfaced in `spec.md` (R1–R5) and the additional architecture questions surfaced during planning (R6–R7).

For each: **Decision**, **Rationale**, **Alternatives considered**, and **Hardware-revisit?** (whether the decision is provisional pending a hardware run).

---

## R1 — EPUB parsing strategy and library choice

**Question**: How do we ingest EPUB files? Use a full ebook library, parse from primitives, or something in between?

**Decision**:

- Use **JSZip** to unpack the EPUB (which is a ZIP archive) → string-keyed file map.
- Use the **WebView's native DOMParser** to parse `META-INF/container.xml` (to find the OPF), `<rootfile>.opf` (to get spine + metadata), and the spine's XHTML content documents.
- Extract the body text from each spine item by walking the parsed XHTML DOM and collecting `textContent` of all visible nodes; treat `<p>`, `<div>`, and `<br>` as paragraph/line boundaries; ignore `<img>`, `<svg>`, `<script>`, `<style>`, and EPUB navigation documents.
- Concatenate spine items in order with `\n\n` paragraph separators, hand the result to the existing `paginate()` from v1.

**Rationale**:

- **JSZip** is the de-facto pure-JS ZIP library: dependency-free, MIT-licensed, well-maintained, ~100 KB minified, tested across every browser/WebView combination we care about. It's the right level of abstraction — file-map in, file-map out.
- **DOMParser** is built into every modern WebView; using a third-party XML library would be redundant. EPUB OPF and XHTML are XML — DOMParser handles them.
- **Hand-walking the DOM** for body text gives us precise control over what to skip (images per FR-009, scripts, styles) without inheriting the assumptions of a higher-level ebook library.
- Reusing the v1 `paginate()` honours FR-010 ("one shared pagination engine; not a fork") and is the cleanest way to make Constitution Principle III's "phone is the brain" promise concrete: imported and bundled books produce identical `Page[]` shapes downstream.

**Alternatives considered**:

- *EPUBJS* (or similar full-stack ebook library) — solves a much harder problem than we have (full reflowable rendering with iframes, CFI cursor tracking, etc.). For our use case (extract plain text, paginate ourselves), it's many megabytes of dependency for one feature: walk the DOM. Rejected.
- *Hand-rolled ZIP unpacker* — not worth it. ZIP is a non-trivial format (deflate, central directory parsing, edge cases) and JSZip is already ~100 KB. Premature avoidance of dependency for no real gain. Rejected.
- *Server-side parsing* (upload, parse, return text) — violates Principle II (Data Minimalism) and Principle III's local-first posture, and adds a network dependency we explicitly forbid. Rejected.
- *Wait for the SDK to ship an EPUB API* — speculative; the SDK is for hardware bridging, not content parsing. Rejected.

**Hardware-revisit?** No — EPUB parsing is platform-independent code that runs in the WebView. Hardware tunes pagination *constants*, not pagination *logic*.

---

## R2 — DRM detection technique

**Question**: How do we detect DRM-protected EPUBs and refuse them with a clear message before attempting to parse the content?

**Decision**: Inspect two paths inside the EPUB ZIP:

1. **`META-INF/encryption.xml`** — EPUB's standard encryption-declaration file. If present and contains `<EncryptionMethod>` elements with these algorithm URIs, refuse:
    - `http://www.idpf.org/2008/embedding` — Adobe's font embedding obfuscation (not strictly DRM but interferes with text extraction).
    - `http://ns.adobe.com/pdf/enc#RC` — Adobe ADEPT.
    - `http://www.w3.org/2001/04/xmlenc#aes128-cbc` (with an `<EncryptedKey>` referencing an Adobe / Apple key system) — common DRM payload encryption.
    - Any `<EncryptionMethod>` whose `Algorithm` does not match the IDPF font-mangling URI listed above (per the IDPF rules, font mangling is the only encryption EPUB readers must support transparently).
2. **`META-INF/rights.xml`** — non-standard but present in Adobe ADEPT-protected EPUBs. If present at all, treat as DRM.
3. Apple FairPlay leaves an `iTunesMetadata.plist` in `META-INF/`; if present, treat as DRM.

If the EPUB looks fine (no `encryption.xml`, no `rights.xml`, no `iTunesMetadata.plist`, or only IDPF-font-mangling encryption), proceed to normal parsing.

**Rationale**:

- These three signals catch the dominant DRM systems in the wild for EPUB: Adobe ADEPT (Kobo, B&N legacy, library lending) and Apple FairPlay (Apple Books). Together they are >95 % of DRM EPUBs a user is likely to encounter.
- The detection is **structural** (signature in known files), not crypto-level. We don't try to decrypt anything; we just refuse cleanly.
- If a less-common DRM scheme (e.g. Sony's old Marlin, B&N's newer PMG) slips through detection, the downstream parse will fail (because the body XHTML will be encrypted and produce non-text) — Story 3's `malformed/corrupt` path catches it. The message is less precise but the outcome (refusal, library unchanged) is still correct.

**Alternatives considered**:

- *Always attempt to parse, refuse only on parse failure* — works for the long tail but gives a worse UX message ("couldn't read this file") for the majority case (commercial DRM EPUB) where we know exactly why and can say so. Rejected.
- *Trust the DRM ecosystem* (try to decrypt with a user-provided key) — illegal in many jurisdictions, scope creep, security minefield, and the user explicitly decided "detect, refuse, explain" in v1's deferred decisions. Rejected.

**Hardware-revisit?** No — runs entirely on the phone-side parser.

---

## R3 — Storage architecture

**Question**: Where does imported book content live? `bridge.setLocalStorage` (the v1 channel) or something else?

**Decision**: **Hybrid.**

- **`bridge.setLocalStorage`** for small / durable metadata that the user perceives directly:
    - `evenBooks.library.v2` — JSON array of `LibraryEntry` (id, title, author, format, addedAt, lastOpenedAt, totalPages). Capped at ~tens of KB even with 100+ books.
    - `evenBooks.position.<bookId>` — per-book reading position. Tiny payload (< 100 bytes per book), follows the same pattern as v1's single key.
- **WebView IndexedDB** (object store `books`, key = bookId, value = `{ text: string, pages: string[] }`) for bulky derived content:
    - Per-book full text (post-extraction) and pre-paginated page array.
    - This is the only storage location for multi-megabyte payloads.
- The bundled sample text (`SAMPLE_BOOK` from v1's `src/content/sample-text.ts`) is not persisted to either layer — it's compiled into the bundle and presented through the same `Book` interface as imported books. The library index references it by id `"sample"` and the runtime substitutes the bundled constant when that id is requested.

**Cache-loss recovery posture**: WebView IndexedDB can be evicted by the OS under storage pressure. If a library entry exists but its IndexedDB content is missing, the runtime treats the entry as **content-evicted**: the entry remains visible in the library, marked with a "content unavailable" state on the phone UI, and tapping it surfaces a notice ("This book's content was cleared by the system. Please re-import.") rather than crashing. The reading-position key is preserved across the eviction so a re-import resumes the saved page.

**Rationale**:

- The SDK does not document the size cap on `setLocalStorage`. A 5 MB book in there might work, might silently truncate, might fail. We don't have hardware to test.
- IndexedDB is the standard browser storage primitive for blobs of this size. It's available in every WebView shipped in the past five years and routinely handles 50 MB+ payloads (which is our per-file cap from Spec Assumption 6).
- Splitting metadata (durable, user-perceived) from content (bulky, derivable-from-import) means the library's *structure* is preserved even if the OS evicts IndexedDB. The user keeps their list of "books I had" and their saved positions; only the actual text content needs re-import.
- Migration from v1 doesn't touch IndexedDB at all — v1 stored only the page index in `setLocalStorage`. Migration is purely a KV-side operation.

**Alternatives considered**:

- *Everything in `setLocalStorage`* — risks silent failure on large books; doesn't take advantage of IndexedDB's size headroom; tests poorly because we can't reproduce the SDK's storage layer in a unit test. Rejected.
- *Everything in IndexedDB* — works but loses the durability guarantee on the library index and reading positions. If IndexedDB is evicted, we lose *everything*. Worse than the hybrid. Rejected.
- *External SDK file API* — we don't know if the SDK exposes one. Even if it did, IndexedDB is more portable across SDK versions. Rejected for v2.

**Hardware-revisit?** Partially: the size-cap question for `setLocalStorage` will be answered concretely on hardware. If `setLocalStorage` turns out to be unreliable for even tens-of-KB payloads (unlikely but possible), we'd need to move the library index into IndexedDB too. Track as a hardware-validation item.

---

## R4 — Per-book identity scheme

**Question**: How do we generate a stable, content-derived id for each imported book to drive duplicate detection and serve as the IndexedDB primary key?

**Decision**:

- For EPUBs: SHA-256 hash of the **raw file bytes** as imported, hex-encoded, truncated to **16 hex chars** (= 64 bits of entropy, vastly enough for collision-avoidance at our scale). Computed via `crypto.subtle.digest("SHA-256", arrayBuffer)`.
- For plain text: SHA-256 hash of the **normalised UTF-8 text** (whitespace-collapsed; the same normalisation that feeds into the pagination engine), same truncation.
- The bundled sample uses the fixed id `"sample"` (preserves v1, avoids needing to embed a hash of the bundled string).

**Rationale**:

- Content-derived hash → **deterministic duplicate detection**: two imports of the same file produce the same id, so dedup is a simple "id already in library?" check (FR-016).
- Hashing **bytes** for EPUBs (not unpacked content) is more conservative — two EPUBs that decompose to the same text but were re-zipped with different timestamps will have different ids. This is the correct UX call: those *are* different files from the user's perspective, even if they produce the same reading experience. We make this trade-off explicit in Spec Assumption 7.
- Hashing **normalised text** for plain text is more permissive — two `.txt` files with different filenames but identical content dedupe. Plain text has no ZIP-level metadata to drift on, so byte-hashing would be redundant.
- 16 hex chars (64 bits) is far more than enough for a per-user library that holds ≤ 10 books in the design point and unlikely ever to hold >100. The birthday-collision threshold for a 64-bit space is ~4 billion entries.
- `"sample"` for the bundled is not a hash but is namespace-disjoint from any real hash output (which is always lowercase hex), so collisions are impossible.

**Alternatives considered**:

- *UUID v4 per import* — non-deterministic. Re-importing the same file would create a duplicate entry — exactly what FR-016 forbids. Rejected.
- *Hash of (filename + size + first/last bytes)* — fragile heuristic; same content from two sources collides; rename → new id. Rejected.
- *Full SHA-256 (64 hex chars)* — correct but verbose. Truncating to 16 is a clarity / size win with no real cost. Rejected.
- *MD5 / SHA-1* — `crypto.subtle.digest` supports both but they're cryptographically broken. SHA-256 is the modern default. No reason to choose anything else.

**Hardware-revisit?** No — `crypto.subtle` is available in every modern WebView; performance is fast enough that 50 MB hashing is sub-second on any phone we'd target.

---

## R5 — v1 → v2 migration sequencing

**Question**: When the v2 build first launches on a phone that still has v1's `evenBooks.position.v1` key populated, what exactly happens, and in what order, and what surfaces to the user?

**Decision**: Idempotent migration step at bootstrap, before the library is rendered or the bridge enters reader mode. Sequence:

```text
0. await waitForEvenAppBridge()
1. raw_v1 = bridge.getLocalStorage("evenBooks.position.v1")
2. if raw_v1 is empty / null:
     proceed to step 6 (no migration needed, normal v2 startup)
3. try parse raw_v1 as JSON
   on parse error:
     log to console; do NOT delete the v1 key (let the user inspect later);
     surface a notice "Couldn't migrate previous reading position";
     proceed to step 6 with a fresh sample at page 1
4. extract page_index from parsed v1 payload; clamp to [0, sample.totalPages)
5. write evenBooks.position.sample = { book: "sample", page: page_index, savedAt: now }
   write evenBooks.library.v2 = [{ id: "sample", title, author, format: "bundled",
                                    addedAt: now, lastOpenedAt: now, totalPages }]
   delete evenBooks.position.v1
   surface no notice (silent successful migration is the desired UX)
6. continue with normal v2 startup
```

The migration is **idempotent**: running it twice produces the same result (step 1 returns null on the second run because step 5 deleted the v1 key).

The migration is **non-destructive on parse failure**: if the v1 payload is corrupt, we keep the v1 key for forensic inspection rather than throwing it away. The user gets a notice, the library still works (sample at page 1), and they can manually clear storage if they want to reset.

The migration **never blocks** the bootstrap: any failure surfaces a notice and proceeds with a fresh-install state.

**Rationale**:

- Constitution Principle V (Crash Without Lying) requires that migration failures be visible to the user, not silently swallowed.
- Idempotence is non-negotiable — bootstrap can run many times during dev and we don't want migration to be a "did it already run?" question.
- Spec Assumption 4 (silent successful migration) keeps the happy path unobtrusive.
- Putting migration **before** the bridge enters reader mode prevents a half-migrated state from affecting reading behaviour.

**Alternatives considered**:

- *Migrate lazily on first read of the sample* — race condition risk; bootstrap is a clean place to do one-shot work. Rejected.
- *Always preserve the v1 key forever* — clutter that future tooling will have to handle. Rejected.
- *Block bootstrap on migration failure* — punishes the user for a problem they can't fix. Principle V says recover or surface; we recover (fresh-install state) and surface (notice). Rejected.

**Hardware-revisit?** No — runs in the WebView at startup before any glasses interaction.

---

## R6 — Plain-text encoding handling

**Question**: We accept `.txt` files as UTF-8. How do we detect non-UTF-8, handle BOMs, and refuse cleanly?

**Decision**:

- Read the file bytes via `File.arrayBuffer()`.
- Strip a UTF-8 BOM if present (the bytes `0xEF 0xBB 0xBF` at the very start).
- Decode using `new TextDecoder("utf-8", { fatal: true })`. If the bytes are not valid UTF-8, `TextDecoder.decode` throws — we catch and refuse with `Failure { reason: "unsupported-encoding" }`.
- Empty result (after decode + whitespace normalisation) → refuse with `Failure { reason: "empty" }`.
- Otherwise proceed: filename (minus `.txt` extension) → title; author → "Unknown".

**Rationale**:

- `TextDecoder` with `fatal: true` is the textbook way to validate UTF-8 in a browser. No regex hacks, no byte-pattern guessing.
- BOM stripping is conventional; many editors emit a BOM by default and the user shouldn't be punished for it.
- We deliberately do not auto-detect Latin-1 / Windows-1252 / UTF-16 / etc. The user has clear options to convert their file (every modern editor can save-as UTF-8) and supporting them all in v2 is scope creep.

**Alternatives considered**:

- *Best-effort decoding with replacement characters* — silent corruption. The user wouldn't notice but the book reads as gibberish. Violates Principle V. Rejected.
- *Heuristic encoding detection (chardet-style)* — adds a non-trivial dependency for a single edge case the user can fix in 30 seconds. Rejected.
- *Accept anything `<input type="file" accept="text/*">` returns* — too permissive; users would import binary files that happen to start with a UTF-8 BOM. Rejected.

**Hardware-revisit?** No.

---

## R7 — File-picker integration in the WebView

**Question**: How does the user actually pick a file from phone storage, given the WebView constraints?

**Decision**:

- A hidden `<input type="file" accept=".epub,.txt" />` element in the import area DOM, never visible to the user.
- The "Add book" button, when clicked, calls `inputElement.click()` which triggers the system file picker.
- Listen for the `change` event on the input. The event provides `event.target.files[0]`, a `File` object.
- Convert to `ArrayBuffer` via `await file.arrayBuffer()` and hand to the import pipeline.
- On the `change` event, also reset `inputElement.value = ""` so that the user can pick the same file again later (otherwise the change event won't fire for an identical re-selection — a quirk of `<input type="file">`).
- If the user dismisses the file picker without choosing (no `change` event fires, or `files.length === 0`), do nothing — the library state is unchanged. (Spec edge case: "Cancel from file picker".)

**Rationale**:

- This is the standard, fully-specified, browser-native way to invoke a file picker. It works in every WebView and on both iOS and Android.
- The `accept=".epub,.txt"` attribute lets the OS scope the picker to relevant files (a UX courtesy, not a security boundary — the user can still pick anything; we re-validate by extension and content).
- The hidden-input trick (rather than a visible `<input type="file">`) lets us style our own button without fighting the OS-default ugly file-input chrome.

**Alternatives considered**:

- *SDK-provided file picker* — the SDK doesn't expose one (its API surface is for glasses bridging). Rejected.
- *Drag-and-drop area* — desktop-WebView only; useless on a phone. Rejected.
- *Custom file browser UI* — would require the WebView to enumerate phone storage, which is a permission boundary the OS specifically forbids without going through the system picker anyway. Rejected.

**Hardware-revisit?** Partially: file-picker UX may differ between iOS and Android (different sheet styles, different permission prompts on first invocation). Validate on the user's actual phone OS; spec follow-on if the differences become material (Spec Risk R5).

---

## Test fixture strategy

Test fixtures (EPUBs, encrypted EPUBs, malformed files) are **synthesised at test time** using JSZip and `Blob`, not committed as binary blobs. Reasons:

- Diff-able and reviewable in PRs (you can read the test that builds the fixture instead of squinting at hex dumps).
- No license headache for committing real published EPUBs.
- DRM-protected fixture is generated by writing the canonical Adobe ADEPT marker into a synthetic `META-INF/encryption.xml` — no actual DRM content needed.
- Plain-text fixtures (UTF-8, UTF-8 + BOM, Latin-1) are similarly built from byte arrays in-test.

This pattern is encoded in `tests/unit/fixtures/` helpers that the new test files import.

---

## Summary table

| ID | Topic | Decision | Hardware revisit? |
|---|---|---|---|
| R1 | EPUB parsing | JSZip + native DOMParser; hand-walk DOM for body text | No |
| R2 | DRM detection | Inspect `META-INF/encryption.xml`, `rights.xml`, `iTunesMetadata.plist` | No |
| R3 | Storage architecture | Hybrid: SDK KV for metadata + IndexedDB for content; cache-loss recovery surfaces notice | Partial (`setLocalStorage` size cap on hardware) |
| R4 | Per-book identity | SHA-256 of file bytes (EPUB) / normalised text (TXT), truncated to 16 hex chars; sample uses fixed id `"sample"` | No |
| R5 | v1 → v2 migration | Idempotent bootstrap step; silent on success; notice on parse failure; v1 key deleted only after successful migration | No |
| R6 | Plain-text encoding | UTF-8 only via `TextDecoder({ fatal: true })`; BOM stripped; non-UTF-8 refused | No |
| R7 | File-picker integration | Hidden `<input type="file" accept=".epub,.txt">` programmatically clicked; reset value after change | Partial (iOS vs Android picker UX) |

All NEEDS CLARIFICATION items are resolved. Phase 1 design proceeds.
