# Contract: Phone-Side WebView UI

The phone-side UI is what the user sees if they look at their phone while wearing the glasses. It runs in the WebView hosted by the Even Realities companion app. v1 is intentionally minimal (FR-008 + Q5 clarification): connection state + reading status + transient recovery / save-failure notices.

## Surface

A single HTML page rendered into `index.html`. No routing, no framework. The DOM is updated imperatively from `src/ui/phone-status.ts` whenever observable state changes.

## Structure

```html
<main id="phone-status">
  <header>
    <h1>evenBooks</h1>
    <p class="connection" data-state="connecting">Connecting…</p>
  </header>

  <section class="reading">
    <p class="title">The Tell-Tale Heart</p>
    <p class="author">Edgar Allan Poe</p>
    <p class="progress">Page 1 of 45</p>
  </section>

  <aside class="notice" hidden></aside>
</main>
```

The HTML is rendered server-side at build (it's static). Runtime updates only mutate text content and `hidden` attributes.

## State-to-DOM mapping

| Source state                       | DOM target                                  | Update rule                                                                                       |
| ---------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Connection state                   | `.connection` text + `data-state` attribute | "Connecting…" / "Glasses connected" / "Glasses not connected"                                     |
| Current `ReaderState.book.title`   | `.title` text                               | Set once at bootstrap                                                                             |
| Current `ReaderState.book.author`  | `.author` text                              | Set once at bootstrap                                                                             |
| Current `pageIndex` + `totalPages` | `.progress` text                            | "Page {pageIndex+1} of {totalPages}" — updated on every reducer transition that changes pageIndex |
| Active notice                      | `.notice` text + `hidden`                   | Visible for 5 s when a notice is emitted; hidden otherwise                                        |

## Notice channel

A single transient slot for surfacing failures that the user should know about but that don't interrupt reading. Consumes events from the persistence layer (R6 / `contracts/persistence.md`) and from the save-failure path.

| Event                         | Notice text                                             | Duration |
| ----------------------------- | ------------------------------------------------------- | -------- |
| Read recovery: `unparseable`  | "Could not restore previous position."                  | 5 s      |
| Read recovery: `wrong-book`   | "No saved position for this book."                      | 5 s      |
| Read recovery: `out-of-range` | "Saved position is out of range; resumed at the start." | 5 s      |
| Save failure                  | "Could not save position; reading session continues."   | 5 s      |

If multiple notices arrive in rapid succession, the most recent replaces the prior. The 5 s timer resets on replacement.

## Connection state

Three states, derived from `bridge.onDeviceStatusChanged` per `src/platform/connection.ts`:

| `DeviceConnectType`                        | UI state        | Rendered text           |
| ------------------------------------------ | --------------- | ----------------------- |
| `Connecting`                               | `connecting`    | "Connecting…"           |
| `Connected`                                | `connected`     | "Glasses connected"     |
| `Disconnected`, `ConnectionFailed`, `None` | `not-connected` | "Glasses not connected" |

The phone UI is the **only** place this state surfaces (Constitution Principle V — surfacing — and FR-008's "MUST NOT pretend the glasses are showing content"). The glasses themselves never render a connection-status frame (Principle I).

## Forbidden surfaces in v1

Out of scope per spec; calling them out so they can't slip in:

- A library list / book picker.
- Settings (font size, brightness).
- Glasses battery indicator.
- A "force resync" button.
- Any non-trivial styling beyond legible monospaced or system-default sans-serif.
- Localization / i18n switching.

## Test coverage

The phone UI is small and DOM-mutating; in v1 we cover it via:

- A pure-logic unit test on the state-to-text mapping (the function that takes a `ReaderState` and returns the strings to render). Asserts e.g. `page=12, totalPages=45` → `"Page 13 of 45"`.
- Manual verification in the simulator (the WebView host renders this surface and we eyeball it).

No DOM-level integration test in v1; the surface is too thin to justify a jsdom dependency.
