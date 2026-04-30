/**
 * Reader state machine.
 *
 * Reducer-style: pure function that takes (state, event) and returns the
 * next state plus side-effect descriptors (render upgrade, persist payload,
 * exit signal). Per data-model.md transition table.
 *
 * The reducer never performs I/O. The caller (main.ts bootstrap) interprets
 * the returned `render` / `persist` / `exit` fields and drives the bridge.
 */

import { TextContainerUpgrade } from "@evenrealities/even_hub_sdk";
import type { Book } from "../content/sample-text";
import { clampFlashFrame, endOfBookFrame, pageFrame } from "./frames";
import type { Page } from "./pagination";
import type { ConnectionState } from "../platform/connection";
import type { StoredPosition } from "../platform/persistence";
import type { SemanticEvent } from "../platform/events";

export type ReaderMode =
  | { kind: "reading"; pageIndex: number }
  | { kind: "clamp-flash"; pageIndex: number; flashUntil: number }
  | { kind: "end-of-book" }
  | { kind: "exiting" };

export interface ReaderState {
  readonly book: Book;
  readonly pages: readonly Page[];
  readonly mode: ReaderMode;
  readonly connection: ConnectionState;
}

export type InternalEvent = { kind: "TIMER_EXPIRED" } | { kind: "RECONNECT" };

export type Event = SemanticEvent | InternalEvent;

export interface ReduceResult {
  readonly next: ReaderState;
  readonly render: TextContainerUpgrade | null;
  readonly persist: StoredPosition | null;
  readonly exit: boolean;
}

const CLAMP_FLASH_MS = 1000;

export function reduce(state: ReaderState, event: Event): ReduceResult {
  const lastIndex = state.pages.length - 1;

  // Normalize the event into a kind we can switch on.
  const eventKind = typeof event === "string" ? event : event.kind;

  switch (state.mode.kind) {
    case "reading": {
      const N = state.mode.pageIndex;

      if (eventKind === "NEXT_PAGE") {
        if (N >= lastIndex) {
          return {
            next: { ...state, mode: { kind: "end-of-book" } },
            render: endOfBookFrame(state.book),
            persist: null,
            exit: false,
          };
        }
        const nextIndex = N + 1;
        return {
          next: { ...state, mode: { kind: "reading", pageIndex: nextIndex } },
          render: pageFrame(state.pages[nextIndex]),
          persist: {
            book: state.book.id,
            page: nextIndex,
            savedAt: Date.now(),
          },
          exit: false,
        };
      }

      if (eventKind === "PREV_PAGE") {
        if (N <= 0) {
          return {
            next: {
              ...state,
              mode: {
                kind: "clamp-flash",
                pageIndex: 0,
                flashUntil: Date.now() + CLAMP_FLASH_MS,
              },
            },
            render: clampFlashFrame(state.pages[0]),
            persist: null,
            exit: false,
          };
        }
        const prevIndex = N - 1;
        return {
          next: { ...state, mode: { kind: "reading", pageIndex: prevIndex } },
          render: pageFrame(state.pages[prevIndex]),
          persist: {
            book: state.book.id,
            page: prevIndex,
            savedAt: Date.now(),
          },
          exit: false,
        };
      }

      if (eventKind === "EXIT") {
        return {
          next: { ...state, mode: { kind: "exiting" } },
          render: null,
          persist: { book: state.book.id, page: N, savedAt: Date.now() },
          exit: true,
        };
      }

      if (eventKind === "RECONNECT") {
        return {
          next: state,
          render: pageFrame(state.pages[N]),
          persist: null,
          exit: false,
        };
      }

      return noop(state);
    }

    case "clamp-flash": {
      const N = state.mode.pageIndex;

      if (eventKind === "TIMER_EXPIRED") {
        return {
          next: { ...state, mode: { kind: "reading", pageIndex: N } },
          render: pageFrame(state.pages[N]),
          persist: null,
          exit: false,
        };
      }

      if (eventKind === "RECONNECT") {
        return {
          next: state,
          render: clampFlashFrame(state.pages[N]),
          persist: null,
          exit: false,
        };
      }

      // NEXT_PAGE / PREV_PAGE / EXIT during a clamp-flash are queued by the
      // caller (it should hold them until TIMER_EXPIRED). The reducer treats
      // them as no-ops to keep the contract simple: dispatcher must not feed
      // user events while in clamp-flash.
      return noop(state);
    }

    case "end-of-book": {
      if (eventKind === "NEXT_PAGE" || eventKind === "EXIT") {
        return {
          next: { ...state, mode: { kind: "exiting" } },
          render: null,
          persist: null,
          exit: true,
        };
      }

      if (eventKind === "PREV_PAGE") {
        return {
          next: { ...state, mode: { kind: "reading", pageIndex: lastIndex } },
          render: pageFrame(state.pages[lastIndex]),
          persist: {
            book: state.book.id,
            page: lastIndex,
            savedAt: Date.now(),
          },
          exit: false,
        };
      }

      if (eventKind === "RECONNECT") {
        return {
          next: state,
          render: endOfBookFrame(state.book),
          persist: null,
          exit: false,
        };
      }

      return noop(state);
    }

    case "exiting":
      return noop(state);
  }
}

function noop(state: ReaderState): ReduceResult {
  return { next: state, render: null, persist: null, exit: false };
}
