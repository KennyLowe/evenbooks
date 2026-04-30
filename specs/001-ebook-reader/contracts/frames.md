# Contract: Glasses Frames

The glasses display in v1 is a single text container (`isEventCapture: 1`) created once at startup and updated thereafter via `textContainerUpgrade`. This document specifies every frame the user can see and how it's composed.

All frame composers in `src/reader/frames.ts` are pure functions: `(state) → TextContainerUpgrade` or `(state) → CreateStartUpPageContainer`. Pure-function design enables idempotent re-renders on reconnect (Constitution Principle III) and unit testing.

## Container definition

The single text container is created once at bootstrap:

```ts
const CONTAINER: TextContainerProperty = new TextContainerProperty({
  containerID: 1,
  containerName: "main",
  xPosition: 0,
  yPosition: 0,
  width: 576,
  height: 288,
  paddingLength: 4,
  borderWidth: 0,
  borderColor: 0,
  borderRadius: 0,
  isEventCapture: 1,
  content: "",                  // overwritten immediately by the first frame send
});
```

`createStartUpPageContainer` is called exactly once, with this single text container in `textObject`. After that, all rendering is `textContainerUpgrade` calls against `containerID: 1, containerName: "main"`.

## Frames

### F-PAGE — normal reading frame

The default frame. Renders the body text of `Page` at index N.

**Trigger**: every transition into `ReaderMode { kind: "reading", pageIndex: N }`. Also re-issued on `RECONNECT`.

**Composition**:
```ts
function pageFrame(page: Page): TextContainerUpgrade {
  return new TextContainerUpgrade({
    containerID: 1,
    containerName: "main",
    contentOffset: 0,
    contentLength: 0,           // 0 means "replace from offset to end" — full content swap
    content: page.text,
  });
}
```

**Visual**: body text only; no page numbers, no progress bar, no chrome. (FR-001, Q4 clarification.)

**Constraints**: `page.text.length ≤ 600` (R1 hard cap; well under SDK 2000-char `textContainerUpgrade` cap).

### F-CLAMP — first-page clamp indicator (transient)

A brief visual acknowledgement that a `PREV_PAGE` input was received at page 0. Lasts ~1 s, then reverts to F-PAGE.

**Trigger**: transition into `ReaderMode { kind: "clamp-flash", pageIndex: 0, flashUntil }`.

**Composition**:
```ts
function clampFlashFrame(page: Page): TextContainerUpgrade {
  // Prepend a transient indicator marker; the page text follows on a new line.
  return new TextContainerUpgrade({
    containerID: 1,
    containerName: "main",
    contentOffset: 0,
    contentLength: 0,
    content: "↑ start of book\n\n" + page.text,
  });
}
```

**Visual**: an "↑ start of book" line at the top, then the page body. After ~1 s the reducer transitions back to `reading(0)` and F-PAGE is re-rendered, hiding the indicator.

**Composition note**: the prefix consumes two lines of vertical real estate during the flash. For a 6-line page this means the body text is briefly truncated; that's acceptable because the user is not reading new content during the flash — they just attempted a back-navigation that hit the boundary.

### F-EOB — end-of-book frame

Replaces the page when the user presses NEXT past the final page.

**Trigger**: transition into `ReaderMode { kind: "end-of-book" }`.

**Composition**:
```ts
function endOfBookFrame(book: Book): TextContainerUpgrade {
  return new TextContainerUpgrade({
    containerID: 1,
    containerName: "main",
    contentOffset: 0,
    contentLength: 0,
    content: `End of "${book.title}".\n\nPress to exit.`,
  });
}
```

**Visual**: a centred-feeling two-line message. Body text of the final page is gone — this is intentional (the user has finished; the last page is no longer the primary information).

**Subsequent input**: a `NEXT_PAGE` from this state transitions to `exiting` (which calls `bridge.shutDownPageContainer(0)`). A `PREV_PAGE` returns to `reading(lastIndex)` showing the final page again.

## Transition table

| From frame | Input | To frame | SDK call |
|---|---|---|---|
| (none, app launch) | bootstrap complete | F-PAGE @ savedPage | `createStartUpPageContainer` then immediate `textContainerUpgrade` |
| F-PAGE @ N (N < last) | `NEXT_PAGE` | F-PAGE @ N+1 | `textContainerUpgrade` |
| F-PAGE @ N (N === last) | `NEXT_PAGE` | F-EOB | `textContainerUpgrade` |
| F-PAGE @ N (N > 0) | `PREV_PAGE` | F-PAGE @ N-1 | `textContainerUpgrade` |
| F-PAGE @ 0 | `PREV_PAGE` | F-CLAMP @ 0 | `textContainerUpgrade` |
| F-CLAMP @ 0 | timer ~1 s | F-PAGE @ 0 | `textContainerUpgrade` |
| F-EOB | `NEXT_PAGE` | (exit) | `shutDownPageContainer(0)` |
| F-EOB | `PREV_PAGE` | F-PAGE @ last | `textContainerUpgrade` |
| any | swipe down (`SCROLL_BOTTOM_EVENT`) | (exit) | `shutDownPageContainer(0)` |
| any | reconnect (was disconnected) | (re-issue current frame) | `textContainerUpgrade` |

## Idempotency

Every frame composer is a pure function of state. Calling it twice in a row with the same state produces the same payload. Re-issuing the same `textContainerUpgrade` payload is a no-op as far as the user is concerned (the displayed text is replaced with the same text). This is the property that makes reconnect handling trivial: on every `DeviceConnectType.Connected` event for the active reading session, we just recompute the frame from current state and send it.

## Forbidden frames

To make the v1 contract explicit, the following frames are **not** present in v1 and adding them requires a constitution check (most would violate Principle I — chrome competing with body text):
- A "loading" frame between launch and first content render.
- A "disconnected" frame on the glasses (disconnect status surfaces on the *phone* per FR-008, never on the glasses).
- A "save failed" frame on the glasses.
- A page-number frame, progress-bar frame, or any frame with chrome.
- An animated transition between pages.

## Test coverage (Vitest)

`tests/unit/frames.test.ts`:
- `pageFrame` produces an upgrade payload with `containerID: 1`, `containerName: "main"`, full-content replace, content === page text.
- `clampFlashFrame` prepends "↑ start of book\n\n" and includes the page text.
- `endOfBookFrame` includes the book title and "Press to exit".
- All composers are pure: same input → same output; no observable side effects.
- All composers respect the 2000-char `textContainerUpgrade` cap given a 600-char page (asserted via property test or fuzzing).
