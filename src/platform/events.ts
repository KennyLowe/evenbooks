/**
 * Event mapping: raw SDK events → semantic reader events.
 *
 * Per Phase 0 research R2: trust the SDK's CLICK / DOUBLE_CLICK distinction.
 * The DEBUG_GESTURES flag (on in dev builds) logs every received event with
 * timestamps so the gesture map can be revised on hardware evidence rather
 * than guessing.
 *
 * A small per-event-type debounce absorbs duplicate-firing observed on the
 * simulator (one button press emitting many events). The 150 ms window is
 * invisible to a human reading at one page per several seconds and is below
 * the minimum plausible gap between two intentional rapid presses (~250 ms).
 */

import { EvenAppBridge, OsEventTypeList } from "@evenrealities/even_hub_sdk";
import { Teardowns } from "./teardown";

export type SemanticEvent = "NEXT_PAGE" | "PREV_PAGE" | "EXIT";

const DEBUG_GESTURES = import.meta.env.DEV;
const DEBOUNCE_MS = 150;

export function wireEvents(
  bridge: EvenAppBridge,
  teardowns: Teardowns,
  dispatch: (e: SemanticEvent) => void,
): void {
  const lastDispatchAt: Record<SemanticEvent, number> = {
    NEXT_PAGE: 0,
    PREV_PAGE: 0,
    EXIT: 0,
  };

  const unsub = bridge.onEvenHubEvent((event) => {
    if (DEBUG_GESTURES) {
      // Log the entire event envelope so we can see whether the simulator
      // delivers gestures via textEvent, sysEvent, or both.
      console.debug(
        "[evenBooks] raw event @",
        performance.now().toFixed(1),
        {
          textEvent: event.textEvent,
          sysEvent: event.sysEvent,
          listEvent: event.listEvent,
          audioEvent: event.audioEvent ? "<audio>" : undefined,
        },
      );
    }

    // Inputs may arrive via either envelope depending on SDK / simulator
    // behavior. Check both. textEvent is canonical for a text-capture
    // container, but the simulator and the original SDK template's example
    // both indicate sysEvent is also a legitimate carrier for tap-style
    // input.
    const textType = event.textEvent?.eventType;
    const sysType = event.sysEvent?.eventType;
    const textEnvelope = event.textEvent !== undefined && event.textEvent !== null;
    const sysEnvelope = event.sysEvent !== undefined && event.sysEvent !== null;

    // Per the SDK quirk: protobuf omits the zero-value, so CLICK_EVENT (0)
    // arrives with eventType = undefined. Treat an envelope with no
    // eventType (and no other recognized type) as a CLICK regardless of
    // which envelope it came through.
    const looksLikeClick =
      textType === OsEventTypeList.CLICK_EVENT ||
      sysType === OsEventTypeList.CLICK_EVENT ||
      (textEnvelope && textType === undefined && sysType === undefined) ||
      (sysEnvelope && sysType === undefined && textType === undefined);

    let semantic: SemanticEvent | null = null;

    if (looksLikeClick) {
      semantic = "NEXT_PAGE";
    } else if (
      textType === OsEventTypeList.DOUBLE_CLICK_EVENT ||
      sysType === OsEventTypeList.DOUBLE_CLICK_EVENT
    ) {
      semantic = "PREV_PAGE";
    } else if (
      textType === OsEventTypeList.SCROLL_BOTTOM_EVENT ||
      sysType === OsEventTypeList.SCROLL_BOTTOM_EVENT
    ) {
      semantic = "EXIT";
    }

    if (semantic === null) {
      // SCROLL_TOP, IMU, audio, foreground/exit lifecycle, etc. — not part
      // of v1's input vocabulary. Ignore quietly.
      return;
    }

    const now = performance.now();
    if (now - lastDispatchAt[semantic] < DEBOUNCE_MS) {
      if (DEBUG_GESTURES) {
        console.debug(
          "[evenBooks] debounced",
          semantic,
          "(",
          (now - lastDispatchAt[semantic]).toFixed(0),
          "ms since last)",
        );
      }
      return;
    }
    lastDispatchAt[semantic] = now;

    if (DEBUG_GESTURES) {
      console.debug("[evenBooks] dispatch", semantic);
    }
    dispatch(semantic);
  });

  teardowns.add(unsub);
}
