import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetForTests,
  deleteBookContent,
  getBookContent,
  putBookContent,
} from "../../src/platform/book-store";
import { SAMPLE_BOOK } from "../../src/content/sample-text";

describe("book-store IndexedDB wrapper", () => {
  beforeEach(() => {
    // Force a fresh DB connection per test (deleteDatabase is async-fragile;
    // resetting the cached promise is sufficient with fake-indexeddb).
    _resetForTests();
  });

  it("round-trips put → get for an imported book", async () => {
    await putBookContent({
      id: "abc1234567890def",
      text: "the body",
      pages: ["page 1", "page 2"],
      storedAt: 1_000,
    });
    const got = await getBookContent("abc1234567890def");
    expect(got).not.toBeNull();
    expect(got?.text).toBe("the body");
    expect(got?.pages).toEqual(["page 1", "page 2"]);
  });

  it("returns null for an unknown id", async () => {
    const got = await getBookContent("does-not-exist");
    expect(got).toBeNull();
  });

  it("delete then get returns null", async () => {
    await putBookContent({
      id: "deleteme0123abcd",
      text: "going away",
      pages: ["page 1"],
      storedAt: 1_000,
    });
    await deleteBookContent("deleteme0123abcd");
    const got = await getBookContent("deleteme0123abcd");
    expect(got).toBeNull();
  });

  it("get for 'sample' short-circuits to bundled SAMPLE_BOOK", async () => {
    const got = await getBookContent("sample");
    expect(got).not.toBeNull();
    expect(got?.id).toBe("sample");
    expect(got?.text).toBe(SAMPLE_BOOK.text);
    expect(got?.pages.length).toBeGreaterThan(0);
  });

  it("putBookContent for 'sample' is silently ignored", async () => {
    await putBookContent({
      id: "sample",
      text: "would corrupt the bundled sample",
      pages: ["bad"],
      storedAt: 1_000,
    });
    const got = await getBookContent("sample");
    // Still returns the bundled text, not the "would corrupt" text we tried
    // to write.
    expect(got?.text).toBe(SAMPLE_BOOK.text);
  });
});
