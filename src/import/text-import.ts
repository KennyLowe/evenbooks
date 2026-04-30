/**
 * Plain-text import.
 *
 * Per contracts/import-pipeline.md and Phase 0 R6: UTF-8 only via fatal
 * TextDecoder; strip a UTF-8 BOM if present; refuse non-UTF-8 with
 * `unsupported-encoding`; refuse empty content with `empty`.
 */

export type ParsedBook = {
  format: "text";
  title: string;
  author: string;
  text: string;
};

export type TextFailure =
  | { kind: "unsupported-encoding" }
  | { kind: "empty" };

const UTF8_BOM_BYTES = new Uint8Array([0xef, 0xbb, 0xbf]);

export async function textImport(
  buffer: ArrayBuffer,
  filename: string,
): Promise<ParsedBook | TextFailure> {
  let bytes = new Uint8Array(buffer);

  // Strip a UTF-8 BOM if present.
  if (
    bytes.length >= 3 &&
    bytes[0] === UTF8_BOM_BYTES[0] &&
    bytes[1] === UTF8_BOM_BYTES[1] &&
    bytes[2] === UTF8_BOM_BYTES[2]
  ) {
    bytes = bytes.slice(3);
  }

  let raw: string;
  try {
    raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { kind: "unsupported-encoding" };
  }

  // Normalise whitespace: collapse multiple newlines to \n\n (paragraph),
  // collapse other whitespace runs to a single space, trim ends.
  const normalised = raw
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((para) => para.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0)
    .join("\n\n");

  if (normalised.length === 0) {
    return { kind: "empty" };
  }

  return {
    format: "text",
    title: filename.replace(/\.txt$/i, ""),
    author: "Unknown",
    text: normalised,
  };
}
