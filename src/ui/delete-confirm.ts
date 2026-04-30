/**
 * Delete-confirmation overlay (v3).
 *
 * Per contracts/delete.md and research.md R5: in-page modal overlay (not
 * the native <dialog> element). Focus trap, Escape to cancel, backdrop
 * click to cancel. Single-use: each call returns a promise that resolves
 * to true (confirm) or false (cancel) and removes the overlay from the DOM.
 */

export interface ConfirmDeleteParams {
  readonly title: string;
}

/**
 * Show a confirmation overlay. Returns a promise that resolves with the
 * user's choice (true = confirm delete, false = cancel).
 */
export function confirmDelete(params: ConfirmDeleteParams): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "delete-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");

    const card = document.createElement("div");
    card.className = "delete-overlay-card";

    const heading = document.createElement("h3");
    heading.className = "delete-overlay-title";
    heading.textContent = `Delete "${params.title}"?`;

    const body = document.createElement("p");
    body.className = "delete-overlay-body";
    body.textContent =
      "This will remove the book and your saved reading position from this device. You can re-import the file later.";

    const buttons = document.createElement("div");
    buttons.className = "delete-overlay-buttons";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "delete-overlay-cancel";
    cancelBtn.textContent = "Cancel";

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "delete-overlay-confirm";
    confirmBtn.textContent = "Delete";

    buttons.append(cancelBtn, confirmBtn);
    card.append(heading, body, buttons);
    overlay.appendChild(card);

    let lastFocus: Element | null = document.activeElement;

    function close(result: boolean): void {
      overlay.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKey);
      cancelBtn.removeEventListener("click", onCancel);
      confirmBtn.removeEventListener("click", onConfirm);
      overlay.remove();
      if (lastFocus instanceof HTMLElement) {
        try {
          lastFocus.focus();
        } catch {
          /* ignore */
        }
      }
      lastFocus = null;
      resolve(result);
    }

    function onBackdrop(event: MouseEvent): void {
      if (event.target === overlay) close(false);
    }

    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
        return;
      }
      // Minimal focus trap: if Tab would leave the dialog, send focus back.
      if (event.key === "Tab") {
        const focusables = [cancelBtn, confirmBtn];
        const idx = focusables.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (event.shiftKey) {
          if (idx <= 0) {
            event.preventDefault();
            confirmBtn.focus();
          }
        } else {
          if (idx === focusables.length - 1) {
            event.preventDefault();
            cancelBtn.focus();
          }
        }
      }
    }

    function onCancel(): void {
      close(false);
    }

    function onConfirm(): void {
      close(true);
    }

    overlay.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKey);
    cancelBtn.addEventListener("click", onCancel);
    confirmBtn.addEventListener("click", onConfirm);

    document.body.appendChild(overlay);
    confirmBtn.focus();
  });
}
