import { describe, expect, it } from "vitest";
import { applyFilter } from "../../src/library/library-filter";
import type { LibraryEntry } from "../../src/library/library-entry";

function entry(overrides: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    id: "0000000000000000",
    title: "Untitled",
    author: "Unknown",
    format: "epub",
    addedAt: 1,
    lastOpenedAt: null,
    totalPages: 1,
    ...overrides,
  };
}

const entries = [
  entry({ id: "a", title: "The Tell-Tale Heart", author: "Edgar Allan Poe" }),
  entry({ id: "b", title: "The Raven", author: "Edgar Allan Poe" }),
  entry({ id: "c", title: "Pride and Prejudice", author: "Jane Austen" }),
  entry({ id: "d", title: "Sense and Sensibility", author: "Jane Austen" }),
  entry({ id: "e", title: "Hamlet", author: "William Shakespeare" }),
];

describe("applyFilter", () => {
  it("returns entries unchanged for an empty query", () => {
    expect(applyFilter(entries, "")).toBe(entries);
  });

  it("returns entries unchanged for a whitespace-only query", () => {
    expect(applyFilter(entries, "   ")).toBe(entries);
  });

  it("matches case-insensitively against title", () => {
    expect(applyFilter(entries, "RAVEN").map((e) => e.id)).toEqual(["b"]);
  });

  it("matches case-insensitively against author", () => {
    expect(applyFilter(entries, "poe").map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("matches a substring spanning title and author concatenation", () => {
    // "Tale Heart Edgar" — appears in the concatenated string for entry a
    // (well, "Heart Edgar" certainly does once we join with a space).
    expect(applyFilter(entries, "Heart Edgar").map((e) => e.id)).toEqual([
      "a",
    ]);
  });

  it("treats regex-special characters as literal", () => {
    // None of these chars appear in our fixture; should yield empty array.
    expect(applyFilter(entries, ".*")).toEqual([]);
    expect(applyFilter(entries, "(abc")).toEqual([]);
  });

  it("preserves order of the input array", () => {
    const reversed = [...entries].reverse();
    const filtered = applyFilter(reversed, "Austen");
    expect(filtered.map((e) => e.id)).toEqual(["d", "c"]);
  });

  it("returns empty array when nothing matches", () => {
    expect(applyFilter(entries, "Tolstoy")).toEqual([]);
  });
});
