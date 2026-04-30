import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { detectsDrm, type ZipFileMap } from "../../src/import/drm";
import { buildMinimalEpub } from "./_fixtures";

async function asZipFileMap(buffer: ArrayBuffer): Promise<ZipFileMap> {
  const zip = await JSZip.loadAsync(buffer);
  return {
    has: (path) => zip.file(path) !== null,
    getString: async (path) => {
      const f = zip.file(path);
      return f ? await f.async("string") : null;
    },
  };
}

describe("detectsDrm", () => {
  it("returns false for a plain valid EPUB", async () => {
    const epub = await buildMinimalEpub({ title: "Plain", authors: ["Anon"] });
    const fileMap = await asZipFileMap(epub);
    expect(await detectsDrm(fileMap)).toBe(false);
  });

  it("returns true for ADEPT encryption.xml", async () => {
    const epub = await buildMinimalEpub({ drm: "adept" });
    const fileMap = await asZipFileMap(epub);
    expect(await detectsDrm(fileMap)).toBe(true);
  });

  it("returns true when META-INF/rights.xml is present", async () => {
    const epub = await buildMinimalEpub({ drm: "rights" });
    const fileMap = await asZipFileMap(epub);
    expect(await detectsDrm(fileMap)).toBe(true);
  });

  it("returns true when META-INF/iTunesMetadata.plist is present", async () => {
    const epub = await buildMinimalEpub({ drm: "fairplay" });
    const fileMap = await asZipFileMap(epub);
    expect(await detectsDrm(fileMap)).toBe(true);
  });

  it("returns false for IDPF font-mangling encryption only", async () => {
    const epub = await buildMinimalEpub({ drm: "font-mangling" });
    const fileMap = await asZipFileMap(epub);
    expect(await detectsDrm(fileMap)).toBe(false);
  });
});
