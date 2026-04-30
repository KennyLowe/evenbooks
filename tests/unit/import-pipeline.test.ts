// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { importFile } from "../../src/import/import-pipeline";
import {
  addEntry,
  emptyLibrary,
  type Library,
} from "../../src/library/library";
import { _resetForTests, getBookContent } from "../../src/platform/book-store";
import { createNoticeChannel } from "../../src/platform/errors";
import { buildMinimalEpub } from "./_fixtures";

function makeFile(buffer: ArrayBuffer, name: string): File {
  return new File([buffer], name, { type: "application/octet-stream" });
}

describe("importFile — EPUB happy path", () => {
  beforeEach(() => _resetForTests());

  it("imports a valid EPUB → success with Book + LibraryEntry", async () => {
    const epub = await buildMinimalEpub({
      title: "Imported Title",
      authors: ["Imported Author"],
      body: "<p>Imported body text. " + "alpha ".repeat(200) + "</p>",
    });
    const file = makeFile(epub, "import.epub");
    const channel = createNoticeChannel();

    const out = await importFile(file, emptyLibrary(), channel);

    expect(out.kind).toBe("success");
    if (out.kind === "success") {
      expect(out.book.title).toBe("Imported Title");
      expect(out.book.author).toBe("Imported Author");
      expect(out.book.format).toBe("epub");
      expect(out.book.id).toMatch(/^[0-9a-f]{16}$/);
      expect(out.entry.id).toBe(out.book.id);
      expect(out.entry.format).toBe("epub");
      expect(out.entry.totalPages).toBeGreaterThan(0);
      expect(out.entry.lastOpenedAt).toBeNull();

      // Content was persisted to IndexedDB.
      const stored = await getBookContent(out.book.id);
      expect(stored).not.toBeNull();
      expect(stored?.text).toContain("Imported body text");
    }
  });

  it("returns duplicate when the same file is imported twice", async () => {
    const epub = await buildMinimalEpub({
      title: "Dup Test",
      authors: ["A"],
      body: "<p>body</p>",
    });
    const channel = createNoticeChannel();

    const first = await importFile(
      makeFile(epub, "x.epub"),
      emptyLibrary(),
      channel,
    );
    expect(first.kind).toBe("success");
    if (first.kind !== "success") return;

    const lib: Library = addEntry(emptyLibrary(), first.entry);
    const second = await importFile(makeFile(epub, "x.epub"), lib, channel);

    expect(second.kind).toBe("duplicate");
    if (second.kind === "duplicate") {
      expect(second.existingEntry.id).toBe(first.entry.id);
    }
  });
});

describe("importFile — pre-flight refusals", () => {
  it("oversize file → failure(oversize), library unchanged", async () => {
    // 51 MB synthetic file
    const big = new Uint8Array(51 * 1024 * 1024).buffer;
    const file = makeFile(big, "huge.epub");
    const out = await importFile(file, emptyLibrary(), createNoticeChannel());
    expect(out).toEqual({ kind: "failure", reason: "oversize" });
  });

  it("unsupported extension → failure(unsupported-format)", async () => {
    const file = makeFile(new ArrayBuffer(8), "doc.pdf");
    const out = await importFile(file, emptyLibrary(), createNoticeChannel());
    expect(out).toEqual({ kind: "failure", reason: "unsupported-format" });
  });

  it("DRM-protected EPUB → failure(drm-protected)", async () => {
    const epub = await buildMinimalEpub({ drm: "adept" });
    const file = makeFile(epub, "drm.epub");
    const out = await importFile(file, emptyLibrary(), createNoticeChannel());
    expect(out).toEqual({ kind: "failure", reason: "drm-protected" });
  });

  it("corrupt ZIP labelled .epub → failure(malformed)", async () => {
    const epub = await buildMinimalEpub({ corruptZip: true });
    const file = makeFile(epub, "corrupt.epub");
    const out = await importFile(file, emptyLibrary(), createNoticeChannel());
    expect(out).toEqual({ kind: "failure", reason: "malformed" });
  });
});
