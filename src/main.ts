/**
 * evenBooks v3 bootstrap.
 *
 * Sequence:
 *   1. Mount phone-side UI: phone-status, library view (with delete + sort +
 *      filter), import flow.
 *   2. Wait for the SDK bridge.
 *   3. Run v1 → v2 migration if needed (silent on success; notice on failure).
 *   4. Load library + settings; bootstrap with sample if empty.
 *   5. Render library view (filter + sort applied).
 *   6. Wire import-flow → import pipeline → state update → re-render.
 *   7. Wire library tap → load content → enter v1 read loop.
 *   8. Wire delete → confirm overlay → orchestrator → re-render.
 *   9. Wire sort change → save settings → re-render.
 *  10. Wire filter input → re-render (per-session, not persisted).
 *  11. Branch on launch source: glassesMenu → auto-open most-recent;
 *      appMenu → stay in library view.
 *  12. On reader exit, run teardowns and shutDownPageContainer.
 *
 * Constitution Principle V: any failure surfaces; nothing silent.
 */

import {
  CreateStartUpPageContainer,
  OsEventTypeList,
  StartUpPageCreateResult,
} from "@evenrealities/even_hub_sdk";

import { SAMPLE_BOOK, type Book, type BookId } from "./content/sample-text";
import { paginate, type PaginateOptions } from "./reader/pagination";
import { readDevOverrides, resetAllStorage } from "./platform/dev-overrides";
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
import { confirmDelete } from "./ui/delete-confirm";
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
import { comparatorFor, type LibraryEntry } from "./library/library-entry";
import {
  loadSettings,
  saveSettings,
  type LibrarySettings,
  type SortOption,
} from "./library/library-settings";
import { applyFilter } from "./library/library-filter";
import { migrateV1IfNeeded } from "./platform/persistence-v2-migration";
import { importFile } from "./import/import-pipeline";
import { getBookContent } from "./platform/book-store";
import { deleteBook } from "./platform/delete-book";
import { DUPLICATE_MESSAGE, failureMessage } from "./import/outcomes";

async function bootstrap(): Promise<void> {
  // 1. Phone-side UI mounts first so failures have somewhere to surface.
  const teardowns = new Teardowns();
  const noticeChannel = createNoticeChannel();

  // Dev-only URL query overrides (?reset, ?lines=N, ?chars=M).
  const overrides = readDevOverrides();
  const paginateOpts: PaginateOptions = {
    ...(overrides.charsPerLine !== null && {
      charsPerLine: overrides.charsPerLine,
    }),
    ...(overrides.linesPerPage !== null && {
      linesPerPage: overrides.linesPerPage,
    }),
  };

  const samplePagesPreview = paginate(SAMPLE_BOOK.text, paginateOpts);
  const phoneStatus = mountPhoneStatus(SAMPLE_BOOK, samplePagesPreview.length);
  noticeChannel.subscribe((notice) => phoneStatus.showNotice(notice));

  const importFlow = mountImportFlow((file) => {
    void handleFileImport(file);
  });

  let library: Library = emptyLibrary();
  let settings: LibrarySettings = { version: 3, sort: "most-recent" };
  let filterQuery = "";

  // Per-book progress cache for the "most-completed" comparator.
  const progressCache = new Map<BookId, number>();

  const libraryView = mountLibraryView({
    onTap: (id) => {
      openBook(id).catch((e) => {
        console.error("[evenBooks] openBook threw:", e);
      });
    },
    onDelete: (id) => {
      void handleDelete(id);
    },
    onSortChange: (option) => {
      void handleSortChange(option);
    },
    onFilterChange: (query) => {
      filterQuery = query;
      renderLibrary();
    },
  });

  // 2. Connect to the SDK bridge.
  const { bridge, launchSource } = await initBridge(teardowns);

  // Dev-only: ?reset wipes all storage before any read happens.
  if (overrides.reset) {
    await resetAllStorage(bridge);
  }

  // Once the bridge resolves, treat the connection as "connected" until we
  // hear otherwise from onDeviceStatusChanged. The simulator doesn't
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

  // 4. Load v3 settings (sort preference). Recovery on failure surfaces a notice.
  settings = await loadSettings(bridge, noticeChannel);
  libraryView.setSort(settings.sort);

  // Pre-populate the progress cache for any entry that has a saved position.
  // This is best-effort and async; the most-completed sort treats missing
  // entries as 0 progress until the load completes.
  for (const entry of library.entries) {
    void loadProgressIntoCache(entry);
  }

  // 5. Render the library now that it's settled.
  renderLibrary();

  // Active reader-session state (null when no book is open on the glasses).
  let activeState: ReaderState | null = null;
  let prevConnection: "connected" | "connecting" | "not-connected" =
    "connected";
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

  // 6. Branch on launch source.
  const source = await launchSource;
  if (source === "glassesMenu") {
    const mostRecent = pickMostRecentlyOpened(library);
    if (mostRecent) {
      await openBook(mostRecent.id);
    } else {
      await openBook("sample");
    }
  }

  // ===== Helpers =====

  function renderLibrary(): void {
    const sorted = [...library.entries].sort(
      comparatorFor(settings.sort, (id) => progressCache.get(id) ?? null),
    );
    const visible = applyFilter(sorted, filterQuery);
    libraryView.renderEntries(visible, library.entries.length, filterQuery);
  }

  async function loadProgressIntoCache(entry: LibraryEntry): Promise<void> {
    if (entry.lastOpenedAt === null) return;
    try {
      const result = await readPosition(bridge, entry.id, entry.totalPages);
      if (result.kind === "resumed") {
        progressCache.set(entry.id, result.page);
      }
    } catch {
      /* best-effort — sort treats unknowns as 0 */
    }
  }

  async function handleFileImport(file: File): Promise<void> {
    importFlow.hideError();
    importFlow.showProgress(file.name);
    try {
      const outcome = await importFile(file, library, noticeChannel);
      if (outcome.kind === "success") {
        library = addEntry(library, outcome.entry);
        await saveLibrary(bridge, noticeChannel, library);
        // If the active filter would hide the new entry, surface a notice.
        const wouldShow = applyFilter([outcome.entry], filterQuery).length > 0;
        renderLibrary();
        if (filterQuery.trim().length > 0 && !wouldShow) {
          // Reuse the recovery channel for "informational about state we
          // just changed" — short, transient, doesn't block.
          noticeChannel.emit({
            kind: "recovery",
            reason: "wrong-book",
          });
        }
      } else if (outcome.kind === "duplicate") {
        library = addEntry(library, {
          ...outcome.existingEntry,
          addedAt: Date.now(),
        });
        await saveLibrary(bridge, noticeChannel, library);
        renderLibrary();
        importFlow.showError(DUPLICATE_MESSAGE);
      } else {
        importFlow.showError(failureMessage(outcome.reason));
      }
    } finally {
      importFlow.hideProgress();
    }
  }

  async function handleDelete(id: BookId): Promise<void> {
    const entry = findEntry(library, id);
    if (!entry) return;

    if (id === "sample") {
      // Sample is undeletable — surface a brief explanation and stop.
      importFlow.showError("The bundled sample can't be removed.");
      return;
    }

    const confirmed = await confirmDelete({ title: entry.title });
    if (!confirmed) return;

    const outcome = await deleteBook({
      id,
      bridge,
      channel: noticeChannel,
      library,
      exitActiveReaderIfMatching: async (target) => {
        if (activeState && activeState.book.id === target) {
          // Drive the reader through a clean exit before storage cleanup.
          await dispatch("EXIT");
        }
      },
    });

    if (outcome.kind === "deleted") {
      library = outcome.library;
      progressCache.delete(id);
      renderLibrary();
    } else if (outcome.kind === "refused") {
      // Shouldn't reach here for sample (we short-circuited above), but
      // defend anyway.
      importFlow.showError("The bundled sample can't be removed.");
    }
    // outcome.kind === "failed" → the orchestrator already surfaced the
    // save-failed notice; library is unchanged; no re-render needed.
  }

  async function handleSortChange(option: SortOption): Promise<void> {
    settings = { ...settings, sort: option };
    await saveSettings(bridge, noticeChannel, settings);
    renderLibrary();
  }

  async function openBook(id: BookId): Promise<void> {
    importFlow.hideError();

    const entry = findEntry(library, id);
    if (!entry) {
      noticeChannel.emit({ kind: "recovery", reason: "wrong-book" });
      return;
    }

    const stored = await getBookContent(id, paginateOpts);
    if (!stored) {
      libraryView.markEvicted(id);
      noticeChannel.emit({ kind: "recovery", reason: "unparseable" });
      return;
    }

    library = markOpened(library, id, Date.now());
    await saveLibrary(bridge, noticeChannel, library);
    renderLibrary();

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

    const positionResult = await readPosition(bridge, id, pages.length);
    let startPage = 0;
    if (positionResult.kind === "resumed") {
      startPage = positionResult.page;
      progressCache.set(id, positionResult.page);
    } else if (positionResult.kind === "recovered") {
      noticeChannel.emit({ kind: "recovery", reason: positionResult.reason });
    }

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

    try {
      await bridge.textContainerUpgrade(pageFrame(pages[startPage]));
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
      progressCache.set(result.persist.book, result.persist.page);
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
