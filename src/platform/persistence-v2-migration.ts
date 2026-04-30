/**
 * One-shot v1 → v2 persistence migration.
 *
 * Per contracts/persistence-v2.md and Spec Clarification Q1: migrate the
 * v1 reading-position key onto the bundled sample's per-book entry, then
 * delete the v1 key. Idempotent. Silent on success. Notice on failure.
 *
 * Runs at bootstrap, before the library view is rendered or the reader
 * enters glasses-side reading.
 */

import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";
import type { NoticeChannel } from "./errors";
import { positionKeyFor } from "./persistence";
import {
  addEntry,
  bootstrapWithSample,
  findEntry,
  saveLibrary,
  type Library,
} from "../library/library";

const V1_KEY = "evenBooks.position.v1";

export type MigrationResult =
  | { kind: "no-migration-needed" }
  | { kind: "migrated"; page: number }
  | { kind: "migration-failed"; reason: "v1-payload-unparseable" };

interface StoredPositionV1 {
  book: unknown;
  page: unknown;
  savedAt: unknown;
}

function isStoredPositionV1(value: unknown): value is StoredPositionV1 {
  return typeof value === "object" && value !== null;
}

/**
 * Run the v1 → v2 migration if the v1 key is present. Modifies the
 * provided library in-place by returning a new library with the sample
 * entry added/updated. On migration success the v1 key is deleted; on
 * parse failure the v1 key is preserved for forensics.
 */
export async function migrateV1IfNeeded(
  bridge: EvenAppBridge,
  channel: NoticeChannel,
  library: Library,
  sampleTotalPages: number,
): Promise<{ library: Library; result: MigrationResult }> {
  const raw = await bridge.getLocalStorage(V1_KEY);

  if (raw === undefined || raw === null || raw === "") {
    return { library, result: { kind: "no-migration-needed" } };
  }

  // Idempotence: if the v2 library already has a sample entry that's been
  // opened (lastOpenedAt set), the migration ran before but the v1 key
  // wasn't deleted. Delete it now and proceed as no-op.
  const existingSample = findEntry(library, "sample");
  if (existingSample && existingSample.lastOpenedAt !== null) {
    try {
      await bridge.setLocalStorage(V1_KEY, "");
    } catch {
      /* ignore — the v2 state is correct */
    }
    return { library, result: { kind: "no-migration-needed" } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("[evenBooks] v1 position payload unparseable; preserving for forensics:", raw);
    channel.emit({ kind: "recovery", reason: "unparseable" });
    return {
      library,
      result: { kind: "migration-failed", reason: "v1-payload-unparseable" },
    };
  }

  if (!isStoredPositionV1(parsed) || typeof parsed.page !== "number") {
    console.warn("[evenBooks] v1 position payload shape invalid; preserving for forensics");
    channel.emit({ kind: "recovery", reason: "unparseable" });
    return {
      library,
      result: { kind: "migration-failed", reason: "v1-payload-unparseable" },
    };
  }

  const now = Date.now();
  const clampedPage = Math.max(
    0,
    Math.min(Math.floor(parsed.page), Math.max(0, sampleTotalPages - 1)),
  );

  // Write the migrated position under the v2 key.
  try {
    await bridge.setLocalStorage(
      positionKeyFor("sample"),
      JSON.stringify({ book: "sample", page: clampedPage, savedAt: now }),
    );
  } catch (e) {
    console.warn("[evenBooks] migration position write failed:", e);
    channel.emit({ kind: "save-failed" });
    return {
      library,
      result: { kind: "migration-failed", reason: "v1-payload-unparseable" },
    };
  }

  // Add or refresh the sample entry in the library.
  const seeded = library.entries.length === 0
    ? bootstrapWithSample(sampleTotalPages, now)
    : library;
  const sample = findEntry(seeded, "sample") ?? bootstrapWithSample(sampleTotalPages, now).entries[0];
  const updatedSample = { ...sample, lastOpenedAt: now };
  const nextLibrary = addEntry(seeded, updatedSample);

  await saveLibrary(bridge, channel, nextLibrary);

  // Delete the v1 key now that migration is complete.
  try {
    await bridge.setLocalStorage(V1_KEY, "");
  } catch {
    /* ignore — best-effort cleanup */
  }

  return {
    library: nextLibrary,
    result: { kind: "migrated", page: clampedPage },
  };
}
