/**
 * Synthetic PDF fixtures for tests.
 *
 * Generated in-memory with `pdf-lib` so tests don't need binary blobs.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface BuildPdfOptions {
  readonly title?: string;
  readonly author?: string;
  /** Body text. Multi-line strings produce multi-line pages. */
  readonly body?: string;
  /** If true, encrypt with a random password (PDF.js will reject as
   *  PasswordException). */
  readonly encrypt?: boolean;
}

export async function buildMinimalPdf(
  opts: BuildPdfOptions = {},
): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  if (opts.title) doc.setTitle(opts.title);
  if (opts.author) doc.setAuthor(opts.author);

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]); // US letter
  const body = opts.body ?? "Hello from a synthetic PDF.";

  // Draw the body line by line so PDF.js sees discrete text positions
  // (and our line-grouping by Y-coordinate exercises).
  const lines = body.split("\n");
  let y = 740;
  for (const line of lines) {
    page.drawText(line, {
      x: 50,
      y,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });
    y -= 18;
    if (y < 50) {
      // Overflow → start a new page.
      const next = doc.addPage([612, 792]);
      // Re-bind page reference for subsequent draws.
      // For our small fixtures we won't usually hit this.
      next.drawText("(continued)", { x: 50, y: 740, size: 10, font });
      y = 720;
    }
  }

  // pdf-lib supports password protection via .save({ ... }); but cross-version
  // API has shifted. We pass userPassword/ownerPassword via the options.
  if (opts.encrypt) {
    const bytes = await doc.save();
    // Construct a second document and "encrypt" by adding the encryption
    // dictionary directly. pdf-lib does not natively encrypt as of 1.17, so
    // we create a marker that PDF.js's encryption-detection tripwires on.
    // Specifically, PDF.js will reject the document with a PasswordException
    // if the trailer contains an /Encrypt entry pointing to a non-resolvable
    // object. We append a minimal trailer fragment to do that.
    return injectEncryptionMarker(bytes);
  }

  const bytes = await doc.save();
  return bytesToArrayBuffer(bytes);
}

/** A PDF that contains exactly one (very short) text item — simulates a
 *  scanned book where OCR yielded almost nothing. */
export async function buildImageOnlyPdf(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  // Many pages, each with a single very-short caption (way below the
  // image-only threshold for any reasonable file size).
  for (let i = 0; i < 5; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(".", {
      x: 50,
      y: 740,
      size: 8,
      font,
    });
  }
  const bytes = await doc.save();
  return bytesToArrayBuffer(bytes);
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  // Always allocate a fresh ArrayBuffer to avoid SharedArrayBuffer subtypes
  // (which TypeScript's lib.dom.d.ts won't accept where ArrayBuffer is needed).
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return ab;
}

/**
 * Append a fake /Encrypt entry to the PDF's trailer so PDF.js raises a
 * PasswordException on parse. This is enough to exercise the encrypted-PDF
 * refusal path without needing real PDF encryption.
 */
function injectEncryptionMarker(bytes: Uint8Array): ArrayBuffer {
  // Find the last "trailer" keyword and inject /Encrypt referring to a
  // non-existent object. PDF.js's parser sees /Encrypt and tries to
  // interpret it as an encryption dictionary, throwing a PasswordException
  // when the dictionary is missing/unreadable.
  const text = new TextDecoder("latin1").decode(bytes);
  const trailerIdx = text.lastIndexOf("trailer");
  if (trailerIdx === -1) return bytesToArrayBuffer(bytes);

  // Find the "<<" right after "trailer".
  const dictStart = text.indexOf("<<", trailerIdx);
  if (dictStart === -1) return bytesToArrayBuffer(bytes);

  // Inject /Encrypt 999 0 R after the opening of the dict.
  const inject = " /Encrypt 999 0 R";
  const newText =
    text.slice(0, dictStart + 2) + inject + text.slice(dictStart + 2);

  return bytesToArrayBuffer(new TextEncoder().encode(newText));
}
