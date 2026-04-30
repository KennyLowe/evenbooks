import { describe, expect, it } from "vitest";
import type { Page } from "../../src/reader/pagination";
import { reduce, type ReaderState } from "../../src/reader/reader";
import { SAMPLE_BOOK } from "../../src/content/sample-text";

function fakePages(n: number): Page[] {
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    text: `Page ${i + 1} content.`,
    isFirst: i === 0,
    isLast: i === n - 1,
  }));
}

function freshState(pageIndex = 0, totalPages = 5): ReaderState {
  return {
    book: SAMPLE_BOOK,
    pages: fakePages(totalPages),
    mode: { kind: "reading", pageIndex },
    connection: "connected",
  };
}

describe("reduce — reading transitions", () => {
  it("reading(N) + NEXT_PAGE → reading(N+1)", () => {
    const state = freshState(2, 5);
    const result = reduce(state, "NEXT_PAGE");
    expect(result.next.mode).toEqual({ kind: "reading", pageIndex: 3 });
    expect(result.render).not.toBeNull();
    expect(result.persist).toEqual({
      book: "sample",
      page: 3,
      savedAt: expect.any(Number),
    });
    expect(result.exit).toBe(false);
  });

  it("reading(last) + NEXT_PAGE → end-of-book (no persist)", () => {
    const state = freshState(4, 5);
    const result = reduce(state, "NEXT_PAGE");
    expect(result.next.mode).toEqual({ kind: "end-of-book" });
    expect(result.render).not.toBeNull();
    expect(result.persist).toBeNull();
    expect(result.exit).toBe(false);
  });

  it("reading(N>0) + PREV_PAGE → reading(N-1)", () => {
    const state = freshState(3, 5);
    const result = reduce(state, "PREV_PAGE");
    expect(result.next.mode).toEqual({ kind: "reading", pageIndex: 2 });
    expect(result.persist).toEqual({
      book: "sample",
      page: 2,
      savedAt: expect.any(Number),
    });
  });

  it("reading(0) + PREV_PAGE → clamp-flash(0)", () => {
    const state = freshState(0, 5);
    const result = reduce(state, "PREV_PAGE");
    expect(result.next.mode.kind).toBe("clamp-flash");
    if (result.next.mode.kind === "clamp-flash") {
      expect(result.next.mode.pageIndex).toBe(0);
      expect(result.next.mode.flashUntil).toBeGreaterThan(Date.now());
    }
    expect(result.render).not.toBeNull();
    expect(result.persist).toBeNull();
  });
});

describe("reduce — clamp-flash transitions", () => {
  it("clamp-flash + TIMER_EXPIRED → reading(0) and re-renders the page", () => {
    const state: ReaderState = {
      ...freshState(0, 5),
      mode: { kind: "clamp-flash", pageIndex: 0, flashUntil: Date.now() - 1 },
    };
    const result = reduce(state, { kind: "TIMER_EXPIRED" });
    expect(result.next.mode).toEqual({ kind: "reading", pageIndex: 0 });
    expect(result.render).not.toBeNull();
    expect(result.persist).toBeNull();
  });
});

describe("reduce — end-of-book transitions", () => {
  it("end-of-book + NEXT_PAGE → exiting", () => {
    const state: ReaderState = {
      ...freshState(0, 5),
      mode: { kind: "end-of-book" },
    };
    const result = reduce(state, "NEXT_PAGE");
    expect(result.next.mode).toEqual({ kind: "exiting" });
    expect(result.exit).toBe(true);
  });

  it("end-of-book + PREV_PAGE → reading(last)", () => {
    const state: ReaderState = {
      ...freshState(0, 5),
      mode: { kind: "end-of-book" },
    };
    const result = reduce(state, "PREV_PAGE");
    expect(result.next.mode).toEqual({ kind: "reading", pageIndex: 4 });
  });
});

describe("reduce — exit", () => {
  it("EXIT from any mode → exiting (with teardown)", () => {
    const state = freshState(2, 5);
    const result = reduce(state, "EXIT");
    expect(result.next.mode).toEqual({ kind: "exiting" });
    expect(result.exit).toBe(true);
    expect(result.persist).toEqual({
      book: "sample",
      page: 2,
      savedAt: expect.any(Number),
    });
  });
});

describe("reduce — RECONNECT", () => {
  it("RECONNECT in reading mode keeps the same mode and re-issues the frame", () => {
    const state = freshState(3, 5);
    const result = reduce(state, { kind: "RECONNECT" });
    expect(result.next.mode).toEqual(state.mode);
    expect(result.render).not.toBeNull();
    expect(result.persist).toBeNull();
  });

  it("RECONNECT in end-of-book mode keeps end-of-book and re-issues the frame", () => {
    const state: ReaderState = {
      ...freshState(0, 5),
      mode: { kind: "end-of-book" },
    };
    const result = reduce(state, { kind: "RECONNECT" });
    expect(result.next.mode).toEqual({ kind: "end-of-book" });
    expect(result.render).not.toBeNull();
  });
});
