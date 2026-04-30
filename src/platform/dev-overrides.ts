/**
 * Dev-only URL query overrides.
 *
 * Read once at bootstrap. Active only when `import.meta.env.DEV` is true,
 * so production builds ignore them entirely.
 *
 * Recognised:
 *   ?reset          — clear all evenBooks storage (KV keys + IndexedDB) on
 *                     launch. Forces a fresh-install state. Intended for
 *                     testing migration / first-launch flows.
 *   ?lines=<n>      — override LINES_PER_PAGE for the pagination engine.
 *                     Intended for hardware-tuning iteration.
 *   ?chars=<n>      — override CHARS_PER_LINE.
 */

import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";

export interface DevOverrides {
  readonly reset: boolean;
  readonly linesPerPage: number | null;
  readonly charsPerLine: number | null;
}

const EMPTY: DevOverrides = {
  reset: false,
  linesPerPage: null,
  charsPerLine: null,
};

export function readDevOverrides(): DevOverrides {
  if (!import.meta.env.DEV) return EMPTY;
  if (typeof window === "undefined" || !window.location) return EMPTY;

  const params = new URLSearchParams(window.location.search);

  return {
    reset: params.has("reset"),
    linesPerPage: parsePositiveInt(params.get("lines")),
    charsPerLine: parsePositiveInt(params.get("chars")),
  };
}

function parsePositiveInt(raw: string | null): number | null {
  if (raw === null || raw === "") return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Clear all evenBooks-owned storage. Used by `?reset`.
 *
 * Removes:
 *   - bridge.setLocalStorage:
 *       evenBooks.position.v1
 *       evenBooks.position.<bookId> for every entry in the current library
 *       evenBooks.library.v2
 *   - WebView IndexedDB:
 *       database `evenBooks` (entire DB deleted)
 *
 * Safe to call multiple times; idempotent. Never throws (catches and warns).
 */
export async function resetAllStorage(bridge: EvenAppBridge): Promise<void> {
  console.warn("[evenBooks] ?reset — wiping all v2 storage");

  // KV: read library to find per-book keys we should clear, then clear all.
  try {
    const rawLib = await bridge.getLocalStorage("evenBooks.library.v2");
    if (rawLib) {
      try {
        const parsed = JSON.parse(rawLib) as {
          entries?: Array<{ id?: string }>;
        };
        if (parsed.entries) {
          for (const entry of parsed.entries) {
            if (entry.id) {
              await bridge.setLocalStorage(
                "evenBooks.position." + entry.id,
                "",
              );
            }
          }
        }
      } catch {
        /* ignore — we'll zero the library key below regardless */
      }
    }
    await bridge.setLocalStorage("evenBooks.library.v2", "");
    await bridge.setLocalStorage("evenBooks.position.v1", "");
    await bridge.setLocalStorage("evenBooks.position.sample", "");
  } catch (e) {
    console.warn("[evenBooks] ?reset — KV clear failed:", e);
  }

  // IndexedDB: delete the whole database.
  try {
    if (typeof indexedDB !== "undefined") {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase("evenBooks");
        req.onsuccess = () => resolve();
        req.onerror = () => resolve(); // best-effort
        req.onblocked = () => resolve();
      });
    }
  } catch (e) {
    console.warn("[evenBooks] ?reset — IndexedDB clear failed:", e);
  }
}
