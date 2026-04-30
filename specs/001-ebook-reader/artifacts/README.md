# v1 baseline artifacts

This directory holds evidence that the v1 build passed Phase 3c (simulator validation, `tasks.md` T024) and is ready for hardware-validation when the G2 glasses arrive (~2026-05-21).

## Required artifacts (T024)

Place the following PNG (or JPG) files in `v1-baseline-screenshots/`:

| File | What it shows |
|---|---|
| `01-page-mid-book.png` | A normal reading frame from the middle of the sample text on the simulator's glasses display (showing 6 lines of body text, no chrome). |
| `02-page-first.png` | The first page (page 1) on the simulator. |
| `03-clamp-flash.png` | The transient first-page-clamp indicator triggered by double-pressing while on page 1 (showing "↑ start of book" above the page text). |
| `04-end-of-book.png` | The end-of-book frame after pressing past the final page (showing 'End of "The Tell-Tale Heart". Press to exit.'). |
| `05-phone-status-connected.png` | The phone-side WebView showing `Glasses connected` + book title + author + `Page X of N`. |
| `06-phone-status-disconnected.png` | (Optional but recommended) the phone-side WebView with the simulator disconnected, showing `Glasses not connected`. |

## Validation procedure (T024)

From `C:\git\even\evenBooks\`, in two terminals:

```bash
# Terminal 1
npm run dev

# Terminal 2
npm run simulate
```

Walk through User Story 1's Independent Test (`spec.md`):

1. **Launch.** First page (or last-saved page) renders on the simulator's glasses display within ~2 s. Capture `02-page-first.png` if this is the first ever launch.
2. **Advance.** Single-press your way through several pages. Capture `01-page-mid-book.png` from any mid-book page.
3. **Retreat.** Double-press to go back. Verify the previous page renders.
4. **First-page clamp.** Navigate back to page 1, then double-press once more. Capture `03-clamp-flash.png` while the indicator is visible (~1 s window). The indicator should auto-clear and the plain page reappear.
5. **End-of-book.** Single-press through to the final page, then once more. Capture `04-end-of-book.png` showing the dedicated end-of-book frame.
6. **Exit-from-end.** Single-press from the end-of-book frame. Verify the simulator returns to its app menu.
7. **Resume.** Re-run `npm run simulate` (or relaunch in the simulator). Verify the reader resumes on the page you exited from.
8. **Swipe-down exit (mid-book).** Re-launch, advance to any mid-book page, then swipe down. Verify clean exit; relaunch and verify resume on the mid-book page.
9. **Phone-side UI.** Capture `05-phone-status-connected.png` showing the phone-side surface during normal reading. Optionally simulate a disconnect and capture `06-phone-status-disconnected.png`.
10. **30-minute soak.** Read for 30 continuous minutes (or close enough to qualify) without lost input or position drift. Note any anomalies in `notes.md` in this directory.

If anything diverges from the spec's Acceptance Scenarios or Success Criteria, file a follow-on plan revision before declaring v1 dev-complete.

## Hardware-validation handoff (post-2026-05-21)

When the glasses arrive, repeat the procedure above on real hardware. Add a parallel `v1-hardware-screenshots/` directory and a `hardware-notes.md` capturing:

- Subjective flicker over a 10-minute reading session (R3).
- Whether 48 chars × 6 lines is actually comfortable peripheral-vision typography (R1) — if not, propose new constants.
- Any cases where single-press registered as double-press or vice versa (R2).
- Cold-start time from glasses-menu launch vs. phone-app launch (R5).

The provisional numbers in `spec.md` Success Criteria and `research.md` R1 get tightened in a follow-on plan revision based on those measurements.
