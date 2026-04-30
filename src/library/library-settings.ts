/**
 * Library settings (v3): persisted user preferences.
 *
 * Per data-model.md and research.md R4: stored at KV key
 * `evenBooks.settings.v3`. Currently holds the active sort option.
 * Validation on read mirrors the library-index validation — parse failure
 * recovers to the default and emits a `recovery/unparseable` notice.
 */

import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";
import type { NoticeChannel } from "../platform/errors";

export type SortOption =
  | "most-recent"
  | "title-asc"
  | "author-asc"
  | "most-completed"
  | "date-added-desc";

export interface LibrarySettings {
  readonly version: 3;
  readonly sort: SortOption;
}

export const SETTINGS_KEY = "evenBooks.settings.v3";

export const DEFAULT_SETTINGS: LibrarySettings = {
  version: 3,
  sort: "most-recent",
};

const VALID_SORTS: ReadonlySet<string> = new Set([
  "most-recent",
  "title-asc",
  "author-asc",
  "most-completed",
  "date-added-desc",
]);

export async function loadSettings(
  bridge: EvenAppBridge,
  channel: NoticeChannel,
): Promise<LibrarySettings> {
  const raw = await bridge.getLocalStorage(SETTINGS_KEY);
  if (raw === undefined || raw === null || raw === "") {
    return DEFAULT_SETTINGS;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    channel.emit({ kind: "recovery", reason: "unparseable" });
    return DEFAULT_SETTINGS;
  }

  if (!isLibrarySettings(parsed)) {
    channel.emit({ kind: "recovery", reason: "unparseable" });
    return DEFAULT_SETTINGS;
  }

  return parsed;
}

export async function saveSettings(
  bridge: EvenAppBridge,
  channel: NoticeChannel,
  settings: LibrarySettings,
): Promise<void> {
  try {
    const ok = await bridge.setLocalStorage(
      SETTINGS_KEY,
      JSON.stringify(settings),
    );
    if (!ok) channel.emit({ kind: "save-failed" });
  } catch (e) {
    console.warn("[evenBooks] saveSettings threw:", e);
    channel.emit({ kind: "save-failed" });
  }
}

function isLibrarySettings(value: unknown): value is LibrarySettings {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 3 &&
    typeof v.sort === "string" &&
    VALID_SORTS.has(v.sort as string)
  );
}
