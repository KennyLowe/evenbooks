import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteBook } from "../../src/platform/delete-book";
import {
  addEntry,
  bootstrapWithSample,
  emptyLibrary,
  type Library,
} from "../../src/library/library";
import {
  _clearTombstonesForTests,
  isTombstoned,
  positionKeyFor,
  writePosition,
} from "../../src/platform/persistence";
import {
  _resetForTests,
  getBookContent,
  putBookContent,
} from "../../src/platform/book-store";
import { createNoticeChannel } from "../../src/platform/errors";
import type { LibraryEntry } from "../../src/library/library-entry";

interface Store {
  [key: string]: string;
}

function fakeBridge(initial: Store = {}) {
  const store: Store = { ...initial };
  return {
    setLocalStorage: vi.fn(async (key: string, value: string) => {
      store[key] = value;
      return true;
    }),
    getLocalStorage: vi.fn(async (key: string) => store[key] ?? ""),
    _store: store,
  };
}

function importedEntry(id: string): LibraryEntry {
  return {
    id,
    title: "Imported",
    author: "Author",
    format: "epub",
    addedAt: 1_000,
    lastOpenedAt: null,
    totalPages: 50,
  };
}

const noopExit = async (_id: string) => {};

beforeEach(() => {
  _clearTombstonesForTests();
  _resetForTests();
});

afterEach(() => {
  _clearTombstonesForTests();
});

describe("deleteBook — happy path", () => {
  it("removes the entry, clears the position key, deletes IndexedDB content", async () => {
    const bridge = fakeBridge();
    const channel = createNoticeChannel();
    const id = "abc1234567890def";

    // Pre-populate IndexedDB with a content record.
    await putBookContent({
      id,
      text: "body",
      pages: ["page1"],
      storedAt: 1,
    });
    bridge._store[positionKeyFor(id)] = JSON.stringify({
      book: id,
      page: 5,
      savedAt: 1,
    });
    let library: Library = bootstrapWithSample(45, 1);
    library = addEntry(library, importedEntry(id));

    const out = await deleteBook({
      id,
      bridge: bridge as never,
      channel,
      library,
      exitActiveReaderIfMatching: noopExit,
    });

    expect(out.kind).toBe("deleted");
    if (out.kind === "deleted") {
      expect(out.library.entries.find((e) => e.id === id)).toBeUndefined();
    }
    // Position key cleared (set to empty string by the orchestrator).
    expect(bridge._store[positionKeyFor(id)]).toBe("");
    // IndexedDB content gone.
    expect(await getBookContent(id)).toBeNull();
  });
});

describe("deleteBook — sample is undeletable", () => {
  it("returns refused without touching storage", async () => {
    const bridge = fakeBridge();
    const channel = createNoticeChannel();
    const library = bootstrapWithSample(45, 1);

    const out = await deleteBook({
      id: "sample",
      bridge: bridge as never,
      channel,
      library,
      exitActiveReaderIfMatching: noopExit,
    });

    expect(out).toEqual({ kind: "refused", reason: "sample-undeletable" });
    // Bridge was never called.
    expect(bridge.setLocalStorage).not.toHaveBeenCalled();
  });
});

describe("deleteBook — library write failure", () => {
  it("returns failed and leaves the library unchanged when saveLibrary throws", async () => {
    const bridge = {
      setLocalStorage: vi.fn().mockRejectedValue(new Error("disk full")),
      getLocalStorage: vi.fn(),
    };
    const channel = createNoticeChannel();
    const id = "abc1234567890def";
    let library: Library = emptyLibrary();
    library = addEntry(library, importedEntry(id));

    const out = await deleteBook({
      id,
      bridge: bridge as never,
      channel,
      library,
      exitActiveReaderIfMatching: noopExit,
    });

    expect(out.kind).toBe("failed");
    if (out.kind === "failed") {
      expect(out.reason).toBe("library-write-failed");
      // Library returned unchanged.
      expect(out.library.entries.some((e) => e.id === id)).toBe(true);
    }
  });
});

describe("deleteBook — tombstone behavior", () => {
  it("inserts a tombstone for the deleted id and absorbs in-flight writes", async () => {
    const bridge = fakeBridge();
    const channel = createNoticeChannel();
    const id = "abc1234567890def";
    let library: Library = emptyLibrary();
    library = addEntry(library, importedEntry(id));

    await deleteBook({
      id,
      bridge: bridge as never,
      channel,
      library,
      exitActiveReaderIfMatching: noopExit,
    });

    expect(isTombstoned(id)).toBe(true);

    // Now simulate an in-flight writePosition that was racing the delete.
    const callsBefore = bridge.setLocalStorage.mock.calls.length;
    await writePosition(bridge as never, channel, {
      book: id,
      page: 7,
      savedAt: 999,
    });
    const callsAfter = bridge.setLocalStorage.mock.calls.length;

    // The write was silently dropped — no additional bridge call.
    expect(callsAfter).toBe(callsBefore);
  });
});

describe("deleteBook — exit active reader", () => {
  it("awaits exitActiveReaderIfMatching before storage cleanup", async () => {
    const bridge = fakeBridge();
    const channel = createNoticeChannel();
    const id = "abc1234567890def";
    let library: Library = emptyLibrary();
    library = addEntry(library, importedEntry(id));

    const order: string[] = [];
    const exitFn = async (matchId: string) => {
      order.push("exit-start:" + matchId);
      await Promise.resolve();
      order.push("exit-end:" + matchId);
    };
    // Wrap setLocalStorage so we can record when it's called.
    const wrappedBridge = {
      ...bridge,
      setLocalStorage: vi.fn(async (key: string, value: string) => {
        order.push("setLocalStorage:" + key);
        return bridge.setLocalStorage(key, value);
      }),
    };

    await deleteBook({
      id,
      bridge: wrappedBridge as never,
      channel,
      library,
      exitActiveReaderIfMatching: exitFn,
    });

    // exit-end must precede the first setLocalStorage call (the library
    // write).
    const exitEndIdx = order.indexOf("exit-end:" + id);
    const firstSetIdx = order.findIndex((s) =>
      s.startsWith("setLocalStorage:"),
    );
    expect(exitEndIdx).toBeGreaterThanOrEqual(0);
    expect(firstSetIdx).toBeGreaterThan(exitEndIdx);
  });
});
