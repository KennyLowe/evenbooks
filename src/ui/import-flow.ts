/**
 * Phone-side import flow UI.
 *
 * Per contracts/library-ui.md: the Add book button + hidden file input,
 * the import progress indicator, and the import error slot. The slot is
 * persistent — it dismisses on the user's next interaction (Add book tap,
 * library entry tap, or explicit close). Distinct from the v1 transient
 * notice channel, which stays for ephemeral status only.
 */

export interface ImportFlowHandle {
  /** Show the import progress indicator with the given filename. */
  showProgress(filename: string): void;
  /** Hide the import progress indicator. */
  hideProgress(): void;
  /** Show the import error slot with the given message. Persists until
   *  hideError() is called or the user taps Add book / a library entry. */
  showError(message: string): void;
  /** Hide the import error slot. */
  hideError(): void;
}

export function mountImportFlow(
  onFile: (file: File) => void,
): ImportFlowHandle {
  const button = document.querySelector<HTMLButtonElement>(".import .add-book");
  const picker = document.querySelector<HTMLInputElement>(
    ".import .file-picker",
  );
  const progress = document.querySelector<HTMLElement>(".import-progress");
  const progressText = document.querySelector<HTMLElement>(
    ".import-progress .progress-text",
  );
  const errorEl = document.querySelector<HTMLElement>(".import-error");

  if (!button || !picker || !progress || !progressText || !errorEl) {
    throw new Error("import-flow: missing required elements in index.html");
  }

  // Hidden input clicked programmatically when the visible button is tapped.
  button.addEventListener("click", () => {
    // Tapping Add book dismisses any persistent error from a prior import.
    errorEl.hidden = true;
    picker.click();
  });

  picker.addEventListener("change", () => {
    const file = picker.files?.[0];
    // Reset value so the same file can be re-selected later (Phase 0 R7).
    picker.value = "";
    if (!file) return;
    onFile(file);
  });

  return {
    showProgress(filename) {
      progressText.textContent = `Importing '${filename}'…`;
      progress.hidden = false;
      button.disabled = true;
    },
    hideProgress() {
      progress.hidden = true;
      button.disabled = false;
    },
    showError(message) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    },
    hideError() {
      errorEl.hidden = true;
    },
  };
}
