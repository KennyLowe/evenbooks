/**
 * Phone-side library view.
 *
 * Per contracts/library-ui.md: renders the library entries as a <ul> in the
 * .library section of #phone-status. Tap on an entry calls onTap with the
 * book id. The view is purely a renderer; state lives in the library state
 * machine (src/library/library.ts) and is updated by main.ts.
 */

import type { BookId } from "../content/sample-text";
import type { Library } from "../library/library";

export interface LibraryViewHandle {
  /** Render (or re-render) all library entries. */
  renderEntries(library: Library): void;
  /** Mark a specific entry as content-evicted (visual de-emphasis). */
  markEvicted(id: BookId): void;
}

export function mountLibraryView(
  onTap: (id: BookId) => void,
): LibraryViewHandle {
  const list = document.querySelector<HTMLUListElement>(".library .entries");
  if (!list) {
    throw new Error("library-view: missing .library .entries in index.html");
  }

  // Single delegated click handler — survives re-renders.
  list.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const li = target.closest<HTMLLIElement>("li.entry");
    if (!li) return;
    const id = li.dataset.bookId;
    if (!id) return;
    onTap(id);
  });

  return {
    renderEntries(library) {
      list.innerHTML = "";
      for (const entry of library.entries) {
        const li = document.createElement("li");
        li.className = "entry";
        li.dataset.bookId = entry.id;

        const title = document.createElement("p");
        title.className = "entry-title";
        title.textContent = entry.title;
        li.appendChild(title);

        const author = document.createElement("p");
        author.className = "entry-author";
        author.textContent = entry.author;
        li.appendChild(author);

        list.appendChild(li);
      }
    },
    markEvicted(id) {
      const li = list.querySelector<HTMLLIElement>(
        `li.entry[data-book-id="${cssEscape(id)}"]`,
      );
      if (li) li.dataset.content = "evicted";
    },
  };
}

function cssEscape(value: string): string {
  // Minimal — book ids are 16 hex chars or "sample"; nothing to escape.
  // This stub keeps the door open for future ids that might need escaping.
  return value.replace(/["\\]/g, "\\$&");
}
