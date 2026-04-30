/**
 * Test-fixture helpers for v2 import tests.
 *
 * Synthesises EPUB and TXT files in-memory rather than committing binary
 * blobs to the repo. Per quickstart.md test-fixture strategy.
 */

import JSZip from "jszip";

const CONTAINER_XML = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

function opfXml(opts: {
  title?: string;
  authors?: string[];
  spine?: Array<{ href: string; id: string }>;
}): string {
  const title = opts.title ?? "";
  const authors = opts.authors ?? [];
  const spine = opts.spine ?? [{ href: "ch1.xhtml", id: "ch1" }];

  const titleTag = title ? `<dc:title>${escapeXml(title)}</dc:title>` : "";
  const authorTags = authors
    .map((a) => `<dc:creator>${escapeXml(a)}</dc:creator>`)
    .join("\n    ");
  const manifestItems = spine
    .map(
      (s) =>
        `<item id="${s.id}" href="${s.href}" media-type="application/xhtml+xml"/>`,
    )
    .join("\n    ");
  const spineRefs = spine
    .map((s) => `<itemref idref="${s.id}"/>`)
    .join("\n    ");

  return `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    ${titleTag}
    ${authorTags}
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine>
    ${spineRefs}
  </spine>
</package>`;
}

function chapterXhtml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter</title></head>
<body>
${body}
</body>
</html>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const ENCRYPTION_XML_ADEPT = `<?xml version="1.0"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <EncryptedData xmlns="http://www.w3.org/2001/04/xmlenc#">
    <EncryptionMethod Algorithm="http://ns.adobe.com/pdf/enc#RC"/>
    <CipherData><CipherReference URI="OEBPS/ch1.xhtml"/></CipherData>
  </EncryptedData>
</encryption>`;

const ENCRYPTION_XML_FONT_MANGLING = `<?xml version="1.0"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <EncryptedData xmlns="http://www.w3.org/2001/04/xmlenc#">
    <EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/>
    <CipherData><CipherReference URI="OEBPS/font.ttf"/></CipherData>
  </EncryptedData>
</encryption>`;

export interface BuildEpubOptions {
  /** EPUB <dc:title>; omit to leave the title element absent. */
  readonly title?: string;
  /** EPUB <dc:creator> entries; multiple authors get joined with `, ` by parser. */
  readonly authors?: string[];
  /** Body XHTML inserted into the spine item. Default is a short paragraph. */
  readonly body?: string;
  /** If "adept", inject Adobe ADEPT encryption.xml. If "font-mangling", inject IDPF font encryption (which is NOT DRM). If "rights", inject rights.xml. If "fairplay", inject iTunesMetadata.plist. */
  readonly drm?: "adept" | "font-mangling" | "rights" | "fairplay";
  /** If true, omit container.xml entirely → malformed. */
  readonly missingContainer?: boolean;
  /** If true, produce empty body content → empty failure. */
  readonly emptyBody?: boolean;
  /** If true, produce a corrupt ZIP (truncate the buffer at the end). */
  readonly corruptZip?: boolean;
}

export async function buildMinimalEpub(
  opts: BuildEpubOptions = {},
): Promise<ArrayBuffer> {
  const zip = new JSZip();

  // mimetype must be the first file and stored uncompressed per EPUB spec.
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  if (!opts.missingContainer) {
    zip.file("META-INF/container.xml", CONTAINER_XML);
  }

  zip.file(
    "OEBPS/content.opf",
    opfXml({
      title: opts.title,
      authors: opts.authors,
    }),
  );

  const body = opts.emptyBody
    ? ""
    : (opts.body ?? "<p>Hello from a synthetic EPUB.</p>");
  zip.file("OEBPS/ch1.xhtml", chapterXhtml(body));

  if (opts.drm === "adept") {
    zip.file("META-INF/encryption.xml", ENCRYPTION_XML_ADEPT);
  } else if (opts.drm === "font-mangling") {
    zip.file("META-INF/encryption.xml", ENCRYPTION_XML_FONT_MANGLING);
  } else if (opts.drm === "rights") {
    zip.file("META-INF/rights.xml", "<rights/>");
  } else if (opts.drm === "fairplay") {
    zip.file("META-INF/iTunesMetadata.plist", '<?xml version="1.0"?><plist/>');
  }

  const buffer = await zip.generateAsync({ type: "arraybuffer" });

  if (opts.corruptZip) {
    // Truncate the trailing central-directory bytes to corrupt the ZIP.
    return buffer.slice(0, Math.max(0, buffer.byteLength - 64));
  }

  return buffer;
}

export interface BuildTxtOptions {
  /** Add a UTF-8 BOM at the start. */
  readonly bom?: boolean;
  /** Encoding to write the bytes in. Default UTF-8. */
  readonly encoding?: "utf-8" | "latin-1";
}

export function buildTxtFile(
  content: string,
  opts: BuildTxtOptions = {},
): ArrayBuffer {
  if (opts.encoding === "latin-1") {
    // Build a Latin-1 byte sequence with a high-byte char (e.g., é = 0xE9)
    // that is invalid as standalone UTF-8.
    const bytes = new Uint8Array(content.length);
    for (let i = 0; i < content.length; i++) {
      bytes[i] = content.charCodeAt(i) & 0xff;
    }
    return bytes.buffer;
  }

  const encoder = new TextEncoder();
  const body = encoder.encode(content);

  if (opts.bom) {
    const buffer = new Uint8Array(3 + body.byteLength);
    buffer[0] = 0xef;
    buffer[1] = 0xbb;
    buffer[2] = 0xbf;
    buffer.set(body, 3);
    return buffer.buffer;
  }

  return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
}
