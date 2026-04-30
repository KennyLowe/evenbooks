/**
 * DRM detection (Phase 0 R2).
 *
 * Pure function over the unpacked ZIP file map. Inspects three locations
 * inside an EPUB to detect the dominant DRM systems in the wild:
 *
 *   - META-INF/encryption.xml  with a non-IDPF-font algorithm → DRM
 *   - META-INF/rights.xml       (Adobe ADEPT signature)        → DRM
 *   - META-INF/iTunesMetadata.plist (Apple FairPlay signature)  → DRM
 *
 * Long-tail DRM systems (Sony Marlin, B&N PMG, etc.) may slip past detection
 * but will be caught downstream as `malformed` because the body XHTML will
 * be encrypted and produce non-text content.
 */

const IDPF_FONT_MANGLING_URI = "http://www.idpf.org/2008/embedding";

export interface ZipFileMap {
  /** Returns the file's contents as a string, or null if the file is absent. */
  getString(path: string): Promise<string | null>;
  /** Returns true if the file exists in the ZIP. */
  has(path: string): boolean;
}

/**
 * Returns true if the EPUB's ZIP shows DRM signatures.
 */
export async function detectsDrm(zip: ZipFileMap): Promise<boolean> {
  // 2. Adobe ADEPT signature
  if (zip.has("META-INF/rights.xml")) {
    return true;
  }

  // 3. Apple FairPlay signature
  if (zip.has("META-INF/iTunesMetadata.plist")) {
    return true;
  }

  // 1. encryption.xml with non-font-mangling algorithm
  if (zip.has("META-INF/encryption.xml")) {
    const xml = await zip.getString("META-INF/encryption.xml");
    if (xml === null) {
      return false;
    }
    return hasNonFontMangleEncryption(xml);
  }

  return false;
}

function hasNonFontMangleEncryption(xml: string): boolean {
  // Permissive parse — find every Algorithm attribute on EncryptionMethod.
  // If any algorithm is NOT the IDPF font-mangling URI, treat as DRM.
  const matches =
    xml.match(/<EncryptionMethod[^>]*Algorithm=["']([^"']+)["']/g) ?? [];
  if (matches.length === 0) {
    // Edge case: encryption.xml present but no recognisable EncryptionMethod
    // → treat as DRM (we can't verify it's safe).
    return true;
  }
  for (const m of matches) {
    const attr = m.match(/Algorithm=["']([^"']+)["']/);
    if (!attr) continue;
    if (attr[1] !== IDPF_FONT_MANGLING_URI) {
      return true;
    }
  }
  return false;
}
