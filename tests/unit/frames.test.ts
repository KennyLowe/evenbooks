import { describe, expect, it } from "vitest";
import {
  STARTUP_CONTAINER,
  pageFrame,
  clampFlashFrame,
  endOfBookFrame,
} from "../../src/reader/frames";
import { SAMPLE_BOOK } from "../../src/content/sample-text";
import type { Page } from "../../src/reader/pagination";

function fakePage(text: string, index = 0, total = 1): Page {
  return {
    index,
    text,
    isFirst: index === 0,
    isLast: index === total - 1,
  };
}

describe("STARTUP_CONTAINER", () => {
  it("declares the single text container with isEventCapture set", () => {
    // The SDK class fields are sometimes private/instance-only; we read by
    // serialising to JSON to assert the data shape.
    const json = JSON.parse(JSON.stringify(STARTUP_CONTAINER));
    expect(json.containerID).toBe(1);
    expect(json.containerName).toBe("main");
    expect(json.isEventCapture).toBe(1);
    expect(json.xPosition).toBe(0);
    expect(json.yPosition).toBe(0);
    expect(json.width).toBe(576);
    expect(json.height).toBe(288);
  });
});

describe("pageFrame", () => {
  it("produces a TextContainerUpgrade with the page text as content", () => {
    const page = fakePage("Hello, glasses.");
    const upgrade = JSON.parse(JSON.stringify(pageFrame(page)));
    expect(upgrade.containerID).toBe(1);
    expect(upgrade.containerName).toBe("main");
    expect(upgrade.contentOffset).toBe(0);
    expect(upgrade.content).toBe("Hello, glasses.");
  });

  it("is pure: same input → same output", () => {
    const page = fakePage("Same text twice.");
    const a = JSON.parse(JSON.stringify(pageFrame(page)));
    const b = JSON.parse(JSON.stringify(pageFrame(page)));
    expect(a).toEqual(b);
  });

  it("respects the 2000-char textContainerUpgrade cap given a 600-char page", () => {
    const page = fakePage("a".repeat(600));
    const upgrade = JSON.parse(JSON.stringify(pageFrame(page)));
    expect(upgrade.content.length).toBeLessThanOrEqual(2000);
  });
});

describe("clampFlashFrame", () => {
  it("prepends an indicator above the page text", () => {
    const page = fakePage("Body text here.", 0, 5);
    const upgrade = JSON.parse(JSON.stringify(clampFlashFrame(page)));
    expect(upgrade.containerID).toBe(1);
    expect(upgrade.content).toMatch(/start of book/);
    expect(upgrade.content).toContain("Body text here.");
    // The indicator must come before the body text.
    const indicatorIdx = upgrade.content.search(/start of book/);
    const bodyIdx = upgrade.content.indexOf("Body text here.");
    expect(indicatorIdx).toBeLessThan(bodyIdx);
  });

  it("respects the 2000-char cap", () => {
    const page = fakePage("a".repeat(600));
    const upgrade = JSON.parse(JSON.stringify(clampFlashFrame(page)));
    expect(upgrade.content.length).toBeLessThanOrEqual(2000);
  });
});

describe("endOfBookFrame", () => {
  it("includes the book title and an exit prompt", () => {
    const upgrade = JSON.parse(JSON.stringify(endOfBookFrame(SAMPLE_BOOK)));
    expect(upgrade.containerID).toBe(1);
    expect(upgrade.content).toContain(SAMPLE_BOOK.title);
    expect(upgrade.content).toMatch(/[Pp]ress to exit/);
  });

  it("is pure: same book → same upgrade", () => {
    const a = JSON.parse(JSON.stringify(endOfBookFrame(SAMPLE_BOOK)));
    const b = JSON.parse(JSON.stringify(endOfBookFrame(SAMPLE_BOOK)));
    expect(a).toEqual(b);
  });

  it("respects the 2000-char cap", () => {
    const upgrade = JSON.parse(JSON.stringify(endOfBookFrame(SAMPLE_BOOK)));
    expect(upgrade.content.length).toBeLessThanOrEqual(2000);
  });
});
