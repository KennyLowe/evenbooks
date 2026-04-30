# Quickstart — evenBooks v1

Bring-up instructions for a developer (or a future me) who needs to clone, run, test, and ship v1.

## Prerequisites

- Node.js 18+ (Node 20 LTS recommended).
- macOS, Linux, or Windows. (Workspace was developed on Windows 11 + Git Bash; Vite + the simulator are cross-platform.)
- The Even Realities phone app installed on a paired iOS / Android device for hardware verification (not required for simulator-only work).
- Even G2 glasses paired with the phone (not required for simulator-only work).

## First-time setup

From `C:\git\even\evenBooks` (the project root):

```bash
# Scaffold from the official minimal template
cp -r ../official/evenhub-templates/minimal/* .
cp -r ../official/evenhub-templates/minimal/.* . 2>/dev/null || true   # dotfiles if any

# Install
npm install

# Add Vitest (not in the minimal template by default)
npm install -D vitest @types/node

# Verify the SDK and dev tools are present
npm ls @evenrealities/even_hub_sdk @evenrealities/evenhub-cli @evenrealities/evenhub-simulator
```

Edit `app.json` so it identifies as evenBooks rather than the minimal template:

```json
{
  "package_id": "com.evenbooks.reader",
  "edition": "202601",
  "name": "evenBooks",
  "version": "0.1.0",
  "min_app_version": "2.0.0",
  "min_sdk_version": "0.0.10",
  "entrypoint": "index.html",
  "permissions": [],
  "supported_languages": ["en"]
}
```

## Daily dev loop

```bash
# Terminal 1: Vite dev server with HMR
npm run dev
# → http://localhost:5173

# Terminal 2: Even Hub simulator pointed at the dev server
npm run simulate
# → opens a desktop window rendering the glasses display
```

Edits to `src/**/*.ts` hot-reload. The simulator picks up the new build automatically.

## Tests

```bash
# Unit tests (pure-logic; no SDK / simulator needed)
npx vitest run

# Watch mode while iterating on pagination or reducer logic
npx vitest
```

Coverage scope (v1):
- `src/reader/pagination.ts` — pagination correctness, edge cases.
- `src/reader/reader.ts` — state machine transitions.
- `src/reader/frames.ts` — frame composer purity and payload shape.
- `src/platform/persistence.ts` — read recovery, save failure surfacing.
- `src/ui/phone-status.ts` — state-to-text mapping (pure function).

## Hardware verification (post-arrival)

Once the G2 glasses arrive (~2026-05-21):

```bash
# In one terminal: Vite dev server bound to LAN IP
npm run dev -- --host 0.0.0.0

# In another terminal: generate a QR code
npx evenhub qr --url http://<your-lan-ip>:5173
```

Scan the QR with the Even Realities phone app. The dev build runs on real glasses with HMR. Run through the User Story 1 Independent Test from `spec.md`.

Capture:
- A screenshot or photo of every frame type (F-PAGE on a few pages, F-CLAMP, F-EOB).
- The R1 pagination measurements (do 48 chars actually fit one line? do 6 lines actually fit? is reading comfortable in peripheral vision?).
- The R3 flicker observation (10-minute uninterrupted reading session — any flicker, after-image, fatigue?).
- The R5 cold-start measurement (`performance.mark` timings on the bootstrap path; compare phone-menu launch vs. glasses-menu launch).

Update `spec.md` SC-002 / SC-001 numbers based on measurements; submit findings as a follow-on plan revision.

## Build & package

```bash
npm run build               # produces dist/
npx evenhub validate dist   # check the build
npx evenhub pack app.json dist -o evenBooks-0.1.0.ehpk
```

The `.ehpk` is the unit submitted to Even Hub.

## Repo conventions

- Branch: `001-ebook-reader` (current).
- Commit messages: imperative present tense; reference the FR or SC the change relates to where it adds clarity.
- The constitution at `.specify/memory/constitution.md` is the authority for design discipline. The plan at `specs/001-ebook-reader/plan.md` is the authority for v1 scope.
- New behavior beyond what the spec lists requires a spec amendment first (per Constitution Development Workflow → spec-driven methodology).

## Troubleshooting

| Symptom | First place to look |
|---|---|
| Simulator opens blank | Check `npm run dev` is running on :5173 and no firewall is blocking localhost |
| `createStartUpPageContainer` returns `1` (invalid) | Check `containerTotalNum` matches the actual array lengths and `isEventCapture: 1` is set on exactly one container |
| `createStartUpPageContainer` returns `2` (oversize) | A container exceeds the canvas; check x/y/width/height math |
| Page text wraps oddly | R1 — `CHARS_PER_LINE` may be too high for actual rendered glyph width on the simulator. Adjust the constant in `src/reader/pagination.ts` |
| Single press registers as double press (or vice versa) | R2 — turn on `DEBUG_GESTURES` and inspect the timing log |
| Position doesn't resume on reopen | R6 — check the phone-side notice channel for a recovery message; check `bridge.getLocalStorage` returns the expected JSON |
| `npm run simulate` errors with "no such command" | The simulator is in `devDependencies` but the `simulate` script is from the template — re-check `package.json` `scripts` block |

## Where to learn more (in this workspace)

- `C:\git\even\.claude\skills\evenhub-sdk\SKILL.md` — the comprehensive SDK skill.
- `C:\git\even\references\npm\even_hub_sdk-extracted\dist\index.d.ts` — the canonical type surface.
- `C:\git\even\docs\` — full mirror of `hub.evenrealities.com/docs`, in HTML and Markdown.
- `C:\git\even\official\evenhub-templates\` — the four official starter templates.
- `C:\git\even\official\everything-evenhub\skills\` — the official 12-skill Claude Code plugin (narrower per-task skills if you want them).
