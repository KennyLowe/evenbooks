// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { pdfParse } from "../../src/import/pdf";
import { buildImageOnlyPdf, buildMinimalPdf } from "./_pdf-fixtures";

describe("pdfParse — happy path", () => {
  it("parses a minimal PDF and extracts body text", async () => {
    const pdf = await buildMinimalPdf({
      title: "My Test Book",
      author: "Test Author",
      body: "Hello from a synthetic PDF.\nIt has two lines.",
    });
    const out = await pdfParse(pdf, "test.pdf");
    if ("kind" in out) {
      throw new Error("expected success, got " + JSON.stringify(out));
    }
    expect(out.format).toBe("pdf");
    expect(out.title).toBe("My Test Book");
    expect(out.author).toBe("Test Author");
    expect(out.text).toContain("Hello from a synthetic PDF");
    expect(out.text).toContain("It has two lines");
  });

  it("falls back to filename when title metadata is missing", async () => {
    const pdf = await buildMinimalPdf({
      author: "Anon",
      body: "Some body text that is long enough to pass the image-only-pdf threshold check, repeated several times to reach a comfortable margin above the floor.",
    });
    const out = await pdfParse(pdf, "Manuscript.pdf");
    if ("kind" in out) {
      throw new Error("expected success");
    }
    expect(out.title).toBe("Manuscript");
  });

  it("defaults author to 'Unknown' when creator metadata is absent", async () => {
    const pdf = await buildMinimalPdf({
      title: "Anon Work",
      body:
        "Body text long enough to pass the image-only threshold for a small file. " +
        "Filler filler filler filler filler filler filler filler filler.",
    });
    const out = await pdfParse(pdf, "x.pdf");
    if ("kind" in out) throw new Error("expected success");
    expect(out.author).toBe("Unknown");
  });
});

describe("pdfParse — line-unwrap heuristic", () => {
  it("un-hyphenates a word broken across lines", async () => {
    // Use a body with a trailing-hyphen line break.
    // pdf-lib draws lines on whatever Y we ask, so producing a hyphen is
    // simply embedding it in the text.
    const pdf = await buildMinimalPdf({
      title: "Hyphen Test",
      author: "X",
      body:
        "This sentence demonstrates a trans-\n" +
        "lation from one line to the next, with enough body text to clear the image-only threshold for a small synthetic PDF fixture.",
    });
    const out = await pdfParse(pdf, "x.pdf");
    if ("kind" in out) throw new Error("expected success");
    expect(out.text).toContain("translation");
    expect(out.text).not.toContain("trans-lation");
    expect(out.text).not.toContain("trans- lation");
  });

  it("inserts a paragraph break after sentence-ending punctuation", async () => {
    const pdf = await buildMinimalPdf({
      title: "Paragraph Test",
      author: "X",
      body: "End of one thought.\nStart of the next thought continues for a while to ensure we are above the image-only threshold.",
    });
    const out = await pdfParse(pdf, "x.pdf");
    if ("kind" in out) throw new Error("expected success");
    // Paragraph break (\n\n) appears between the two sentences.
    expect(out.text).toMatch(/End of one thought\.\n\nStart of the next/);
  });
});

describe("pdfParse — failures", () => {
  it("returns image-only-pdf when a PDF has almost no text", async () => {
    const pdf = await buildImageOnlyPdf();
    const out = await pdfParse(pdf, "scan.pdf");
    expect(out).toEqual({ kind: "image-only-pdf" });
  });

  it("returns malformed for a non-PDF buffer", async () => {
    const buf = new TextEncoder().encode("This is not a PDF.").buffer;
    const out = await pdfParse(buf, "fake.pdf");
    expect(out).toMatchObject({ kind: "malformed" });
  });
});
