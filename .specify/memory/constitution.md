# Even App Development Constitution

This constitution governs apps built for Even Realities G2 smart glasses against the Even Hub SDK (`@evenrealities/even_hub_sdk`). It encodes the design discipline that makes G2 apps feel native rather than ported. It deliberately does **not** restate SDK invariants or hardware limits as principles — those are facts of the platform and live in the **Hardware & SDK Invariants** section below; principles are value judgments where reasonable engineers might choose differently.

**Scope.** This constitution applies to any project that imports `@evenrealities/even_hub_sdk`, regardless of where it lives on disk or how it's structured. It is portable: copy this file into another G2 project and it applies there too.

## Core Principles

### I. Every Frame Is Glanceable (NON-NEGOTIABLE)

The G2 display is a 576×288 rectangle of green-on-black pixels worn in the user's peripheral vision. Every individual frame the app renders must be consumable in a single 1–3 second glance. Sustained-reading apps (ebook readers, long-form notifications, transcripts) are legitimate — they just have to deliver their content as a sequence of glanceable frames advanced by deliberate user input, not as a single dense screen.

- Each frame must be readable without focus: typography sized for peripheral vision, no within-frame scrolling, no layouts that require the eye to scan back and forth across the canvas.
- Multi-frame experiences must be **user-paced**: each advance is an explicit gesture (single press, double press, swipe). Auto-advance is forbidden by default; opt-in timed advance requires user configuration and a clear visual cue that auto-advance is active.
- The most important information in any single frame goes top-left and is large enough that a reader could understand the frame from a passing glance even if they didn't read every word.
- The display is **monochrome by hardware** (4-bit greyscale rendering as green-on-black). Designs must be monochrome-native, not desaturated colour designs. Tonal range, line weight, and whitespace do the work that hue would do on a phone.

### II. Data Minimalism

Capture, transmit, and store the minimum data the feature needs. The hardware enforces some of this for us (no camera, no speaker), but the channels we _can_ abuse — microphone, IMU, network, persistent storage — are the developer's responsibility.

- **Sensors are off by default.** Microphone (`audioControl`) and IMU (`imuControl`) start disabled and turn on only for the duration of a feature that needs them, with a clear user-visible signal when they're active.
- **Lowest-acceptable rate.** When a sensor is on, request the minimum rate that does the job. IMU `P1000` (1 Hz) is the default; faster requires written justification.
- **Local-first.** Network calls require a user-facing reason. Default behavior is fully offline; cloud features must be opt-in and disclosed in the app description.
- **Storage hygiene.** Per-user data lives in `setLocalStorage` and is deleted when the feature using it is removed. Never persist sensor readings or microphone data without explicit, scoped user intent.

### III. The Phone Is the Brain, the Glasses Are the Lens

The phone holds the authoritative state of the app. The glasses display is a derived projection of that state — never a source of truth, never trusted to retain data across a connection blip.

- All persistent state, business logic, and decision-making lives on the phone (in the WebView).
- The glasses display is rebuilt from phone state on every reconnection or page change. Disconnect/reconnect is a refresh, not a sync.
- Operations that mutate state must be **idempotent and queue-tolerant**: assume any individual SDK call may fail, drop, or arrive twice, and write code so a retry is correct, not corrupting.
- Be pessimistic about BLE, optimistic about retries. Wrap glasses-mutating calls in a small queue with bounded backoff; surface persistent failures to the user (Principle V) rather than papering over them.

### IV. Battery and Bandwidth Are Sacred

G2 batteries are small and BLE bandwidth is finite. Updates must be parsimonious — opinions only; SDK serialization rules are facts and live in the Invariants section.

- Prefer `textContainerUpgrade` over `rebuildPageContainer` for any change that doesn't alter container shape — full rebuilds flicker on hardware and cost more energy.
- Coalesce updates: if state changes five times in 100 ms, send the result once.
- Pair every sensor open with a sensor close on a clear lifecycle boundary. No "I'll leave it on, it's fine" — it's not fine.
- Subscriptions returned from `onEvenHubEvent`, `onDeviceStatusChanged`, `onLaunchSource` must be unsubscribed on the corresponding teardown. Leaks accumulate across navigation.

### V. Crash Without Lying

When something fails, the user finds out. Silent degradation is forbidden — better a visible "couldn't reach glasses" than a phantom UI that pretends everything is fine.

- Every catch block either _recovers_ (with a recovery the user can see) or _surfaces_ (with a message the user can act on). Logging-and-swallowing is not a failure mode of this app.
- The phone-side UI always shows ground truth for the connection state (connected / connecting / disconnected) when reading or writing depends on it.
- Errors with no user action ("internal: container ID mismatch") still appear, but as a discreet status the user can ignore — never hidden, never mistaken for success.

### VI. Simulator-First, Hardware-Verified

New behavior must be demonstrated in the official simulator (`@evenrealities/evenhub-simulator`) before being claimed complete. Hardware verification is required before public release but does not replace simulator coverage.

- Iterating in the simulator is the default development loop. If a behavior can't be tested in the simulator, it gets a written rationale and is flagged as hardware-only.
- Hardware-only checks (latency feel, IMU on a real head, real-world readability of fonts at peripheral focus, real BLE behavior) happen at release-candidate time.
- For non-trivial interaction logic, headless simulator runs (see SDK docs) cover regressions. For solo / small-team projects this is encouraged, not mandated; for shared projects it's mandated.

## Hardware & SDK Invariants

These are facts of the platform. Plans that violate them are not policy violations — they're broken. Numerical values and exact API names should be treated as live and looked up from the SDK type definitions; the table below is a navigation aid, not a substitute.

### Display & layout

| Aspect               | Limit                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| Display resolution   | 576 × 288 px per eye                                                                            |
| Colour depth         | 4-bit greyscale (16 shades; renders green-on-black). No colour rendering.                       |
| Origin               | (0, 0) top-left; X right, Y down                                                                |
| Containers per page  | ≤12 total; ≤8 text; ≤4 image                                                                    |
| Text content         | ≤1000 chars per `TextContainerProperty.content`; ≤2000 chars per `textContainerUpgrade` payload |
| Image container size | width 20–288, height 20–144                                                                     |
| Padding              | 0–32 px; border width 0–5; border radius 0–10                                                   |

### Lifecycle (one-shot startup, page-container model)

- `createStartUpPageContainer` is called **exactly once per app launch**. Subsequent layout changes use `rebuildPageContainer`. Repeat calls are not negotiable — they are broken.
- **Exactly one** container per page must have `isEventCapture: 1`. Zero or multiple capture containers ⇒ undefined input behavior.
- Image containers cannot capture events; pages with only image content require a transparent text container as the capture layer.
- `audioControl` and `imuControl` will fail unless `createStartUpPageContainer` has previously returned `success`.

### Transport

- BLE 5.2. Updates queue and serialize through the companion app.
- `updateImageRawData` calls must be **serial** — `await` each before issuing the next.
- Long press is **reserved** by the OS for Even AI; do not bind it.

### Input vocabulary

- Touchpad gestures available to the app: single press, double press, swipe up, swipe down.
- IMU report rate: discrete steps from 100 ms (10 Hz) to 1000 ms (1 Hz).
- Audio input: single 16 kHz PCM stream from the 4-mic array (no multichannel).

### What we don't yet know (timing budgets to measure)

The following budgets shape design but cannot be set authoritatively until we run on real hardware. They become hard targets after the first hardware-validation pass.

- BLE round-trip cost of a `textContainerUpgrade` (how fast can a page-turn-style update happen?).
- Visual flicker / glitch threshold of `rebuildPageContainer` vs. `textContainerUpgrade` on real lenses.
- Battery cost per page-turn-style update; pages-per-charge for a sustained-reading workload.
- Reliable distinguishability of single press vs. double press (debounce window).
- Maximum sustainable text rendering speed for live transcript-style apps.

A plan that hard-codes a timing requirement in any of these areas before hardware validation is overconfident and must flag the assumption explicitly.

## Development Workflow

This is workspace methodology, not constitutional law — replace it freely if you adopt this constitution elsewhere.

- **Methodology.** This workspace uses spec-driven development via spec-kit. The lifecycle is `/speckit-specify` → (`/speckit-clarify`) → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`. Trivial changes (≤20 LoC, no new behavior, no new SDK calls) may skip directly to implementation.
- **Scaffolding.** New apps should start from one of the official starter templates (`minimal`, `asr`, `image`, `text-heavy`) unless there's a written reason not to.
- **Language.** TypeScript with `strict: true`. The SDK ships `.d.ts`; consume those types directly rather than redeclaring.
- **Framework.** Plain Vite + TS is the default. Pull in React / Svelte / Vue only if the feature genuinely benefits.
- **Initialization.** Every entry follows the SDK's required startup order (see Invariants → Lifecycle).
- **Testing.** Simulator-driven (per Principle VI). Pure-logic unit tests are encouraged. Headless simulator integration tests are encouraged for non-trivial interaction logic; mandatory for shared / multi-developer projects.
- **Packaging.** Releases run `evenhub validate` before `evenhub pack`. The resulting `.ehpk` is the unit of submission.
- **Manifest hygiene.** `app.json` declares only the permissions actually used. `min_sdk_version` reflects the version this app was built and tested against (kept in `package.json`, not in this constitution).

## Governance

- The constitution check is part of `/speckit-plan`. Plans that violate the NON-NEGOTIABLE principle (I) must be rejected at plan time, not negotiated at implementation. Plans that deviate from other principles must justify in the plan's Complexity Tracking section.
- Amendments edit this file and bump the version. Re-run `/speckit-constitution` after amendment to re-sync any spec-kit templates that derive from it.
- Versioning is semantic for documents: MAJOR for principle additions / removals / material changes to a NON-NEGOTIABLE principle; MINOR for new non-NN principles or new sections; PATCH for wording fixes. Same-day major bumps during initial drafting are honest, not unstable.
- This constitution is **not** the SDK reference. Numerical values and exact API names should be looked up from the SDK type definitions; this file is a navigation aid for design intent.

**Version**: 3.0.0 | **Ratified**: 2026-04-30 | **Last Amended**: 2026-04-30

### Changelog

- **3.0.0** (2026-04-30) — Major restructure based on architectural review. Removed Principles III (One Capture, One Page), VI (Spec Before Code), VII (Local Docs First) — III's content moved into the Hardware & SDK Invariants section because it described platform facts, not design discipline; VI moved into Development Workflow as methodology; VII removed entirely as it was AI-assistant tooling guidance, not app-design guidance. Renamed and reframed II from "Privacy by Hardware" (tautological — hardware enforces no camera/speaker) to "Data Minimalism" (developer discipline on the channels we can abuse). Added new principles: III (Phone Is the Brain, Glasses Are the Lens) and V (Crash Without Lying), and elevated monochrome-native design as a sub-bullet of I. Reduced NON-NEGOTIABLE count from two to one. Removed hardcoded `C:\git\even\` paths from scope and references; constitution now scopes by intent ("any project that imports `@evenrealities/even_hub_sdk`"). Added "What we don't yet know" timing-budget section to acknowledge unknowns before hardware lands. Removed `min_sdk_version` from the constitution body — that lives in `package.json`.
- **2.0.0** (2026-04-30) — Reworded NON-NEGOTIABLE Principle I from "Glance, Don't Read" to "Every Frame Is Glanceable" to remove an internal contradiction (the original wording forbade sustained-reading apps in its lead sentence while explicitly admitting them in a sub-bullet).
- **1.0.0** (2026-04-30) — Initial ratification.
