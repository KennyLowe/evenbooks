# Contract: Persistence v2

The persistence surface in v2 is a **hybrid** of the SDK's KV channel (used for small / durable metadata) and the WebView's IndexedDB (used for bulky derived content). All reads and writes go through `src/platform/persistence.ts` (extended) and `src/platform/book-store.ts` (new). Migration runs once at bootstrap via `src/platform/persistence-v2-migration.ts`.

The bridge wrapper (`src/platform/bridge.ts`), error convention (`src/platform/errors.ts`), and teardown registry (`src/platform/teardown.ts`) are unchanged from v1.

---

## SDK KV layer (`bridge.setLocalStorage` / `bridge.getLocalStorage`)

### Keys

```
evenBooks.library.v2              ← the library index (one key)
evenBooks.position.<bookId>       ← per-book reading position (one key per book in the library)
evenBooks.position.v1             ← legacy v1 key, deleted on first v2 launch by migration
```

The `.v2` suffix on the library key is intentional. Schema migrations in future versions write to `.v3` etc.; v2 readers ignore other versions.

### `evenBooks.library.v2`

```ts
type StoredLibrary = {
  version: 2;
  entries: StoredLibraryEntry[];   // unordered on disk; sorted in-memory at read time
};

type StoredLibraryEntry = {
  id: BookId;                      // "sample" or 16-hex-char SHA-256 truncation
  title: string;
  author: string;
  format: BookFormat;              // "bundled" | "epub" | "text"
  addedAt: number;                 // ms since epoch
  lastOpenedAt: number | null;     // ms since epoch; null until first open
  totalPages: number;
};
```

Validation on read:

- JSON parses.
- `version === 2`.
- `entries` is an array; each entry has all required fields with valid types.
- Any failure → log to console; recover with an empty library bootstrapped to contain only the bundled sample (with `addedAt = now`); surface `"Couldn't restore your library"` notice.

Write: full overwrite on every mutation (the array is small enough that delta updates aren't worth the complexity).

### `evenBooks.position.<bookId>`

Same shape as v1's `evenBooks.position.v1`, scoped per book:

```ts
type StoredPosition = {
  book: BookId;
  page: number;                    // 0-based; integer in [0, totalPages)
  savedAt: number;                 // ms since epoch
};
```

Read recovery is the same five-outcome state machine from v1's `contracts/persistence.md` (`fresh-start` / `resumed` / `recovered/unparseable` / `recovered/wrong-book` / `recovered/out-of-range`), generalised to take `(bookId, totalPages)` instead of being hardcoded to the sample.

Save behaviour: same fire-and-forget pattern as v1 (immediate write on every page change; failure caught and surfaced via the v1 transient notice channel as `save-failed`). Single-flight per book.

---

## IndexedDB layer (WebView)

### Database & store

- Database name: `evenBooks`
- Database version: `1` (bumps on schema changes)
- Object store: `books`
- Key path: `id` (in-line keys; the value object includes its own id field)

### Value shape

```ts
type StoredBookContent = {
  id: BookId;
  text: string;                    // post-extraction, whitespace-normalised body
  pages: string[];                 // pre-paginated; index = page number; same as Page.text values
  storedAt: number;                // ms since epoch
};
```

Constraints:

- `text` may be up to ~50 MB (Spec Assumption 6). IndexedDB handles this comfortably.
- `pages.length === totalPages` recorded in the corresponding `LibraryEntry`. The two MUST stay in sync; the import pipeline writes both atomically (LibraryEntry first, then content) and the reader trusts them as paired.
- The bundled sample has **no record** in this store. `getBookContent("sample")` short-circuits to the compiled `SAMPLE_BOOK` constant in `src/content/sample-text.ts`.

### Operations

```ts
// Read content. Returns null if absent (e.g. evicted by OS or never imported).
async function getBookContent(id: BookId): Promise<StoredBookContent | null>;

// Write or replace.
async function putBookContent(content: StoredBookContent): Promise<void>;

// Remove. (Unused in v2 — included for symmetry; 003-library will use it.)
async function deleteBookContent(id: BookId): Promise<void>;
```

Concurrency: IndexedDB transactions handle this natively. A single read or write is one transaction.

---

## "Content evicted" recovery

A library entry can outlive its IndexedDB content if the OS clears WebView storage under pressure. v2 handles this gracefully:

```text
User taps a library entry
└─→ getBookContent(id)
    ├─→ returns content → proceed to reader (normal path)
    └─→ returns null   → DO NOT crash; DO NOT silently use the wrong book
                         show a notice via the v1 transient channel:
                         "This book's content was cleared by your phone. Please re-import."
                         the entry stays in the library; tap is a no-op until re-import
```

The reading position for the evicted book is preserved; re-importing the same file (same `BookId` because it's content-derived) reattaches the position automatically.

The phone-side library UI marks evicted entries visually (e.g. de-emphasised; an "evicted" pill) — see `contracts/library-ui.md`.

---

## Migration: v1 → v2

State machine, run once at bootstrap by `src/platform/persistence-v2-migration.ts` after `waitForEvenAppBridge()` resolves but before the library view is rendered or any reader work happens.

```text
START
│
├─ get bridge.getLocalStorage("evenBooks.position.v1")
│
├─ raw is empty / null / undefined
│   └─ return { kind: "no-migration-needed" }
│
├─ raw exists; try JSON.parse
│   ├─ throws → log to console; KEEP the v1 key (for forensics);
│   │           return { kind: "migration-failed", reason: "v1-payload-unparseable" }
│   │
│   └─ parses successfully
│       │
│       ├─ extract page from parsed; clamp to [0, sampleTotalPages)
│       │
│       ├─ check existing v2 library
│       │   ├─ already contains a "sample" entry with non-default lastOpenedAt
│       │   │   → migration is a no-op (it ran before, but v1 key wasn't deleted somehow);
│       │   │     delete v1 key; return { kind: "no-migration-needed" }
│       │   │
│       │   └─ otherwise → proceed
│       │
│       ├─ write evenBooks.position.sample = { book: "sample", page, savedAt: now }
│       ├─ create / update evenBooks.library.v2 = {
│       │      version: 2,
│       │      entries: [{ id: "sample", title, author,
│       │                  format: "bundled",
│       │                  addedAt: now, lastOpenedAt: now,
│       │                  totalPages }]
│       │  }
│       ├─ delete evenBooks.position.v1
│       └─ return { kind: "migrated", page }
```

Properties:

- **Idempotent**: rerunning produces the same library state. Step "already contains a sample entry with non-default lastOpenedAt" catches the case where v1 deletion failed but library was created.
- **Non-destructive on parse failure**: the v1 key is preserved if its content is unparseable, so future tooling can inspect.
- **Non-blocking**: if any step throws, bootstrap proceeds with a fresh-install state and a notice surfaces.
- **Silent on success**: per Spec Clarification (Q1), successful migration produces no user-visible notice.
- **Notice on failure**: the migration failure (`kind === "migration-failed"`) surfaces a `"Couldn't migrate previous reading position"` notice via the v1 transient channel.

---

## On-disk schema versioning

| Key / Store | Version | Migration policy |
|---|---|---|
| `evenBooks.library.v2` | 2 | A future v3 reader will read v2 entries and write v3; v2 reader treats unknown versions as "no library" and re-bootstraps. |
| `evenBooks.position.<bookId>` | (no version field; v1-style) | Stable across v2 lifetime. Any future schema change bumps the suffix to `v2/`. |
| IndexedDB `evenBooks` v1 | 1 | A future schema change uses IndexedDB's native `onupgradeneeded` to migrate. |
| `evenBooks.position.v1` | (legacy) | Deleted by v2 migration on first launch. |

---

## Test coverage (Vitest)

`tests/unit/persistence-v2.test.ts`:

- Library read: empty / null / garbage / wrong-version / valid → matching outcomes.
- Library write: round-trips; verify JSON shape.
- ReadingPosition per book: independent of other books' positions; recovery state machine matches v1.
- Bridge mocked at the `setLocalStorage` / `getLocalStorage` boundary.

`tests/unit/persistence-v2-migration.test.ts`:

- v1 key absent → `no-migration-needed`.
- v1 key with valid payload, no v2 library → `migrated`; library has sample entry; v1 key deleted; position written.
- v1 key with valid payload, v2 library already present (rerun case) → `no-migration-needed`; v1 key deleted.
- v1 key with garbage payload → `migration-failed/v1-payload-unparseable`; v1 key preserved; notice emitted.
- v1 page index out of range → clamped; migration succeeds.

`tests/unit/book-store.test.ts` (covers IndexedDB):

- `putBookContent` then `getBookContent` round-trips the full payload.
- `getBookContent` for an unknown id returns null.
- `deleteBookContent` removes and subsequent `getBookContent` returns null.
- Uses `fake-indexeddb` (added as a dev-only dep) so the tests run in Node without a browser. Documented in `quickstart.md`.
