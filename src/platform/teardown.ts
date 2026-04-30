/**
 * Teardown registry (Constitution Principle IV — leaks accumulate across navigation).
 *
 * Every SDK subscription that returns an unsubscribe function should be
 * registered here at the time of subscription. On exit (swipe-down,
 * end-of-book exit, or any other shutdown path), call runAll() to release
 * all subscriptions before calling bridge.shutDownPageContainer.
 */

export type Unsubscribe = () => void;

export class Teardowns {
  private readonly unsubs: Unsubscribe[] = [];

  add(unsub: Unsubscribe): void {
    this.unsubs.push(unsub);
  }

  runAll(): void {
    // Drain in reverse insertion order; newest subscriptions tear down first.
    while (this.unsubs.length > 0) {
      const fn = this.unsubs.pop();
      if (!fn) continue;
      try {
        fn();
      } catch (e) {
        // A failing teardown must not block the rest. Surface to console.
        console.error("[evenBooks] teardown failed:", e);
      }
    }
  }
}
