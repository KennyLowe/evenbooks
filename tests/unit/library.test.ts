import { describe, expect, it } from "vitest";
import {
  addEntry,
  bootstrapWithSample,
  bumpEntry,
  emptyLibrary,
  findEntry,
  markOpened,
} from "../../src/library/library";
import {
  compareLibraryEntries,
  type LibraryEntry,
} from "../../src/library/library-entry";

function entry(overrides: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    id: "abc1234567890def",
    title: "Untitled",
    author: "Unknown",
    format: "epub",
    addedAt: 1_000_000_000_000,
    lastOpenedAt: null,
    totalPages: 10,
    ...overrides,
  };
}

describe("emptyLibrary / bootstrapWithSample", () => {
  it("emptyLibrary has no entries", () => {
    expect(emptyLibrary().entries).toEqual([]);
  });

  it("bootstrapWithSample produces a single sample entry", () => {
    const lib = bootstrapWithSample(45, 1_700_000_000_000);
    expect(lib.entries).toHaveLength(1);
    expect(lib.entries[0].id).toBe("sample");
    expect(lib.entries[0].format).toBe("bundled");
    expect(lib.entries[0].addedAt).toBe(1_700_000_000_000);
    expect(lib.entries[0].lastOpenedAt).toBeNull();
    expect(lib.entries[0].totalPages).toBe(45);
  });
});

describe("addEntry", () => {
  it("adds an entry to an empty library", () => {
    const lib = addEntry(emptyLibrary(), entry({ id: "aaa", addedAt: 1_000 }));
    expect(lib.entries).toHaveLength(1);
    expect(lib.entries[0].id).toBe("aaa");
  });

  it("places a newer entry at the top of the order", () => {
    let lib = bootstrapWithSample(45, 1_000);
    lib = addEntry(lib, entry({ id: "bbb", addedAt: 2_000 }));
    expect(lib.entries[0].id).toBe("bbb");
    expect(lib.entries[1].id).toBe("sample");
  });

  it("replaces an existing entry with the same id", () => {
    let lib = addEntry(emptyLibrary(), entry({ id: "ccc", title: "Old" }));
    lib = addEntry(lib, entry({ id: "ccc", title: "New" }));
    expect(lib.entries).toHaveLength(1);
    expect(lib.entries[0].title).toBe("New");
  });
});

describe("bumpEntry", () => {
  it("moves the bumped entry to the top of the order", () => {
    let lib = bootstrapWithSample(45, 1_000);
    lib = addEntry(lib, entry({ id: "bbb", addedAt: 2_000 }));
    // sample is older than bbb; bumping sample should put it on top.
    lib = bumpEntry(lib, "sample", 3_000);
    expect(lib.entries[0].id).toBe("sample");
    expect(lib.entries[0].addedAt).toBe(3_000);
  });
});

describe("markOpened", () => {
  it("updates lastOpenedAt and re-sorts", () => {
    let lib = bootstrapWithSample(45, 1_000);
    lib = addEntry(lib, entry({ id: "bbb", addedAt: 2_000 }));
    expect(lib.entries[0].id).toBe("bbb");
    lib = markOpened(lib, "sample", 3_000);
    expect(lib.entries[0].id).toBe("sample");
    expect(findEntry(lib, "sample")?.lastOpenedAt).toBe(3_000);
  });
});

describe("compareLibraryEntries", () => {
  it("orders by max(addedAt, lastOpenedAt) descending", () => {
    const a = entry({ id: "aaa", addedAt: 1_000, lastOpenedAt: null });
    const b = entry({ id: "bbb", addedAt: 500, lastOpenedAt: 2_000 });
    const sorted = [a, b].sort(compareLibraryEntries);
    expect(sorted.map((e) => e.id)).toEqual(["bbb", "aaa"]);
  });

  it("breaks ties by id lexicographic ascending", () => {
    const a = entry({ id: "aaa", addedAt: 1_000 });
    const b = entry({ id: "bbb", addedAt: 1_000 });
    const sorted = [b, a].sort(compareLibraryEntries);
    expect(sorted.map((e) => e.id)).toEqual(["aaa", "bbb"]);
  });

  it("is deterministic — same input → same output", () => {
    const xs = [
      entry({ id: "ccc", addedAt: 1_000 }),
      entry({ id: "aaa", addedAt: 2_000 }),
      entry({ id: "bbb", addedAt: 1_500 }),
    ];
    const a = [...xs].sort(compareLibraryEntries);
    const b = [...xs].sort(compareLibraryEntries);
    expect(a).toEqual(b);
  });
});
