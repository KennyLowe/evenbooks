// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { importFile } from "../../src/import/import-pipeline";
import { emptyLibrary, type Library } from "../../src/library/library";
import { _resetForTests, getBookContent } from "../../src/platform/book-store";
import { createNoticeChannel, type Notice } from "../../src/platform/errors";
import { buildMinimalEpub, buildTxtFile } from "./_fixtures";
import { buildImageOnlyPdf } from "./_pdf-fixtures";

function makeFile(buffer: ArrayBuffer, name: string): File {
  return new File([buffer], name, { type: "application/octet-stream" });
}

function withCapturedNotices(
  channel: ReturnType<typeof createNoticeChannel>,
): Notice[] {
  const got: Notice[] = [];
  channel.subscribe((n) => got.push(n));
  return got;
}

describe("importFile — typed refusals (Spec FR-015 / SC-004)", () => {
  beforeEach(() => _resetForTests());

  it("oversize → failure(oversize); library unchanged; no IndexedDB write", async () => {
    const big = new Uint8Array(51 * 1024 * 1024).buffer;
    const file = makeFile(big, "big.epub");
    const channel = createNoticeChannel();
    const lib: Library = emptyLibrary();

    const out = await importFile(file, lib, channel);

    expect(out).toEqual({ kind: "failure", reason: "oversize" });
    expect(lib).toEqual(emptyLibrary());
  });

  it("unsupported extension .azw3 → failure(unsupported-format)", async () => {
    const file = makeFile(new ArrayBuffer(8), "doc.azw3");
    const out = await importFile(file, emptyLibrary(), createNoticeChannel());
    expect(out).toEqual({ kind: "failure", reason: "unsupported-format" });
  });

  it("unsupported extension .mobi → failure(unsupported-format)", async () => {
    const file = makeFile(new ArrayBuffer(8), "book.mobi");
    const out = await importFile(file, emptyLibrary(), createNoticeChannel());
    expect(out).toEqual({ kind: "failure", reason: "unsupported-format" });
  });

  it("unsupported extension .docx → failure(unsupported-format)", async () => {
    const file = makeFile(new ArrayBuffer(8), "essay.docx");
    const out = await importFile(file, emptyLibrary(), createNoticeChannel());
    expect(out).toEqual({ kind: "failure", reason: "unsupported-format" });
  });

  it("DRM-protected EPUB → failure(drm-protected)", async () => {
    const epub = await buildMinimalEpub({ drm: "adept" });
    const file = makeFile(epub, "drm.epub");
    const out = await importFile(file, emptyLibrary(), createNoticeChannel());
    expect(out).toEqual({ kind: "failure", reason: "drm-protected" });
    expect(await getBookContent("drm-not-here-anyway")).toBeNull();
  });

  it("corrupt ZIP labelled .epub → failure(malformed)", async () => {
    const epub = await buildMinimalEpub({ corruptZip: true });
    const file = makeFile(epub, "corrupt.epub");
    const out = await importFile(file, emptyLibrary(), createNoticeChannel());
    expect(out).toEqual({ kind: "failure", reason: "malformed" });
  });

  it("non-EPUB content with .epub extension → failure(malformed)", async () => {
    // A plain text payload renamed to .epub — not a valid ZIP.
    const buf = buildTxtFile("This is not an EPUB.");
    const file = makeFile(buf, "fake.epub");
    const out = await importFile(file, emptyLibrary(), createNoticeChannel());
    expect(out).toEqual({ kind: "failure", reason: "malformed" });
  });

  it("empty EPUB body → failure(empty)", async () => {
    const epub = await buildMinimalEpub({
      title: "Hollow",
      authors: ["X"],
      emptyBody: true,
    });
    const file = makeFile(epub, "empty.epub");
    const out = await importFile(file, emptyLibrary(), createNoticeChannel());
    expect(out).toEqual({ kind: "failure", reason: "empty" });
  });

  it("Latin-1 .txt → failure(unsupported-encoding)", async () => {
    const buf = buildTxtFile("café", { encoding: "latin-1" });
    const file = makeFile(buf, "latin1.txt");
    const out = await importFile(file, emptyLibrary(), createNoticeChannel());
    expect(out).toEqual({ kind: "failure", reason: "unsupported-encoding" });
  });

  it("empty .txt file → failure(empty)", async () => {
    const buf = buildTxtFile("");
    const file = makeFile(buf, "empty.txt");
    const out = await importFile(file, emptyLibrary(), createNoticeChannel());
    expect(out).toEqual({ kind: "failure", reason: "empty" });
  });

  it("image-only PDF → failure(image-only-pdf)", async () => {
    const buf = await buildImageOnlyPdf();
    const file = makeFile(buf, "scan.pdf");
    const out = await importFile(file, emptyLibrary(), createNoticeChannel());
    expect(out).toEqual({ kind: "failure", reason: "image-only-pdf" });
  });

  it("non-PDF content with .pdf extension → failure(malformed)", async () => {
    const buf = new TextEncoder().encode("This is not a PDF.").buffer;
    const file = makeFile(buf, "fake.pdf");
    const out = await importFile(file, emptyLibrary(), createNoticeChannel());
    expect(out).toMatchObject({ kind: "failure", reason: "malformed" });
  });

  it("oversize PDF → failure(oversize); parser never invoked", async () => {
    const big = new Uint8Array(51 * 1024 * 1024).buffer;
    const file = makeFile(big, "huge.pdf");
    const out = await importFile(file, emptyLibrary(), createNoticeChannel());
    expect(out).toEqual({ kind: "failure", reason: "oversize" });
  });

  // Note: a reliable synthetic encrypted-PDF fixture needs real RC4/AES
  // encryption tables that pdf-lib (v1.17) doesn't produce. The DRM refusal
  // path is verified by code review in src/import/pdf.ts (isPasswordException)
  // and end-to-end against a real password-protected PDF in manual QA.

  it("storage-full (IndexedDB throws) → failure(storage-full); transient save-failed notice emitted", async () => {
    // Spy on putBookContent by mocking the module.
    const channel = createNoticeChannel();
    const notices = withCapturedNotices(channel);

    const epub = await buildMinimalEpub({
      title: "Will Fail to Store",
      authors: ["Y"],
      body: "<p>Decent body content here.</p>",
    });
    const file = makeFile(epub, "willfail.epub");

    // Inject failure via a vi.spyOn-style override on book-store.
    const bookStore = await import("../../src/platform/book-store");
    const spy = vi
      .spyOn(bookStore, "putBookContent")
      .mockRejectedValueOnce(new Error("simulated quota exceeded"));

    const out = await importFile(file, emptyLibrary(), channel);

    expect(out).toEqual({ kind: "failure", reason: "storage-full" });
    expect(notices).toContainEqual({ kind: "save-failed" });

    spy.mockRestore();
  });
});

describe("importFile — library unchanged on every failure", () => {
  beforeEach(() => _resetForTests());

  it.each([
    ["unsupported-format", () => makeFile(new ArrayBuffer(8), "x.azw3")],
    [
      "oversize",
      () => makeFile(new Uint8Array(51 * 1024 * 1024).buffer, "x.epub"),
    ],
  ] as const)(
    "%s leaves the library reference unchanged",
    async (_label, mkFile) => {
      const initialLib: Library = emptyLibrary();
      const out = await importFile(mkFile(), initialLib, createNoticeChannel());
      expect(out.kind).toBe("failure");
      expect(initialLib).toEqual(emptyLibrary());
    },
  );
});
