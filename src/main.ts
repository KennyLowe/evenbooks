/**
 * evenBooks v2 bootstrap.
 *
 * Sequence (per plan.md Constitution Check evidence + tasks T029):
 *   1. Mount phone-side UI: phone-status, library view, import flow.
 *   2. Wait for the SDK bridge.
 *   3. Run v1 → v2 migration if needed (silent on success; notice on failure).
 *   4. Load library; bootstrap with sample if empty.
 *   5. Render library view.
 *   6. Wire import-flow → import pipeline → state update → re-render.
 *   7. Wire library tap → load content → enter v1 read loop.
 *   8. Branch on launch source: glassesMenu → auto-open most-recent;
 *      appMenu → stay in library view.
 *   9. On reader exit, run teardowns and shutDownPageContainer; library
 *      view remains visible on the phone.
 *
 * Constitution Principle V: any failure surfaces; nothing silent.
 */

import {
  CreateStartUpPageContainer,
  OsEventTypeList,
  StartUpPageCreateResult,
} from "@evenrealities/even_hub_sdk";

import { SAMPLE_BOOK, type Book, type BookId } from "./content/sample-text";
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
import { mountLibraryView } from "./ui/library-view";
import { mountImportFlow } from "./ui/import-flow";
import {
  addEntry,
  bootstrapWithSample,
  emptyLibrary,
  findEntry,
  loadLibrary,
  markOpened,
  saveLibrary,
  type Library,
} from "./library/library";
import { migrateV1IfNeeded } from "./platform/persistence-v2-migration";
import { importFile } from "./import/import-pipeline";
import { getBookContent } from "./platform/book-store";
import { DUPLICATE_MESSAGE, failureMessage } from "./import/outcomes";

async function bootstrap(): Promise<void> {
  // 1. Phone-side UI mounts first so failures have somewhere to surface.
  const teardowns = new Teardowns();
  const noticeChannel = createNoticeChannel();

  const samplePagesPreview = paginate(SAMPLE_BOOK.text);
  const phoneStatus = mountPhoneStatus(SAMPLE_BOOK, samplePagesPreview.length);
  noticeChannel.subscribe((notice) => phoneStatus.showNotice(notice));

  const importFlow = mountImportFlow((file) => {
    void handleFileImport(file);
  });

  let library: Library = emptyLibrary();
  const libraryView = mountLibraryView((id) => {
    console.debug("[evenBooks] library tap →", id);
    openBook(id).catch((e) => {
      console.error("[evenBooks] openBook threw:", e);
    });
  });

  // 2. Connect to the SDK bridge.
  const { bridge, launchSource } = await initBridge(teardowns);

  // Once the bridge resolves, treat the connection as "connected" until we
  // hear otherwise from onDeviceStatusChanged. The simulator does not
  // simulate connection-state events at all, so without this default the
  // chip would show "Connecting…" forever.
  {
    const root = document.querySelector<HTMLElement>(".connection");
    if (root) {
      root.textContent = "Glasses connected";
      root.dataset.state = "connected";
    }
  }

  // 3. Migrate v1 → v2 if the v1 key is present.
  const sampleTotalPages = samplePagesPreview.length;

  const loaded = await loadLibrary(bridge, noticeChannel);
  library = loaded.library;
  if (library.entries.length === 0) {
    library = bootstrapWithSample(sampleTotalPages, Date.now());
    await saveLibrary(bridge, noticeChannel, library);
  }

  const migration = await migrateV1IfNeeded(
    bridge,
    noticeChannel,
    library,
    sampleTotalPages,
  );
  library = migration.library;

  // 4. Render the library now that it's settled.
  libraryView.renderEntries(library);

  // Active reader-session state (null when no book is open on the glasses).
  let activeState: ReaderState | null = null;
  let prevConnection: "connected" | "connecting" | "not-connected" = "connected";
  let clampTimer: ReturnType<typeof setTimeout> | null = null;
  let hasContainer = false;

  // Connection observer.
  observeConnection(bridge, teardowns, (next) => {
    if (activeState) {
      activeState = { ...activeState, connection: next };
      phoneStatus.update({
        connection: next,
        book: activeState.book,
        pageIndex: currentPageIndex(activeState),
        totalPages: activeState.pages.length,
      });
    } else {
      // No active book — still update the connection chip in the header.
      const root = document.querySelector<HTMLElement>(".connection");
      if (root) {
        root.textContent =
          next === "connected"
            ? "Glasses connected"
            : next === "connecting"
              ? "Connecting…"
              : "Glasses not connected";
        root.dataset.state = next;
      }
    }
    if (next === "connected" && prevConnection !== "connected" && activeState) {
      void dispatch({ kind: "RECONNECT" });
    }
    prevConnection = next;
  });

  // Lifecycle teardown on SYSTEM_EXIT / ABNORMAL_EXIT.
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

  // Wire glasses-side events into the reducer (only fires when a reader is active).
  wireEvents(bridge, teardowns, (e) => {
    if (!activeState) return;
    void dispatch(e);
  });

  // 5. Branch on launch source.
  const source = await launchSource;
  if (source === "glassesMenu") {
    // Resume the most-recently-opened book; fall back to sample if none.
    const mostRecent = pickMostRecentlyOpened(library);
    if (mostRecent) {
      await openBook(mostRecent.id);
    } else {
      await openBook("sample");
    }
  }
  // appMenu: stay in library view; user picks a book by tapping.

  // ===== Helpers =====

  async function handleFileImport(file: File): Promise<void> {
    importFlow.hideError();
    importFlow.showProgress(file.name);
    try {
      const outcome = await importFile(file, library, noticeChannel);
      if (outcome.kind === "success") {
        library = addEntry(library, outcome.entry);
        await saveLibrary(bridge, noticeChannel, library);
        libraryView.renderEntries(library);
      } else if (outcome.kind === "duplicate") {
        // Bump the existing entry's addedAt so it sorts to the top.
        library = addEntry(library, {
          ...outcome.existingEntry,
          addedAt: Date.now(),
        });
        await saveLibrary(bridge, noticeChannel, library);
        libraryView.renderEntries(library);
        importFlow.showError(DUPLICATE_MESSAGE);
      } else {
        importFlow.showError(failureMessage(outcome.reason));
      }
    } finally {
      importFlow.hideProgress();
    }
  }

  async function openBook(id: BookId): Promise<void> {
    console.debug("[evenBooks] openBook", id);
    importFlow.hideError();

    const entry = findEntry(library, id);
    if (!entry) {
      console.warn("[evenBooks] openBook: no entry for id", id);
      noticeChannel.emit({ kind: "recovery", reason: "wrong-book" });
      return;
    }

    const stored = await getBookContent(id);
    if (!stored) {
      console.warn("[evenBooks] openBook: no content for id", id);
      libraryView.markEvicted(id);
      // Surface a notice via the transient channel rather than the inline error slot.
      // Re-using the recovery shape since this is a content-availability recovery.
      noticeChannel.emit({ kind: "recovery", reason: "unparseable" });
      return;
    }
    console.debug("[evenBooks] openBook: loaded content, pages=", stored.pages.length);

    // Mark opened, persist, re-render.
    library = markOpened(library, id, Date.now());
    await saveLibrary(bridge, noticeChannel, library);
    libraryView.renderEntries(library);

    const book: Book = {
      id,
      title: entry.title,
      author: entry.author,
      format: entry.format,
      text: stored.text,
    };
    const pages = stored.pages.map((text, i) => ({
      index: i,
      text,
      isFirst: i === 0,
      isLast: i === stored.pages.length - 1,
    }));

    // Read saved position for this book.
    const positionResult = await readPosition(bridge, id, pages.length);
    let startPage = 0;
    if (positionResult.kind === "resumed") {
      startPage = positionResult.page;
    } else if (positionResult.kind === "recovered") {
      noticeChannel.emit({ kind: "recovery", reason: positionResult.reason });
    }

    // Create the startup container if not yet, otherwise rebuild.
    if (!hasContainer) {
      const result = await bridge.createStartUpPageContainer(
        new CreateStartUpPageContainer({
          containerTotalNum: 1,
          textObject: [STARTUP_CONTAINER],
        }),
      );
      if (result !== StartUpPageCreateResult.success) {
        console.error("[evenBooks] createStartUpPageContainer failed:", result);
        return;
      }
      hasContainer = true;
    }

    // Initial render.
    console.debug("[evenBooks] openBook: rendering page", startPage, "of", pages.length, "for", id);
    try {
      await bridge.textContainerUpgrade(pageFrame(pages[startPage]));
      console.debug("[evenBooks] openBook: textContainerUpgrade OK");
    } catch (e) {
      console.error("[evenBooks] openBook: textContainerUpgrade failed:", e);
    }

    activeState = {
      book,
      pages,
      mode: { kind: "reading", pageIndex: startPage },
      connection: prevConnection,
    };
    phoneStatus.update({
      connection: activeState.connection,
      book,
      pageIndex: startPage,
      totalPages: pages.length,
    });
    phoneStatus.showReading();
  }

  function armClampTimer(): void {
    if (clampTimer !== null) {
      clearTimeout(clampTimer);
      clampTimer = null;
    }
    if (!activeState || activeState.mode.kind !== "clamp-flash") return;
    const remaining = Math.max(0, activeState.mode.flashUntil - Date.now());
    clampTimer = setTimeout(() => {
      clampTimer = null;
      void dispatch({ kind: "TIMER_EXPIRED" });
    }, remaining);
  }

  async function dispatch(event: ReaderEvent): Promise<void> {
    if (!activeState) return;
    if (activeState.mode.kind === "clamp-flash" && typeof event === "string") {
      return;
    }

    const priorPageIndex = currentPageIndex(activeState);
    const result = reduce(activeState, event);
    activeState = result.next;

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
      const totalPages = activeState.pages.length;
      phoneStatus.showClosed(priorPageIndex, totalPages);
      phoneStatus.hideReading();
      try {
        await bridge.shutDownPageContainer(0);
      } catch (e) {
        console.error("[evenBooks] shutDownPageContainer failed:", e);
      }
      hasContainer = false;
      activeState = null;
      return;
    }

    phoneStatus.update({
      connection: activeState.connection,
      book: activeState.book,
      pageIndex: currentPageIndex(activeState),
      totalPages: activeState.pages.length,
    });

    if (activeState.mode.kind === "clamp-flash") {
      armClampTimer();
    }
  }
}

function currentPageIndex(state: ReaderState): number {
  switch (state.mode.kind) {
    case "reading":
    case "clamp-flash":
      return state.mode.pageIndex;
    case "end-of-book":
    case "exiting":
      return state.pages.length - 1;
  }
}

function pickMostRecentlyOpened(library: Library) {
  // Library is sorted most-recent-action first; the first entry with a
  // non-null lastOpenedAt is the answer.
  for (const entry of library.entries) {
    if (entry.lastOpenedAt !== null) return entry;
  }
  return null;
}

bootstrap().catch((e) => {
  console.error("[evenBooks] bootstrap failed:", e);
  const root = document.querySelector<HTMLElement>(".connection");
  if (root) {
    root.textContent = "Failed to start; check console.";
    root.dataset.state = "not-connected";
  }
});
