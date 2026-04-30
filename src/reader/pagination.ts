/**
 * Naive char-count pagination.
 *
 * Per Phase 0 research R1: greedy line fill, greedy page fill, hard-break
 * single words longer than CHARS_PER_LINE. The constants below are
 * provisional v1 values to be measured and tuned on real hardware in week 1.
 *
 * Pure function. Deterministic given identical inputs. No I/O.
 */

/** Provisional: ~12 px per char × 576 px display width minus 2×4 px padding. */
export const CHARS_PER_LINE = 48;

/** Provisional: ~46 px per line × 6 lines fits the 288 px display. */
export const LINES_PER_PAGE = 6;

/** Defensive cap on emitted page text. Comfortably below the SDK's
 *  2000-char `textContainerUpgrade` limit. */
export const MAX_PAGE_CHARS = 600;

export interface Page {
  readonly index: number;
  readonly text: string;
  readonly isFirst: boolean;
  readonly isLast: boolean;
}

export interface PaginateOptions {
  readonly charsPerLine?: number;
  readonly linesPerPage?: number;
}

/**
 * Paginate a body of text into glanceable pages.
 *
 * Algorithm:
 *   1. Walk the source text in word order.
 *   2. Greedily pack words into lines up to `charsPerLine` characters.
 *   3. Greedily pack lines into pages up to `linesPerPage` lines.
 *   4. Single words longer than `charsPerLine` hard-break at exactly
 *      `charsPerLine` characters (per spec assumption #5: break-anywhere).
 *   5. A double-newline (paragraph boundary) in the source is preserved as
 *      a paragraph break within a page, but never forces a page boundary.
 *
 * Returns an empty array for empty / whitespace-only input.
 */
export function paginate(text: string, opts: PaginateOptions = {}): Page[] {
  const charsPerLine = opts.charsPerLine ?? CHARS_PER_LINE;
  const linesPerPage = opts.linesPerPage ?? LINES_PER_PAGE;

  if (charsPerLine <= 0 || linesPerPage <= 0) {
    return [];
  }

  // Split into paragraphs on \n\n; ignore paragraphs that are pure whitespace.
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);

  if (paragraphs.length === 0) return [];

  // Lay out lines first (with paragraph separators preserved as a blank line),
  // then pack lines into pages.
  const lines: string[] = [];

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const paragraph = paragraphs[pi];
    const words = paragraph.split(" ").filter((w) => w.length > 0);
    let currentLine = "";

    for (const word of words) {
      if (word.length > charsPerLine) {
        // Hard-break long word. First flush whatever's on the current line.
        if (currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = "";
        }
        for (let off = 0; off < word.length; off += charsPerLine) {
          const chunk = word.slice(off, off + charsPerLine);
          if (chunk.length === charsPerLine) {
            lines.push(chunk);
          } else {
            // Tail fragment: start a new line with it; subsequent words append
            // separated by a space if they fit.
            currentLine = chunk;
          }
        }
        continue;
      }

      const candidate =
        currentLine.length === 0 ? word : currentLine + " " + word;

      if (candidate.length <= charsPerLine) {
        currentLine = candidate;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
      // No reset needed; outer loop redeclares `currentLine` each iteration.
    }

    // Paragraph separator: insert a blank line between paragraphs (but not
    // after the final paragraph).
    if (pi < paragraphs.length - 1) {
      lines.push("");
    }
  }

  if (lines.length === 0) return [];

  // Pack lines into pages.
  const pages: Page[] = [];
  let buffer: string[] = [];

  const flushPage = (isLast: boolean) => {
    // Trim leading/trailing blank lines on each page.
    while (buffer.length > 0 && buffer[0] === "") buffer.shift();
    while (buffer.length > 0 && buffer[buffer.length - 1] === "") buffer.pop();
    if (buffer.length === 0) return;

    let pageText = buffer.join("\n");
    if (pageText.length > MAX_PAGE_CHARS) {
      pageText = pageText.slice(0, MAX_PAGE_CHARS);
    }
    pages.push({
      index: pages.length,
      text: pageText,
      isFirst: pages.length === 0,
      isLast,
    });
    buffer = [];
  };

  for (const line of lines) {
    buffer.push(line);
    if (buffer.length >= linesPerPage) {
      flushPage(false);
    }
  }
  flushPage(true);

  // Repair isFirst/isLast: only the very first emitted page is first; only
  // the final emitted page is last. Above logic sets isLast greedily; ensure
  // intermediate pages are marked correctly.
  return pages.map((p, i) => ({
    ...p,
    isFirst: i === 0,
    isLast: i === pages.length - 1,
  }));
}
