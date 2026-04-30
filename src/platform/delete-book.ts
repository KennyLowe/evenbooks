/**
 * Delete orchestrator (v3).
 *
 * Per contracts/delete.md and research.md R2: coordinated three-step
 * delete with rollback. Library index first; reading-position key and
 * IndexedDB content are best-effort follow-ups (orphans there are
 * recoverable; orphans in the library are not).
 *
 * Sample is permanently undeletable (Spec FR-005).
 */

import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";
import type { NoticeChannel } from "./errors";
import type { BookId } from "../content/sample-text";
import { removeEntry, saveLibrary, type Library } from "../library/library";
import { positionKeyFor, tombstone } from "./persistence";
import { deleteBookContent } from "./book-store";

export type DeleteOutcome =
  | { kind: "deleted"; library: Library }
  | { kind: "refused"; reason: "sample-undeletable" }
  | { kind: "failed"; reason: "library-write-failed"; library: Library };

export interface DeleteBookArgs {
  readonly id: BookId;
  readonly bridge: EvenAppBridge;
  readonly channel: NoticeChannel;
  readonly library: Library;
  /** Awaited before storage cleanup. The caller passes a function that
   *  exits the active reader IF the active book matches `id`, and resolves
   *  immediately otherwise. */
  readonly exitActiveReaderIfMatching: (id: BookId) => Promise<void>;
}

export async function deleteBook(args: DeleteBookArgs): Promise<DeleteOutcome> {
  const { id, bridge, channel, library, exitActiveReaderIfMatching } = args;

  if (id === "sample") {
    return { kind: "refused", reason: "sample-undeletable" };
  }

  // 1. Exit the reader if the active book matches; awaited fully so the
  //    glasses display is settled before we delete content out from under it.
  await exitActiveReaderIfMatching(id);

  // 2. Library index first. On failure, roll back (no in-memory change);
  //    saveLibrary already surfaced the notice. Downstream steps don't run.
  const nextLib = removeEntry(library, id);
  const saveOk = await saveLibrary(bridge, channel, nextLib);
  if (!saveOk) {
    return {
      kind: "failed",
      reason: "library-write-failed",
      library,
    };
  }

  // 3. Insert tombstone — absorbs any in-flight position-write for this id.
  tombstone(id);

  // 4. Reading-position key (best-effort).
  try {
    await bridge.setLocalStorage(positionKeyFor(id), "");
  } catch (e) {
    console.warn(
      "[evenBooks] delete: position-key clear failed (orphan; harmless):",
      e,
    );
  }

  // 5. IndexedDB content (best-effort).
  try {
    await deleteBookContent(id);
  } catch (e) {
    console.warn(
      "[evenBooks] delete: deleteBookContent failed (orphan; harmless):",
      e,
    );
  }

  return { kind: "deleted", library: nextLib };
}
