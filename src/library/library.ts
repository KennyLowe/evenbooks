/**
 * Library state — in-memory representation + persisted index.
 *
 * Per contracts/persistence-v2.md: the library index lives at
 * `evenBooks.library.v2` in the SDK KV store. This module provides pure
 * helpers for mutation (addEntry, bumpEntry, markOpened) and async
 * load/save against the bridge.
 *
 * Sort order is most-recent-action first; sorting happens in-memory at load
 * time and after every mutation.
 */

import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";
import type { NoticeChannel } from "../platform/errors";
import { compareLibraryEntries, type LibraryEntry } from "./library-entry";
import type { BookId } from "../content/sample-text";

export const LIBRARY_KEY = "evenBooks.library.v2";

export interface Library {
  readonly entries: readonly LibraryEntry[];
  readonly version: 2;
}

const EMPTY: Library = { entries: [], version: 2 };

export function emptyLibrary(): Library {
  return EMPTY;
}

/** Add or replace an entry, then re-sort. */
export function addEntry(library: Library, entry: LibraryEntry): Library {
  const others = library.entries.filter((e) => e.id !== entry.id);
  const next = [...others, entry].sort(compareLibraryEntries);
  return { ...library, entries: next };
}

/** Remove an entry by id; if absent, returns the library unchanged. */
export function removeEntry(library: Library, id: BookId): Library {
  if (!library.entries.some((e) => e.id === id)) return library;
  return { ...library, entries: library.entries.filter((e) => e.id !== id) };
}

/** Bump an existing entry's addedAt to `ts` (used for duplicate handling). */
export function bumpEntry(library: Library, id: BookId, ts: number): Library {
  const next = library.entries.map((e) =>
    e.id === id ? { ...e, addedAt: ts } : e,
  );
  return { ...library, entries: [...next].sort(compareLibraryEntries) };
}

/** Update lastOpenedAt on an entry. */
export function markOpened(library: Library, id: BookId, ts: number): Library {
  const next = library.entries.map((e) =>
    e.id === id ? { ...e, lastOpenedAt: ts } : e,
  );
  return { ...library, entries: [...next].sort(compareLibraryEntries) };
}

export function findEntry(
  library: Library,
  id: BookId,
): LibraryEntry | undefined {
  return library.entries.find((e) => e.id === id);
}

/** Bootstrap a fresh library containing only the bundled sample entry. */
export function bootstrapWithSample(totalPages: number, now: number): Library {
  const sample: LibraryEntry = {
    id: "sample",
    title: "The Tell-Tale Heart",
    author: "Edgar Allan Poe",
    format: "bundled",
    addedAt: now,
    lastOpenedAt: null,
    totalPages,
  };
  return { entries: [sample], version: 2 };
}

interface StoredLibrary {
  version: number;
  entries: unknown[];
}

function isStoredLibrary(value: unknown): value is StoredLibrary {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.version === 2 && Array.isArray(v.entries);
}

function isLibraryEntry(value: unknown): value is LibraryEntry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.title === "string" &&
    typeof e.author === "string" &&
    typeof e.format === "string" &&
    typeof e.addedAt === "number" &&
    (e.lastOpenedAt === null || typeof e.lastOpenedAt === "number") &&
    typeof e.totalPages === "number"
  );
}

/**
 * Load the library from KV. On any read or parse failure, returns an empty
 * library and emits no notice (the caller is expected to bootstrap with
 * the sample entry, which is indistinguishable from a fresh install).
 *
 * The exception is when KV returned a non-empty payload that failed to
 * parse — that's a real recovery event worth surfacing. The caller can
 * detect this by checking the return tuple's `recovered` flag.
 */
export async function loadLibrary(
  bridge: EvenAppBridge,
  channel: NoticeChannel,
): Promise<{ library: Library; recovered: boolean }> {
  const raw = await bridge.getLocalStorage(LIBRARY_KEY);
  if (raw === undefined || raw === null || raw === "") {
    return { library: EMPTY, recovered: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    channel.emit({ kind: "recovery", reason: "unparseable" });
    return { library: EMPTY, recovered: true };
  }

  if (!isStoredLibrary(parsed)) {
    channel.emit({ kind: "recovery", reason: "unparseable" });
    return { library: EMPTY, recovered: true };
  }

  const entries = parsed.entries.filter(isLibraryEntry).slice();
  entries.sort(compareLibraryEntries);
  return {
    library: { entries, version: 2 },
    recovered: false,
  };
}

/**
 * Save the library. Returns `true` on success, `false` on failure (failure
 * also emits a save-failed notice). Never throws.
 *
 * The boolean return lets the v3 delete orchestrator detect a library-write
 * failure and roll back. v2 callers can ignore the return value and rely
 * on the notice channel as before.
 */
export async function saveLibrary(
  bridge: EvenAppBridge,
  channel: NoticeChannel,
  library: Library,
): Promise<boolean> {
  const payload = JSON.stringify({
    version: 2,
    entries: library.entries,
  });
  try {
    const ok = await bridge.setLocalStorage(LIBRARY_KEY, payload);
    if (!ok) {
      channel.emit({ kind: "save-failed" });
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[evenBooks] saveLibrary threw:", e);
    channel.emit({ kind: "save-failed" });
    return false;
  }
}
