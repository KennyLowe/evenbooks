/**
 * IndexedDB wrapper for bulky book content.
 *
 * Per contracts/persistence-v2.md: stores per-book full text + paginated
 * pages keyed by BookId. The bundled sample short-circuits to the in-memory
 * SAMPLE_BOOK constant — never touches IndexedDB.
 *
 * Cache-loss recovery: getBookContent returns null when the entry is missing
 * (e.g. evicted by OS storage pressure). Callers handle null by surfacing a
 * notice rather than crashing.
 */

import { SAMPLE_BOOK, type BookId } from "../content/sample-text";
import { paginate } from "../reader/pagination";

const DB_NAME = "evenBooks";
const DB_VERSION = 1;
const STORE_NAME = "books";

export interface StoredBookContent {
  readonly id: BookId;
  readonly text: string;
  readonly pages: string[];
  readonly storedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function txReadonly(db: IDBDatabase): IDBObjectStore {
  return db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME);
}

function txReadwrite(db: IDBDatabase): IDBObjectStore {
  return db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME);
}

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Read a book's stored content. Returns null if absent (never imported, or
 * evicted from IndexedDB by OS storage pressure).
 *
 * Special case: id === "sample" short-circuits to the bundled SAMPLE_BOOK
 * with pages computed on the fly. The sample never has an IndexedDB record.
 */
export async function getBookContent(
  id: BookId,
): Promise<StoredBookContent | null> {
  if (id === "sample") {
    const pages = paginate(SAMPLE_BOOK.text);
    return {
      id: "sample",
      text: SAMPLE_BOOK.text,
      pages: pages.map((p) => p.text),
      storedAt: 0,
    };
  }

  const db = await openDb();
  const result = await reqAsPromise(txReadonly(db).get(id));
  return (result as StoredBookContent | undefined) ?? null;
}

/** Write or replace book content. */
export async function putBookContent(
  content: StoredBookContent,
): Promise<void> {
  if (content.id === "sample") {
    // Defensive — never persist the bundled sample. If a caller tries, drop
    // silently rather than corrupting the short-circuit invariant.
    return;
  }
  const db = await openDb();
  await reqAsPromise(txReadwrite(db).put(content));
}

/** Remove a book's content. (Unused in v2; included for symmetry.) */
export async function deleteBookContent(id: BookId): Promise<void> {
  if (id === "sample") return;
  const db = await openDb();
  await reqAsPromise(txReadwrite(db).delete(id));
}

/** Test-only: reset the cached connection so a fresh DB is opened. */
export function _resetForTests(): void {
  dbPromise = null;
}
