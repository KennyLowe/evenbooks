/**
 * Error / notice convention (Constitution Principle V — Crash Without Lying).
 *
 * Every catch site in this app must EITHER:
 *   - recover() — fall back to a defined behavior with a user-visible signal,
 *     emitting a Notice via this channel; or
 *   - surface() — rethrow / propagate so a higher boundary handles it.
 *
 * Logging-and-swallowing (try / catch with an empty handler) is forbidden.
 *
 * The phone-side UI subscribes to this channel and renders notices in its
 * transient notice slot for ~5 s (see contracts/phone-ui.md).
 */

export type Notice =
  | {
      readonly kind: "recovery";
      readonly reason: "unparseable" | "wrong-book" | "out-of-range";
    }
  | {
      readonly kind: "save-failed";
    };

export type NoticeListener = (notice: Notice) => void;

export interface NoticeChannel {
  readonly emit: (notice: Notice) => void;
  readonly subscribe: (listener: NoticeListener) => () => void;
}

export function createNoticeChannel(): NoticeChannel {
  const listeners = new Set<NoticeListener>();
  return {
    emit(notice) {
      for (const l of listeners) {
        try {
          l(notice);
        } catch (e) {
          // Listener errors must not silently break the emitter, but we have
          // no higher boundary to escalate to from here. Surface to the
          // console so it's visible in the simulator dev console.
          console.error("[evenBooks] notice listener threw:", e);
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
