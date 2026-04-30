/**
 * Phone-side WebView surface.
 *
 * Per contracts/phone-ui.md: connection state + book title + author +
 * "Page X of Y" + transient notice slot. No framework. Imperative DOM
 * mutation against the structure declared in index.html.
 *
 * `describeStatus` is the pure state-to-text function (target of the
 * unit test); the rest of this module mutates the DOM.
 */

import type { Book } from "../content/sample-text";
import type { ConnectionState } from "../platform/connection";
import type { Notice } from "../platform/errors";

export interface StatusInput {
  readonly connection: ConnectionState;
  readonly book: Book;
  readonly pageIndex: number;
  readonly totalPages: number;
}

export interface StatusOutput {
  readonly connection: string;
  readonly title: string;
  readonly author: string;
  readonly progress: string;
}

const CONNECTION_LABELS: Record<ConnectionState, string> = {
  connected: "Glasses connected",
  connecting: "Connecting…",
  "not-connected": "Glasses not connected",
};

const NOTICE_MS = 5000;

const NOTICE_TEXT: Record<string, string> = {
  unparseable: "Could not restore previous position.",
  "wrong-book": "No saved position for this book.",
  "out-of-range": "Saved position is out of range; resumed at the start.",
  "save-failed": "Could not save position; reading session continues.",
};

export function describeStatus(input: StatusInput): StatusOutput {
  return {
    connection: CONNECTION_LABELS[input.connection],
    title: input.book.title,
    author: input.book.author,
    progress: `Page ${input.pageIndex + 1} of ${input.totalPages}`,
  };
}

function noticeText(notice: Notice): string {
  if (notice.kind === "save-failed") return NOTICE_TEXT["save-failed"];
  return NOTICE_TEXT[notice.reason] ?? "Something didn't go to plan.";
}

export interface PhoneStatusHandle {
  update(input: StatusInput): void;
  showNotice(notice: Notice): void;
  showClosed(lastPageIndex: number, totalPages: number): void;
  hideReading(): void;
  showReading(): void;
}

export function mountPhoneStatus(
  _initialBook: Book,
  _totalPages: number,
): PhoneStatusHandle {
  const root = document.querySelector<HTMLElement>("#phone-status");
  if (!root) {
    throw new Error("phone-status: missing #phone-status root in index.html");
  }

  const connectionEl = root.querySelector<HTMLElement>(".connection");
  const readingEl = root.querySelector<HTMLElement>(".reading");
  const titleEl = root.querySelector<HTMLElement>(".reading .title");
  const authorEl = root.querySelector<HTMLElement>(".reading .author");
  const progressEl = root.querySelector<HTMLElement>(".reading .progress");
  const noticeEl = root.querySelector<HTMLElement>(".notice");

  if (
    !connectionEl ||
    !readingEl ||
    !titleEl ||
    !authorEl ||
    !progressEl ||
    !noticeEl
  ) {
    throw new Error("phone-status: missing required child elements");
  }

  // Seed bare values; the .reading section is hidden by default in v2 and
  // shown only when a book is actively open (showReading()).
  titleEl.textContent = "";
  authorEl.textContent = "";
  progressEl.textContent = "";
  connectionEl.textContent = "Connecting…";
  connectionEl.dataset.state = "connecting";
  readingEl.hidden = true;
  noticeEl.hidden = true;

  let noticeTimer: ReturnType<typeof setTimeout> | null = null;

  return {
    update(input) {
      const out = describeStatus(input);
      connectionEl.textContent = out.connection;
      connectionEl.dataset.state = input.connection;
      titleEl.textContent = out.title;
      authorEl.textContent = out.author;
      progressEl.textContent = out.progress;
    },
    showNotice(notice) {
      noticeEl.textContent = noticeText(notice);
      noticeEl.hidden = false;
      if (noticeTimer !== null) clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => {
        noticeEl.hidden = true;
        noticeTimer = null;
      }, NOTICE_MS);
    },
    showClosed(lastPageIndex, totalPages) {
      progressEl.textContent = `Reader closed (was on Page ${lastPageIndex + 1} of ${totalPages})`;
    },
    hideReading() {
      readingEl.hidden = true;
    },
    showReading() {
      readingEl.hidden = false;
    },
  };
}
