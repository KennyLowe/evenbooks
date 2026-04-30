import { describe, expect, it } from "vitest";
import {
  CHARS_PER_LINE,
  LINES_PER_PAGE,
  paginate,
  type Page,
} from "../../src/reader/pagination";

const TARGET_CHARS_PER_PAGE = CHARS_PER_LINE * LINES_PER_PAGE;

describe("paginate — basics", () => {
  it("returns an empty array for empty input", () => {
    expect(paginate("")).toEqual([]);
  });

  it("returns an empty array for whitespace-only input", () => {
    expect(paginate("   \n\n  \n")).toEqual([]);
  });

  it("returns a single page for short input", () => {
    const pages = paginate("Hello world.");
    expect(pages).toHaveLength(1);
    expect(pages[0].index).toBe(0);
    expect(pages[0].isFirst).toBe(true);
    expect(pages[0].isLast).toBe(true);
    expect(pages[0].text).toContain("Hello world.");
  });
});

describe("paginate — multi-page", () => {
  // Build text long enough to require multiple pages.
  const word = "alpha"; // 5 chars
  const longText = Array.from({ length: 1000 }, () => word).join(" ");

  it("produces multiple pages for long input", () => {
    const pages = paginate(longText);
    expect(pages.length).toBeGreaterThan(1);
  });

  it("indexes pages 0..N-1 with isFirst/isLast set correctly", () => {
    const pages = paginate(longText);
    pages.forEach((p: Page, i: number) => {
      expect(p.index).toBe(i);
      expect(p.isFirst).toBe(i === 0);
      expect(p.isLast).toBe(i === pages.length - 1);
    });
  });

  it("each page stays under 600 chars (defensive cap)", () => {
    const pages = paginate(longText);
    for (const p of pages) {
      expect(p.text.length).toBeLessThanOrEqual(600);
    }
  });

  it("is deterministic given identical input", () => {
    const a = paginate(longText);
    const b = paginate(longText);
    expect(a).toEqual(b);
  });
});

describe("paginate — long word handling", () => {
  it("hard-breaks a single word longer than CHARS_PER_LINE", () => {
    const longWord = "x".repeat(CHARS_PER_LINE * 2 + 5);
    const pages = paginate(longWord);
    // Should not throw, should produce at least one page, no line should exceed
    // CHARS_PER_LINE.
    expect(pages.length).toBeGreaterThanOrEqual(1);
    for (const p of pages) {
      const lines = p.text.split("\n");
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(CHARS_PER_LINE);
      }
    }
  });
});

describe("paginate — paragraph handling", () => {
  it("preserves paragraph boundaries within a page when they fit", () => {
    const text = "First paragraph.\n\nSecond paragraph.";
    const pages = paginate(text);
    // For input this short, expect a single page that contains both paragraphs.
    expect(pages).toHaveLength(1);
    expect(pages[0].text).toContain("First paragraph");
    expect(pages[0].text).toContain("Second paragraph");
  });

  it("does not exceed the per-page char target by an unbounded amount", () => {
    // ~5 page-fulls of content: ensure pages stay close to target.
    const wordsPerPage = Math.floor(TARGET_CHARS_PER_PAGE / 6); // ~5-char words
    const text = Array.from({ length: wordsPerPage * 5 }, () => "alpha").join(" ");
    const pages = paginate(text);
    for (const p of pages) {
      // Allow a generous over-count for the slack on word boundaries, but
      // never exceed the hard cap.
      expect(p.text.length).toBeLessThanOrEqual(600);
    }
  });
});
