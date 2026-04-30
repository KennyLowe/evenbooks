import { describe, expect, it } from "vitest";
import { describeStatus } from "../../src/ui/phone-status";
import { SAMPLE_BOOK } from "../../src/content/sample-text";

describe("describeStatus — connection labels", () => {
  it("connected → 'Glasses connected'", () => {
    const r = describeStatus({
      connection: "connected",
      book: SAMPLE_BOOK,
      pageIndex: 0,
      totalPages: 45,
    });
    expect(r.connection).toBe("Glasses connected");
  });

  it("connecting → 'Connecting…'", () => {
    const r = describeStatus({
      connection: "connecting",
      book: SAMPLE_BOOK,
      pageIndex: 0,
      totalPages: 45,
    });
    expect(r.connection).toBe("Connecting…");
  });

  it("not-connected → 'Glasses not connected'", () => {
    const r = describeStatus({
      connection: "not-connected",
      book: SAMPLE_BOOK,
      pageIndex: 0,
      totalPages: 45,
    });
    expect(r.connection).toBe("Glasses not connected");
  });
});

describe("describeStatus — book and progress", () => {
  it("renders title, author, and 1-indexed page progress", () => {
    const r = describeStatus({
      connection: "connected",
      book: SAMPLE_BOOK,
      pageIndex: 11,
      totalPages: 45,
    });
    expect(r.title).toBe(SAMPLE_BOOK.title);
    expect(r.author).toBe(SAMPLE_BOOK.author);
    expect(r.progress).toBe("Page 12 of 45");
  });

  it("renders the first page as 'Page 1 of N'", () => {
    const r = describeStatus({
      connection: "connected",
      book: SAMPLE_BOOK,
      pageIndex: 0,
      totalPages: 45,
    });
    expect(r.progress).toBe("Page 1 of 45");
  });

  it("renders the last page as 'Page N of N'", () => {
    const r = describeStatus({
      connection: "connected",
      book: SAMPLE_BOOK,
      pageIndex: 44,
      totalPages: 45,
    });
    expect(r.progress).toBe("Page 45 of 45");
  });
});
