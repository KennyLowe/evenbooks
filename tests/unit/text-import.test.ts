import { describe, expect, it } from "vitest";
import { textImport } from "../../src/import/text-import";
import { buildTxtFile } from "./_fixtures";

describe("textImport — happy path", () => {
  it("decodes a UTF-8 file and uses filename as title", async () => {
    const buf = buildTxtFile("Hello, world.\n\nSecond paragraph.");
    const out = await textImport(buf, "MyNotes.txt");
    if ("title" in out) {
      expect(out.title).toBe("MyNotes");
      expect(out.author).toBe("Unknown");
      expect(out.format).toBe("text");
      expect(out.text).toContain("Hello, world.");
      expect(out.text).toContain("Second paragraph.");
    } else {
      throw new Error("expected success, got " + JSON.stringify(out));
    }
  });

  it("strips a UTF-8 BOM cleanly", async () => {
    const buf = buildTxtFile("Body after BOM", { bom: true });
    const out = await textImport(buf, "bom.txt");
    if ("text" in out) {
      expect(out.text).toBe("Body after BOM");
      // No BOM character at the start.
      expect(out.text.charCodeAt(0)).not.toBe(0xfeff);
    } else {
      throw new Error("expected success");
    }
  });

  it("preserves paragraph boundaries (\\n\\n) but collapses internal whitespace", async () => {
    const buf = buildTxtFile("First    paragraph.\n\nSecond  paragraph.");
    const out = await textImport(buf, "x.txt");
    if ("text" in out) {
      expect(out.text).toBe("First paragraph.\n\nSecond paragraph.");
    } else {
      throw new Error("expected success");
    }
  });

  it("strips the .txt extension case-insensitively", async () => {
    const buf = buildTxtFile("Body");
    const out = await textImport(buf, "WeIrDcAsE.TXT");
    if ("title" in out) {
      expect(out.title).toBe("WeIrDcAsE");
    }
  });
});

describe("textImport — failures", () => {
  it("refuses non-UTF-8 bytes with unsupported-encoding", async () => {
    // Latin-1: "café" — the é byte 0xE9 alone is invalid as UTF-8.
    const buf = buildTxtFile("café", { encoding: "latin-1" });
    const out = await textImport(buf, "latin1.txt");
    expect(out).toEqual({ kind: "unsupported-encoding" });
  });

  it("refuses an empty file with empty", async () => {
    const buf = buildTxtFile("");
    const out = await textImport(buf, "empty.txt");
    expect(out).toEqual({ kind: "empty" });
  });

  it("refuses a whitespace-only file with empty", async () => {
    const buf = buildTxtFile("   \n\n  \t\n");
    const out = await textImport(buf, "ws.txt");
    expect(out).toEqual({ kind: "empty" });
  });
});
