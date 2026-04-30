/**
 * evenBooks bootstrap.
 *
 * Sequence (per plan.md Constitution Check evidence):
 *   1. Mount the phone-side status UI.
 *   2. Wait for the SDK bridge.
 *   3. Paginate the bundled sample text.
 *   4. Read the saved position; surface any recovery notice.
 *   5. Create the single startup container.
 *   6. Render the initial page.
 *   7. Wire input events and connection observer; drive the reducer.
 *   8. On reconnect, re-issue the current frame (idempotent).
 *
 * Constitution Principle V: any failure surfaces; nothing silent.
 */

import {
  CreateStartUpPageContainer,
  OsEventTypeList,
  StartUpPageCreateResult,
} from "@evenrealities/even_hub_sdk";

import { SAMPLE_BOOK } from "./content/sample-text";
import { paginate } from "./reader/pagination";
import { STARTUP_CONTAINER, pageFrame } from "./reader/frames";
import {
  reduce,
  type Event as ReaderEvent,
  type ReaderState,
} from "./reader/reader";
import { initBridge } from "./platform/bridge";
import { Teardowns } from "./platform/teardown";
import { createNoticeChannel } from "./platform/errors";
import { observeConnection } from "./platform/connection";
import { wireEvents } from "./platform/events";
import { readPosition, writePosition } from "./platform/persistence";
import { mountPhoneStatus } from "./ui/phone-status";

async function bootstrap(): Promise<void> {
  // Phone-side glue first so failures have somewhere to surface.
  const teardowns = new Teardowns();
  const noticeChannel = createNoticeChannel();

  // Pre-paginate so we can show a meaningful "Page 1 of N" before the
  // bridge resolves.
  const pages = paginate(SAMPLE_BOOK.text);
  if (pages.length === 0) {
    throw new Error("evenBooks: bundled sample text paginated to zero pages");
  }

  const phoneUI = mountPhoneStatus(SAMPLE_BOOK, pages.length);
  noticeChannel.subscribe((notice) => phoneUI.showNotice(notice));

  // Connect to the bridge.
  const { bridge } = await initBridge(teardowns);

  // Read saved position.
  const readResult = await readPosition(
    bridge,
    SAMPLE_BOOK.id,
    pages.length,
  );
  let startPage = 0;
  if (readResult.kind === "resumed") {
    startPage = readResult.page;
  } else if (readResult.kind === "recovered") {
    noticeChannel.emit({ kind: "recovery", reason: readResult.reason });
  }

  // Create the single startup container.
  const startupResult = await bridge.createStartUpPageContainer(
    new CreateStartUpPageContainer({
      containerTotalNum: 1,
      textObject: [STARTUP_CONTAINER],
    }),
  );
  if (startupResult !== StartUpPageCreateResult.success) {
    throw new Error(
      `evenBooks: createStartUpPageContainer failed with code ${startupResult}`,
    );
  }

  // Initial render.
  await bridge.textContainerUpgrade(pageFrame(pages[startPage]));

  // Initial reader state.
  let state: ReaderState = {
    book: SAMPLE_BOOK,
    pages,
    mode: { kind: "reading", pageIndex: startPage },
    connection: "connected",
  };
  phoneUI.update({
    connection: state.connection,
    book: SAMPLE_BOOK,
    pageIndex: startPage,
    totalPages: pages.length,
  });

  // Connection observer: phone UI mirrors connection state. On reconnect
  // (transition to 'connected'), re-issue the current frame (idempotent).
  let prevConnection = state.connection;
  observeConnection(bridge, teardowns, (next) => {
    state = { ...state, connection: next };
    phoneUI.update({
      connection: next,
      book: SAMPLE_BOOK,
      pageIndex: currentPageIndex(state),
      totalPages: pages.length,
    });
    if (next === "connected" && prevConnection !== "connected") {
      void dispatch({ kind: "RECONNECT" });
    }
    prevConnection = next;
  });

  // Clamp-flash timer: when in clamp-flash mode, schedule a TIMER_EXPIRED
  // dispatch at flashUntil. Re-armed each time we enter clamp-flash.
  let clampTimer: ReturnType<typeof setTimeout> | null = null;
  function armClampTimer() {
    if (clampTimer !== null) {
      clearTimeout(clampTimer);
      clampTimer = null;
    }
    if (state.mode.kind !== "clamp-flash") return;
    const remaining = Math.max(0, state.mode.flashUntil - Date.now());
    clampTimer = setTimeout(() => {
      clampTimer = null;
      void dispatch({ kind: "TIMER_EXPIRED" });
    }, remaining);
  }

  // Dispatcher: feeds events into the reducer and applies side effects.
  // Holds back NEXT_PAGE/PREV_PAGE/EXIT during clamp-flash (the reducer
  // contract says these would be no-ops in that mode).
  async function dispatch(event: ReaderEvent): Promise<void> {
    if (state.mode.kind === "clamp-flash" && typeof event === "string") {
      // Drop user events during clamp-flash. The flash is short and
      // explicit; queueing would invite double-presses to skip pages
      // unexpectedly.
      return;
    }

    // Capture the page index the user was on BEFORE the transition. We need
    // it for "Reader closed (was on page X)" — the post-transition `state`
    // has mode `exiting` which has lost that information.
    const priorPageIndex = currentPageIndex(state);

    const result = reduce(state, event);
    state = result.next;

    if (result.render) {
      try {
        await bridge.textContainerUpgrade(result.render);
      } catch (e) {
        console.error("[evenBooks] textContainerUpgrade failed:", e);
      }
    }

    if (result.persist) {
      void writePosition(bridge, noticeChannel, result.persist);
    }

    if (result.exit) {
      phoneUI.showClosed(priorPageIndex, pages.length);
      teardowns.runAll();
      try {
        await bridge.shutDownPageContainer(0);
      } catch (e) {
        console.error("[evenBooks] shutDownPageContainer failed:", e);
      }
      return;
    }

    phoneUI.update({
      connection: state.connection,
      book: SAMPLE_BOOK,
      pageIndex: currentPageIndex(state),
      totalPages: pages.length,
    });

    if (state.mode.kind === "clamp-flash") {
      armClampTimer();
    }
  }

  // Wire raw SDK events → semantic events → reducer.
  wireEvents(bridge, teardowns, (e) => {
    void dispatch(e);
  });

  // Foreground/exit lifecycle: surface ABNORMAL_EXIT and run teardown on
  // SYSTEM_EXIT. These come through the same onEvenHubEvent stream as
  // textEvent, but on the sysEvent branch.
  const lifecycleUnsub = bridge.onEvenHubEvent((event) => {
    const sysType = event.sysEvent?.eventType;
    if (
      sysType === OsEventTypeList.SYSTEM_EXIT_EVENT ||
      sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT
    ) {
      teardowns.runAll();
    }
  });
  teardowns.add(lifecycleUnsub);
}

function currentPageIndex(state: ReaderState): number {
  switch (state.mode.kind) {
    case "reading":
    case "clamp-flash":
      return state.mode.pageIndex;
    case "end-of-book":
      return state.pages.length - 1;
    case "exiting":
      return state.pages.length - 1;
  }
}

bootstrap().catch((e) => {
  console.error("[evenBooks] bootstrap failed:", e);
  // Best-effort: write the failure to the phone status DOM if it exists.
  const root = document.querySelector<HTMLElement>(".connection");
  if (root) {
    root.textContent = "Failed to start; check console.";
    root.dataset.state = "not-connected";
  }
});
