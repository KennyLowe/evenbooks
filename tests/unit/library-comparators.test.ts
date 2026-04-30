import { describe, expect, it } from "vitest";
import {
  comparatorFor,
  type LibraryEntry,
} from "../../src/library/library-entry";

function entry(overrides: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    id: "0000000000000000",
    title: "Title",
    author: "Author",
    format: "epub",
    addedAt: 1_000_000,
    lastOpenedAt: null,
    totalPages: 100,
    ...overrides,
  };
}

describe("comparatorFor — most-recent (regression with v2)", () => {
  it("orders by max(addedAt, lastOpenedAt) desc; ties by id asc", () => {
    const a = entry({ id: "a", addedAt: 100, lastOpenedAt: null });
    const b = entry({ id: "b", addedAt: 50, lastOpenedAt: 200 });
    const c = entry({ id: "c", addedAt: 100, lastOpenedAt: null }); // tie with a
    const sorted = [a, b, c].sort(comparatorFor("most-recent"));
    expect(sorted.map((e) => e.id)).toEqual(["b", "a", "c"]);
  });
});

describe("comparatorFor — title-asc", () => {
  it("orders by title case-insensitive ascending", () => {
    const a = entry({ id: "a", title: "Zebra" });
    const b = entry({ id: "b", title: "alpha" });
    const c = entry({ id: "c", title: "Mango" });
    const sorted = [a, b, c].sort(comparatorFor("title-asc"));
    expect(sorted.map((e) => e.title)).toEqual(["alpha", "Mango", "Zebra"]);
  });

  it("ties by author asc, then id asc", () => {
    const a = entry({ id: "z", title: "Same", author: "B" });
    const b = entry({ id: "y", title: "Same", author: "A" });
    const c = entry({ id: "a", title: "Same", author: "B" });
    const sorted = [a, b, c].sort(comparatorFor("title-asc"));
    // by title (all "Same") → by author: A < B → b first.
    // Then a and c tied at title="Same" author="B"; id asc → c (a < z).
    expect(sorted.map((e) => e.id)).toEqual(["y", "a", "z"]);
  });
});

describe("comparatorFor — author-asc", () => {
  it("orders by author case-insensitive ascending; ties by title", () => {
    const a = entry({ id: "a", author: "Poe", title: "Tell-Tale Heart" });
    const b = entry({ id: "b", author: "austen", title: "Persuasion" });
    const c = entry({ id: "c", author: "Poe", title: "Raven" });
    const sorted = [a, b, c].sort(comparatorFor("author-asc"));
    // austen < Poe; within Poe, Raven < Tell-Tale.
    expect(sorted.map((e) => e.id)).toEqual(["b", "c", "a"]);
  });
});

describe("comparatorFor — most-completed", () => {
  it("orders by progress fraction desc; never-opened entries last", () => {
    const a = entry({
      id: "a",
      title: "A",
      lastOpenedAt: 100,
      totalPages: 100,
    });
    const b = entry({
      id: "b",
      title: "B",
      lastOpenedAt: 100,
      totalPages: 100,
    });
    const c = entry({ id: "c", title: "C", lastOpenedAt: null }); // never opened
    const progress = (id: string): number | null => {
      if (id === "a") return 90;
      if (id === "b") return 40;
      return null;
    };
    const sorted = [a, b, c].sort(comparatorFor("most-completed", progress));
    expect(sorted.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("treats unknown progress as 0", () => {
    const a = entry({ id: "a", title: "A", lastOpenedAt: 100 });
    const b = entry({ id: "b", title: "B", lastOpenedAt: 100 });
    // No progress lookup provided → both treated as 0; tie by title.
    const sorted = [b, a].sort(comparatorFor("most-completed"));
    expect(sorted.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("comparatorFor — date-added-desc", () => {
  it("orders by addedAt desc; ties by id asc", () => {
    const a = entry({ id: "a", addedAt: 100 });
    const b = entry({ id: "b", addedAt: 200 });
    const c = entry({ id: "c", addedAt: 100 });
    const sorted = [a, b, c].sort(comparatorFor("date-added-desc"));
    expect(sorted.map((e) => e.id)).toEqual(["b", "a", "c"]);
  });
});
