import { describe, expect, it } from "vitest";
import {
  hashFileBytes,
  hashNormalisedText,
} from "../../src/library/duplicates";

describe("hashFileBytes", () => {
  it("produces 16 lowercase hex chars", async () => {
    const buf = new TextEncoder().encode("hello world").buffer;
    const id = await hashFileBytes(buf);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic — same buffer → same id", async () => {
    const buf = new TextEncoder().encode("identical input").buffer;
    const a = await hashFileBytes(buf);
    const b = await hashFileBytes(buf);
    expect(a).toBe(b);
  });

  it("different buffers → different ids", async () => {
    const a = await hashFileBytes(new TextEncoder().encode("aaa").buffer);
    const b = await hashFileBytes(new TextEncoder().encode("bbb").buffer);
    expect(a).not.toBe(b);
  });

  it("never produces literal 'sample'", async () => {
    // Even if some carefully-crafted input could hash to "sample" in the
    // first 16 chars, hex-encoding cannot produce the letter 's' / 'm' / 'p'
    // / 'l' (only 0-9 and a-f). So this is structurally impossible.
    const id = await hashFileBytes(
      new TextEncoder().encode("evenBooks sample bundled").buffer,
    );
    expect(id).not.toBe("sample");
    // Defensive: also confirm the alphabet.
    expect(id).toMatch(/^[0-9a-f]+$/);
  });
});

describe("hashNormalisedText", () => {
  it("produces 16 lowercase hex chars", async () => {
    const id = await hashNormalisedText("hello");
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it("same text → same id", async () => {
    const a = await hashNormalisedText("the same content");
    const b = await hashNormalisedText("the same content");
    expect(a).toBe(b);
  });

  it("different text → different ids", async () => {
    const a = await hashNormalisedText("aaa");
    const b = await hashNormalisedText("bbb");
    expect(a).not.toBe(b);
  });
});
