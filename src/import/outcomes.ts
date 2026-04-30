/**
 * Typed import outcomes.
 *
 * Per contracts/import-pipeline.md: every import attempt produces an
 * ImportOutcome — either a success Book/LibraryEntry pair, a duplicate
 * confirmation, or a typed Failure. The canonical user-facing message
 * per failure reason is defined here and is part of the spec contract.
 */

import type { Book } from "../content/sample-text";
import type { LibraryEntry } from "../library/library-entry";

export type ImportFailureReason =
  | "drm-protected"
  | "malformed"
  | "unsupported-format"
  | "oversize"
  | "unsupported-encoding"
  | "empty"
  | "storage-full";

export type ImportOutcome =
  | { readonly kind: "success"; readonly book: Book; readonly entry: LibraryEntry }
  | { readonly kind: "duplicate"; readonly existingEntry: LibraryEntry }
  | { readonly kind: "failure"; readonly reason: ImportFailureReason };

const FAILURE_MESSAGES: Record<ImportFailureReason, string> = {
  "drm-protected":
    "This book is protected by DRM and can't be imported. evenBooks supports DRM-free EPUB and plain text.",
  malformed:
    "Couldn't read this file. It may be damaged or in an unsupported format.",
  "unsupported-format":
    "evenBooks supports DRM-free EPUB and plain-text (.txt) files only.",
  oversize:
    "This file is larger than evenBooks supports right now (max 50 MB).",
  "unsupported-encoding":
    "Unsupported text encoding — please save the file as UTF-8.",
  empty: "This book has no readable content.",
  "storage-full":
    "Couldn't save this book — your phone may be out of space.",
};

export function failureMessage(reason: ImportFailureReason): string {
  return FAILURE_MESSAGES[reason];
}

export const DUPLICATE_MESSAGE =
  "Already in your library — opening the existing copy.";
