/**
 * Phone-side library view (v3).
 *
 * Per contracts/library-ui.md (v2) extended by spec 003: renders library
 * entries as a <ul>; presents per-entry delete affordance, a sort selector,
 * and a text filter input. The view is purely a renderer + event router;
 * all state lives in main.ts.
 */

import type { BookId } from "../content/sample-text";
import type { LibraryEntry } from "../library/library-entry";
import type { SortOption } from "../library/library-settings";

export interface LibraryViewCallbacks {
  readonly onTap: (id: BookId) => void;
  readonly onDelete: (id: BookId) => void;
  readonly onSortChange: (option: SortOption) => void;
  readonly onFilterChange: (query: string) => void;
}

export interface LibraryViewHandle {
  /** Render (or re-render) the visible entries (already filtered + sorted by main.ts). */
  renderEntries(
    visibleEntries: readonly LibraryEntry[],
    totalCount: number,
    query: string,
  ): void;
  /** Sync the sort selector to the active option (called once at bootstrap). */
  setSort(option: SortOption): void;
  /** Mark an entry as content-evicted (visual de-emphasis). */
  markEvicted(id: BookId): void;
}

export function mountLibraryView(
  callbacks: LibraryViewCallbacks,
): LibraryViewHandle {
  const list = document.querySelector<HTMLUListElement>(".library .entries");
  const empty = document.querySelector<HTMLElement>(".library .empty-state");
  const sortSelect = document.querySelector<HTMLSelectElement>(
    ".library .sort-select",
  );
  const filterInput = document.querySelector<HTMLInputElement>(
    ".library .filter-input",
  );

  if (!list || !empty || !sortSelect || !filterInput) {
    throw new Error(
      "library-view: missing required elements in index.html (.library .entries, .empty-state, .sort-select, .filter-input)",
    );
  }

  // Delegated click handler — survives re-renders.
  list.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    // Delete button click (anywhere inside .entry-delete).
    const deleteBtn = target.closest<HTMLButtonElement>(".entry-delete");
    if (deleteBtn) {
      event.stopPropagation();
      const id = deleteBtn.dataset.bookId;
      if (id) callbacks.onDelete(id);
      return;
    }

    // Otherwise, open the entry.
    const li = target.closest<HTMLLIElement>("li.entry");
    if (!li) return;
    const id = li.dataset.bookId;
    if (!id) return;
    callbacks.onTap(id);
  });

  sortSelect.addEventListener("change", () => {
    callbacks.onSortChange(sortSelect.value as SortOption);
  });

  filterInput.addEventListener("input", () => {
    callbacks.onFilterChange(filterInput.value);
  });

  return {
    renderEntries(visibleEntries, totalCount, query) {
      list.innerHTML = "";

      if (visibleEntries.length === 0) {
        // Empty state: show a message under the list.
        empty.hidden = false;
        if (totalCount === 0) {
          empty.textContent = "Your library is empty.";
        } else {
          empty.textContent = `No books match "${query}".`;
        }
        return;
      }
      empty.hidden = true;

      for (const entry of visibleEntries) {
        const li = document.createElement("li");
        li.className = "entry";
        li.dataset.bookId = entry.id;

        const meta = document.createElement("div");
        meta.className = "entry-meta";

        const title = document.createElement("p");
        title.className = "entry-title";
        title.textContent = entry.title;
        meta.appendChild(title);

        const author = document.createElement("p");
        author.className = "entry-author";
        author.textContent = entry.author;
        meta.appendChild(author);

        li.appendChild(meta);

        // Delete affordance: present for every entry EXCEPT the bundled sample.
        if (entry.id !== "sample") {
          const del = document.createElement("button");
          del.type = "button";
          del.className = "entry-delete";
          del.dataset.bookId = entry.id;
          del.title = `Delete "${entry.title}"`;
          del.setAttribute("aria-label", `Delete "${entry.title}"`);
          del.textContent = "✕";
          li.appendChild(del);
        }

        list.appendChild(li);
      }
    },
    setSort(option) {
      sortSelect.value = option;
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
  return value.replace(/["\\]/g, "\\$&");
}
