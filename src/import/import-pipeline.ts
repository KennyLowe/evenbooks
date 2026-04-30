/**
 * Import pipeline orchestrator.
 *
 * Per contracts/import-pipeline.md: takes a File from the system file picker,
 * runs the format-specific parser, computes a content-derived id, checks for
 * duplicates against the current library, paginates via the existing v1
 * `paginate()`, persists content (IndexedDB) + library entry (KV), and
 * returns a typed ImportOutcome.
 *
 * Pure pipeline — no UI side-effects beyond the noticeChannel.emit for
 * storage-full failures (per Q2 + contract: failures route to the inline
 * error slot via the returned outcome; only `storage-full` save failures
 * also fire a transient notice).
 */

import type { NoticeChannel } from "../platform/errors";
import type { Library } from "../library/library";
import { findEntry } from "../library/library";
import type { LibraryEntry } from "../library/library-entry";
import type { Book } from "../content/sample-text";
import { hashFileBytes, hashNormalisedText } from "../library/duplicates";
import { putBookContent } from "../platform/book-store";
import { paginate } from "../reader/pagination";
import { epubParse } from "./epub";
import { textImport } from "./text-import";
import type { ImportOutcome } from "./outcomes";

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB cap (Spec Assumption 6).
const ALLOWED_EXTENSIONS = new Set(["epub", "txt"]);

export async function importFile(
  file: File,
  library: Library,
  noticeChannel: NoticeChannel,
): Promise<ImportOutcome> {
  // Stage 1: Pre-flight — extension + size.
  const extension = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return { kind: "failure", reason: "unsupported-format" };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { kind: "failure", reason: "oversize" };
  }

  // Stage 2: Read bytes.
  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    return { kind: "failure", reason: "malformed" };
  }

  // Stage 3: Parse.
  let parsed: {
    format: "epub" | "text";
    title: string;
    author: string;
    text: string;
  };
  let id: string;

  if (extension === "epub") {
    const result = await epubParse(buffer, file.name);
    if ("kind" in result) {
      return { kind: "failure", reason: result.kind };
    }
    parsed = result;
    id = await hashFileBytes(buffer);
  } else {
    // extension === "txt"
    const result = await textImport(buffer, file.name);
    if ("kind" in result) {
      return { kind: "failure", reason: result.kind };
    }
    parsed = result;
    id = await hashNormalisedText(parsed.text);
  }

  // Stage 5: Duplicate check.
  const existing = findEntry(library, id);
  if (existing) {
    return { kind: "duplicate", existingEntry: existing };
  }

  // Stage 6: Paginate via the v1 engine (FR-010).
  const pages = paginate(parsed.text);
  if (pages.length === 0) {
    return { kind: "failure", reason: "empty" };
  }

  // Stage 7: Persist content to IndexedDB.
  const now = Date.now();
  try {
    await putBookContent({
      id,
      text: parsed.text,
      pages: pages.map((p) => p.text),
      storedAt: now,
    });
  } catch (e) {
    console.warn("[evenBooks] putBookContent failed:", e);
    noticeChannel.emit({ kind: "save-failed" });
    return { kind: "failure", reason: "storage-full" };
  }

  // Stage 8: Build the library entry. Caller is responsible for calling
  // saveLibrary; this pipeline returns the entry so the caller can decide
  // when and how to update the library state.
  const entry: LibraryEntry = {
    id,
    title: parsed.title,
    author: parsed.author,
    format: parsed.format,
    addedAt: now,
    lastOpenedAt: null,
    totalPages: pages.length,
  };

  const book: Book = {
    id,
    title: parsed.title,
    author: parsed.author,
    format: parsed.format,
    text: parsed.text,
  };

  return { kind: "success", book, entry };
}
