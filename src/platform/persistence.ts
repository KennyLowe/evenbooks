/**
 * Persistence layer.
 *
 * Single key: STORAGE_KEY. Single value shape: StoredPosition (JSON).
 * Read-time recovery state machine per contracts/persistence.md (R6).
 * Save failures are caught and surfaced via the NoticeChannel; never thrown.
 */

import { EvenAppBridge } from "@evenrealities/even_hub_sdk";
import type { BookId } from "../content/sample-text";
import type { NoticeChannel } from "./errors";

export const STORAGE_KEY = "evenBooks.position.v1";

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
  const raw = await bridge.getLocalStorage(STORAGE_KEY);

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
  const payload = JSON.stringify(position);
  try {
    const ok = await bridge.setLocalStorage(STORAGE_KEY, payload);
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
