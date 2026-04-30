// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { epubParse } from "../../src/import/epub";
import { buildMinimalEpub } from "./_fixtures";

describe("epubParse — happy path", () => {
  it("parses a minimal valid EPUB and extracts title + author + body", async () => {
    const epub = await buildMinimalEpub({
      title: "Test Title",
      authors: ["Alice Author"],
      body: "<p>Hello, glasses.</p>",
    });
    const out = await epubParse(epub, "test.epub");
    expect(out).toMatchObject({
      format: "epub",
      title: "Test Title",
      author: "Alice Author",
    });
    if ("text" in out) {
      expect(out.text).toContain("Hello, glasses.");
    }
  });

  it("falls back to filename when title is missing", async () => {
    const epub = await buildMinimalEpub({
      authors: ["Bob"],
      body: "<p>Body</p>",
    });
    const out = await epubParse(epub, "MyBook.epub");
    if ("title" in out) {
      expect(out.title).toBe("MyBook");
    } else {
      throw new Error("expected success, got " + JSON.stringify(out));
    }
  });

  it("joins multiple authors with comma-space", async () => {
    const epub = await buildMinimalEpub({
      title: "T",
      authors: ["Strunk", "White"],
      body: "<p>Body</p>",
    });
    const out = await epubParse(epub, "test.epub");
    if ("author" in out) {
      expect(out.author).toBe("Strunk, White");
    } else {
      throw new Error("expected success");
    }
  });

  it("defaults author to 'Unknown' when no creator is present", async () => {
    const epub = await buildMinimalEpub({
      title: "Anon Work",
      body: "<p>Body text here</p>",
    });
    const out = await epubParse(epub, "test.epub");
    if ("author" in out) {
      expect(out.author).toBe("Unknown");
    } else {
      throw new Error("expected success");
    }
  });

  it("silently skips embedded images, retaining surrounding text", async () => {
    const epub = await buildMinimalEpub({
      title: "T",
      authors: ["A"],
      body: '<p>Before image.</p><p><img src="cover.png"/></p><p>After image.</p>',
    });
    const out = await epubParse(epub, "t.epub");
    if ("text" in out) {
      expect(out.text).toContain("Before image.");
      expect(out.text).toContain("After image.");
      expect(out.text).not.toContain("cover.png");
    } else {
      throw new Error("expected success");
    }
  });
});

describe("epubParse — failures", () => {
  it("returns drm-protected for an ADEPT-encrypted EPUB", async () => {
    const epub = await buildMinimalEpub({ drm: "adept" });
    const out = await epubParse(epub, "drm.epub");
    expect(out).toEqual({ kind: "drm-protected" });
  });

  it("returns malformed for a corrupt ZIP", async () => {
    const epub = await buildMinimalEpub({ corruptZip: true });
    const out = await epubParse(epub, "corrupt.epub");
    expect(out).toMatchObject({ kind: "malformed" });
  });

  it("returns malformed when container.xml is missing", async () => {
    const epub = await buildMinimalEpub({ missingContainer: true });
    const out = await epubParse(epub, "no-container.epub");
    expect(out).toMatchObject({ kind: "malformed" });
  });

  it("returns empty when the body has no readable content", async () => {
    const epub = await buildMinimalEpub({
      title: "Empty",
      authors: ["X"],
      emptyBody: true,
    });
    const out = await epubParse(epub, "empty.epub");
    expect(out).toEqual({ kind: "empty" });
  });
});
