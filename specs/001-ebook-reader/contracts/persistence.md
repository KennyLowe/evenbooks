# Contract: Persistence

The only durable surface in evenBooks v1. A single key in the Even Hub companion-app key-value store; all reads and writes go through `src/platform/persistence.ts`.

## Key

```
evenBooks.position.v1
```

The `.v1` suffix is intentional. Schema migrations in future versions write to `.v2` etc.; v1 readers ignore other versions.

## Value shape

```ts
type StoredPosition = {
  book: "sample"; // BookId; v1 always "sample"
  page: number; // 0-based; integer in [0, totalPages)
  savedAt: number; // ms since epoch; informational only
};
```

Serialised as `JSON.stringify(StoredPosition)`. Worst-case payload < 100 bytes.

## Operations

### Save (`writePosition(p: StoredPosition): Promise<void>`)

Called from the reader reducer after every transition that changes `pageIndex` (excluding `clamp-flash`).

```text
1. payload = JSON.stringify(p)
2. ok = await bridge.setLocalStorage(KEY, payload)
3. if !ok or call throws:
     - keep in-memory page index
     - emit ERROR event with kind="save-failed", surfaced to phone-side UI for 5 s
     - DO NOT retry in a loop
     - DO NOT throw further
```

Save is fire-and-forget from the reducer's perspective. The reducer transitions immediately on the input event; the save promise resolves asynchronously. If save fails, the user keeps reading; only the persistence guarantee is lost, and the user is told.

Concurrency: only one save can be in flight at a time. If `writePosition` is called while a previous save is in flight, the new call queues; the queue depth is capped at 1 (a third call replaces the second).

### Read (`readPosition(book: BookId, totalPages: number): Promise<ReadResult>`)

Called once at bootstrap, after `waitForEvenAppBridge()` resolves and after `paginate()` produces the page array.

```ts
type ReadResult =
  | { kind: "fresh-start" } // key absent; first ever launch
  | { kind: "resumed"; page: number } // valid value found
  | { kind: "recovered"; page: 0; reason: RecoveryReason };

type RecoveryReason =
  | "unparseable" // JSON.parse threw
  | "wrong-book" // future-proofing for spec 002
  | "out-of-range"; // page index ≥ totalPages
```

Algorithm:

```text
1. raw = await bridge.getLocalStorage(KEY)
2. if raw === "" or raw === null or raw === undefined:
     return { kind: "fresh-start" }
3. try parsed = JSON.parse(raw)
   catch: return { kind: "recovered", page: 0, reason: "unparseable" }
4. if parsed.book !== book:
     return { kind: "recovered", page: 0, reason: "wrong-book" }
5. if !Number.isInteger(parsed.page) or parsed.page < 0 or parsed.page >= totalPages:
     return { kind: "recovered", page: 0, reason: "out-of-range" }
6. return { kind: "resumed", page: parsed.page }
```

The caller (bootstrap in `main.ts`) does:

- `fresh-start` → start at page 0; no notice.
- `resumed` → start at returned page; no notice.
- `recovered` → start at page 0; emit a phone-side notice corresponding to the `reason` (see `contracts/phone-ui.md`).

## Error & failure surfacing

Save failures: visible on the phone-side UI for 5 s as `"could not save position; reading session continues"`. Constitution Principle V — failure surfaces; reading is not interrupted.

Read recoveries: visible on the phone-side UI for 5 s, message varies by reason:

| `RecoveryReason` | Phone-side notice                                       |
| ---------------- | ------------------------------------------------------- |
| `unparseable`    | "Could not restore previous position."                  |
| `wrong-book`     | "No saved position for this book."                      |
| `out-of-range`   | "Saved position is out of range; resumed at the start." |

These notices are also written to `console.warn` for dev visibility.

## Versioning

Schema changes bump the suffix:

- v1 → v2: add a new key `evenBooks.position.v2`. v2 readers attempt v2 first, then fall back to migrating v1 to v2 (read v1, write v2, ignore v1 after).
- v1 readers never attempt to read non-v1 keys.

This is not relevant to v1 implementation but is documented so the contract is self-describing.

## Test coverage (Vitest)

`tests/unit/persistence.test.ts` exercises:

- Empty / null / undefined raw → `fresh-start`.
- Garbage string → `recovered/unparseable`.
- Valid JSON, wrong book → `recovered/wrong-book`.
- Valid JSON, page negative → `recovered/out-of-range`.
- Valid JSON, page === totalPages → `recovered/out-of-range`.
- Valid JSON, page in range → `resumed`.
- Save success → resolves; no error.
- Save throws → resolves (does not propagate); ERROR event emitted.

The bridge is mocked at the `bridge.setLocalStorage` / `bridge.getLocalStorage` boundary; no real SDK or simulator needed for these tests.
