/**
 * PDF parser (v4).
 *
 * Per contracts/pdf-parse.md and Phase 0 R1–R5: pdfjs-dist via dynamic
 * import (caller in import-pipeline.ts) so the parser code is only loaded
 * when the user actually picks a `.pdf`. Worker-mode in production with a
 * main-thread fallback for hostile WebView environments.
 *
 * Text extraction walks getTextContent items per page, builds line strings
 * by Y-coordinate, then applies the line-unwrap heuristic (R2). Image-only
 * detection is a length threshold (R3).
 */

export type ParsedBook = {
  format: "pdf";
  title: string;
  author: string;
  text: string;
};

export type PdfFailure =
  | { kind: "drm-protected" }
  | { kind: "malformed"; detail?: string }
  | { kind: "empty" }
  | { kind: "image-only-pdf" };

interface PdfTextItem {
  str: string;
  transform?: number[]; // [a, b, c, d, e, f] — [4]=x, [5]=y
  hasEOL?: boolean;
}

interface PdfTextContent {
  items: PdfTextItem[];
}

interface PdfPage {
  getTextContent(): Promise<PdfTextContent>;
}

interface PdfMetadata {
  info?: Record<string, unknown>;
}

interface PdfDocument {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
  getMetadata(): Promise<PdfMetadata>;
}

interface PdfjsLib {
  getDocument(args: {
    data: Uint8Array;
    disableWorker?: boolean;
    isEvalSupported?: boolean;
  }): { promise: Promise<PdfDocument> };
  GlobalWorkerOptions: { workerSrc: string };
}

let cachedLib: PdfjsLib | null = null;
let workerConfigured = false;
let workerAvailable = false;

/** Lazy-load pdfjs-dist on first call. The dynamic import means the
 *  pdfjs-dist chunk is only fetched when the user picks a `.pdf`.
 *
 *  Use the "legacy" build path: it works in modern browsers, in older
 *  WebViews, and in Node/jsdom test environments. The modern ESM build
 *  relies on platform features that jsdom doesn't fully provide. */
async function loadPdfjs(): Promise<PdfjsLib> {
  if (cachedLib) return cachedLib;
  // @ts-expect-error — pdfjs-dist legacy build types differ from our interface
  const lib = (await import(
    "pdfjs-dist/legacy/build/pdf.mjs"
  )) as PdfjsLib;

  if (!workerConfigured) {
    // pdfjs-dist's static block sets workerSrc to "./pdf.worker.mjs" on Node
    // and uses `await import(workerSrc)` for fake-worker fallback. In Node
    // (vitest), the Vite-only `?url` suffix returns a bogus root-relative
    // path that Node then mis-resolves as `C:\node_modules\...`. So in Node
    // we leave the static-block default and rely on `disableWorker: true`.
    // In the browser, we must override workerSrc with a real URL.
    const isNode =
      typeof process !== "undefined" &&
      process.versions != null &&
      process.versions.node != null;
    if (!isNode) {
      try {
        const workerUrl = (
          await import(
            /* @vite-ignore */ "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"
          )
        ).default;
        lib.GlobalWorkerOptions.workerSrc = workerUrl;
        workerAvailable = true;
      } catch {
        workerAvailable = false;
      }
    } else {
      // Node/test env — pdfjs-dist will set workerSrc internally.
      workerAvailable = false;
    }
    workerConfigured = true;
  }

  cachedLib = lib;
  return lib;
}

export async function pdfParse(
  buffer: ArrayBuffer,
  filename: string,
): Promise<ParsedBook | PdfFailure> {
  let lib: PdfjsLib;
  try {
    lib = await loadPdfjs();
  } catch (e) {
    console.warn("[evenBooks] pdfjs-dist failed to load:", e);
    return { kind: "malformed", detail: "pdfjs-dist load failed" };
  }

  const data = new Uint8Array(buffer);

  // First attempt: with worker if available, main-thread otherwise.
  let pdf: PdfDocument;
  try {
    pdf = await lib.getDocument({
      data,
      disableWorker: !workerAvailable,
      isEvalSupported: false,
    }).promise;
  } catch (firstError: unknown) {
    if (isPasswordException(firstError)) {
      return { kind: "drm-protected" };
    }

    // Worker-load failure (despite our best-effort detection): retry with
    // workers explicitly disabled.
    if (isWorkerError(firstError) && workerAvailable) {
      console.warn(
        "[evenBooks] pdf worker failed; falling back to main thread:",
        firstError,
      );
      try {
        pdf = await lib.getDocument({
          data,
          disableWorker: true,
          isEvalSupported: false,
        }).promise;
      } catch (secondError: unknown) {
        if (isPasswordException(secondError)) {
          return { kind: "drm-protected" };
        }
        return { kind: "malformed", detail: stringifyError(secondError) };
      }
    } else {
      return { kind: "malformed", detail: stringifyError(firstError) };
    }
  }

  // Metadata
  let metaTitle = "";
  let metaAuthor = "";
  try {
    const meta = await pdf.getMetadata();
    const info = (meta?.info ?? {}) as Record<string, unknown>;
    if (typeof info.Title === "string") metaTitle = info.Title.trim();
    if (typeof info.Author === "string") metaAuthor = info.Author.trim();
  } catch {
    /* metadata is best-effort */
  }

  // Walk pages.
  const pageBlocks: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    let page: PdfPage;
    try {
      page = await pdf.getPage(i);
    } catch {
      continue;
    }

    let content: PdfTextContent;
    try {
      content = await page.getTextContent();
    } catch {
      continue;
    }

    const lines = itemsToLines(content.items);
    const block = unwrapLines(lines);
    if (block.length > 0) pageBlocks.push(block);
  }

  const fullText = pageBlocks.join("\n\n").replace(/[ \t]+\n/g, "\n").trim();

  // Image-only detection: per-page text density. A genuine scanned PDF has
  // near-zero text per page; a real text PDF has dozens-to-thousands.
  // Threshold: average < 15 chars/page across the document. Combined with a
  // file-size sanity floor so a tiny single-page PDF with a few words still
  // passes.
  const minPerPage = 15;
  const threshold = Math.max(
    minPerPage * pdf.numPages,
    Math.floor(buffer.byteLength / 10000),
  );
  if (fullText.length === 0) {
    return { kind: "empty" };
  }
  if (fullText.length < threshold) {
    return { kind: "image-only-pdf" };
  }

  const title =
    metaTitle.length > 0 ? metaTitle : filename.replace(/\.pdf$/i, "");
  const author = metaAuthor.length > 0 ? metaAuthor : "Unknown";

  return {
    format: "pdf",
    title,
    author,
    text: fullText,
  };
}

/**
 * Group text items into lines by Y-coordinate. Adjacent items on the same
 * Y baseline are concatenated; a Y change starts a new line. PDFs without
 * transform data fall back to splitting on hasEOL.
 */
function itemsToLines(items: readonly PdfTextItem[]): string[] {
  const lines: string[] = [];
  let currentLine = "";
  let currentY: number | null = null;

  for (const item of items) {
    const y =
      item.transform && item.transform.length >= 6 ? item.transform[5] : null;

    if (currentY === null) {
      currentY = y;
      currentLine = item.str;
    } else if (y !== null && Math.abs(y - currentY) > 0.5) {
      // New line.
      lines.push(currentLine);
      currentLine = item.str;
      currentY = y;
    } else {
      currentLine += item.str;
    }

    if (item.hasEOL) {
      lines.push(currentLine);
      currentLine = "";
      currentY = null;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines.map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l.length > 0);
}

/**
 * Apply the line-unwrap heuristic (Phase 0 R2):
 *   - trailing hyphen + alphabetic char → join with no space (un-hyphenate)
 *   - sentence-ending punctuation        → join with paragraph break "\n\n"
 *   - otherwise                          → join with single space
 */
function unwrapLines(lines: readonly string[]): string {
  if (lines.length === 0) return "";

  let out = lines[0];
  for (let i = 1; i < lines.length; i++) {
    const prev = out;
    const next = lines[i];
    const lastChar = prev[prev.length - 1] ?? "";
    const secondLast = prev[prev.length - 2] ?? "";

    if (lastChar === "-" && /[A-Za-z]/.test(secondLast)) {
      // Un-hyphenate: drop the trailing hyphen, no space.
      out = prev.slice(0, -1) + next;
    } else if (/[.!?…]["')\]]?$/.test(prev)) {
      // Sentence-end → paragraph break.
      out = prev + "\n\n" + next;
    } else {
      // Soft line break → single space.
      out = prev + " " + next;
    }
  }
  return out;
}

function isPasswordException(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { name?: string; message?: string };
  if (e.name === "PasswordException") return true;
  if (typeof e.message === "string" && /password/i.test(e.message)) return true;
  return false;
}

function isWorkerError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { name?: string; message?: string };
  if (typeof e.message !== "string") return false;
  return (
    /worker/i.test(e.message) ||
    /Setting up fake worker failed/i.test(e.message)
  );
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
