/**
 * Persistence layer (v2: per-book reading position).
 *
 * Each book's reading position lives at its own KV key, namespaced by book id.
 * Read-time recovery state machine per contracts/persistence-v2.md (R6).
 * Save failures are caught and surfaced via the NoticeChannel; never thrown.
 *
 * The legacy v1 key `evenBooks.position.v1` is handled by the migration
 * step in `persistence-v2-migration.ts`; this module no longer references it.
 */

import { EvenAppBridge } from "@evenrealities/even_hub_sdk";
import type { BookId } from "../content/sample-text";
import type { NoticeChannel } from "./errors";

const POSITION_KEY_PREFIX = "evenBooks.position.";

export function positionKeyFor(bookId: BookId): string {
  return POSITION_KEY_PREFIX + bookId;
}

/**
 * Tombstone API (v3): a book id added here is treated as "just deleted;
 * ignore any in-flight position writes for ttl ms." Used by the v3 delete
 * orchestrator (research.md R6) to absorb writes that would otherwise
 * leave an orphan position key.
 */
const tombstones: Map<BookId, ReturnType<typeof setTimeout>> = new Map();

export function tombstone(id: BookId, ttlMs = 1000): void {
  const existing = tombstones.get(id);
  if (existing !== undefined) clearTimeout(existing);
  const timer = setTimeout(() => {
    tombstones.delete(id);
  }, ttlMs);
  tombstones.set(id, timer);
}

export function isTombstoned(id: BookId): boolean {
  return tombstones.has(id);
}

/** Test-only: clear all tombstones synchronously. */
export function _clearTombstonesForTests(): void {
  for (const t of tombstones.values()) clearTimeout(t);
  tombstones.clear();
}

export interface StoredPosition {
  readonly book: BookId;
  readonly page: number;
  readonly savedAt: number;
}

export type ReadResult =
  | { kind: "fresh-start" }
  | { kind: "resumed"; page: number }
  | {
      kind: "recovered";
      page: 0;
      reason: "unparseable" | "wrong-book" | "out-of-range";
    };

/**
 * Read the saved reading position for the given book.
 *
 * Always resolves with a ReadResult; never throws. Recovery cases set
 * page = 0 and surface a `recovery` notice via the caller (main.ts is
 * responsible for routing the reason to the NoticeChannel).
 */
export async function readPosition(
  bridge: EvenAppBridge,
  book: BookId,
  totalPages: number,
): Promise<ReadResult> {
  const raw = await bridge.getLocalStorage(positionKeyFor(book));

  if (raw === undefined || raw === null || raw === "") {
    return { kind: "fresh-start" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "recovered", page: 0, reason: "unparseable" };
  }

  if (!isStoredPosition(parsed)) {
    return { kind: "recovered", page: 0, reason: "unparseable" };
  }

  if (parsed.book !== book) {
    return { kind: "recovered", page: 0, reason: "wrong-book" };
  }

  if (
    !Number.isInteger(parsed.page) ||
    parsed.page < 0 ||
    parsed.page >= totalPages
  ) {
    return { kind: "recovered", page: 0, reason: "out-of-range" };
  }

  return { kind: "resumed", page: parsed.page };
}

/**
 * Write the reading position. Caught failures emit a `save-failed` notice
 * and resolve normally — the caller's reading session continues regardless.
 */
export async function writePosition(
  bridge: EvenAppBridge,
  channel: NoticeChannel,
  position: StoredPosition,
): Promise<void> {
  // If this book was just deleted (within the tombstone window), drop the
  // write silently. Per research.md R6: absorbs in-flight writes that
  // would otherwise leave an orphan position key after a delete.
  if (isTombstoned(position.book)) {
    return;
  }

  const payload = JSON.stringify(position);
  try {
    const ok = await bridge.setLocalStorage(
      positionKeyFor(position.book),
      payload,
    );
    if (!ok) {
      channel.emit({ kind: "save-failed" });
    }
  } catch (e) {
    console.warn("[evenBooks] setLocalStorage threw:", e);
    channel.emit({ kind: "save-failed" });
  }
}

function isStoredPosition(value: unknown): value is StoredPosition {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.book === "string" &&
    typeof v.page === "number" &&
    typeof v.savedAt === "number"
  );
}
