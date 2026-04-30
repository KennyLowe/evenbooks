/**
 * Glasses frame composition.
 *
 * Per contracts/frames.md: every frame is a TextContainerUpgrade against the
 * single text container created at startup. All composers are pure functions
 * of their inputs — same input → same output → idempotent rebuild on
 * reconnect (Constitution Principle III).
 */

import {
  TextContainerProperty,
  TextContainerUpgrade,
} from "@evenrealities/even_hub_sdk";
import type { Book } from "../content/sample-text";
import type { Page } from "./pagination";

const CONTAINER_ID = 1;
const CONTAINER_NAME = "main";

/** The single text container created once at startup. */
export const STARTUP_CONTAINER = new TextContainerProperty({
  containerID: CONTAINER_ID,
  containerName: CONTAINER_NAME,
  xPosition: 0,
  yPosition: 0,
  width: 576,
  height: 288,
  paddingLength: 4,
  borderWidth: 0,
  borderColor: 0,
  borderRadius: 0,
  isEventCapture: 1,
  content: "",
});

/** Normal reading frame — body text only. (FR-001, Q4 clarification.) */
export function pageFrame(page: Page): TextContainerUpgrade {
  return new TextContainerUpgrade({
    containerID: CONTAINER_ID,
    containerName: CONTAINER_NAME,
    contentOffset: 0,
    contentLength: 0,
    content: page.text,
  });
}

/** Transient first-page-clamp indicator. Reverts to pageFrame after ~1 s. */
export function clampFlashFrame(page: Page): TextContainerUpgrade {
  const indicator = "↑ start of book";
  // Prepend the indicator with a blank line, then the page text.
  const content = `${indicator}\n\n${page.text}`;
  return new TextContainerUpgrade({
    containerID: CONTAINER_ID,
    containerName: CONTAINER_NAME,
    contentOffset: 0,
    contentLength: 0,
    content,
  });
}

/** Dedicated end-of-book frame. Replaces the page; press to exit. */
export function endOfBookFrame(book: Book): TextContainerUpgrade {
  const content = `End of "${book.title}".\n\nPress to exit.`;
  return new TextContainerUpgrade({
    containerID: CONTAINER_ID,
    containerName: CONTAINER_NAME,
    contentOffset: 0,
    contentLength: 0,
    content,
  });
}
