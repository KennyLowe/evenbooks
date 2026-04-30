import { describe, expect, it, vi } from "vitest";
import {
  positionKeyFor,
  readPosition,
  writePosition,
} from "../../src/platform/persistence";
import { createNoticeChannel } from "../../src/platform/errors";

interface Store {
  [key: string]: string;
}

function fakeBridge(initial: Store = {}) {
  const store: Store = { ...initial };
  return {
    setLocalStorage: vi.fn(async (key: string, value: string) => {
      store[key] = value;
      return true;
    }),
    getLocalStorage: vi.fn(async (key: string) => store[key] ?? ""),
    _store: store,
  };
}

describe("per-book persistence isolation", () => {
  it("read/write for one book does not interfere with another", async () => {
    const bridge = fakeBridge();
    const channel = createNoticeChannel();

    await writePosition(bridge as never, channel, {
      book: "alpha",
      page: 5,
      savedAt: 1,
    });
    await writePosition(bridge as never, channel, {
      book: "beta",
      page: 12,
      savedAt: 2,
    });

    const a = await readPosition(bridge as never, "alpha", 100);
    const b = await readPosition(bridge as never, "beta", 100);

    expect(a).toEqual({ kind: "resumed", page: 5 });
    expect(b).toEqual({ kind: "resumed", page: 12 });

    // Confirm the keys are namespaced.
    expect(bridge._store[positionKeyFor("alpha")]).toBeDefined();
    expect(bridge._store[positionKeyFor("beta")]).toBeDefined();
    expect(bridge._store[positionKeyFor("alpha")]).not.toBe(
      bridge._store[positionKeyFor("beta")],
    );
  });

  it("reading a book that has no saved position returns fresh-start", async () => {
    const bridge = fakeBridge();
    const result = await readPosition(bridge as never, "never-saved", 50);
    expect(result).toEqual({ kind: "fresh-start" });
  });

  it("v1 recovery state machine is preserved per book (wrong-book)", async () => {
    const bridge = fakeBridge({
      [positionKeyFor("imported")]: JSON.stringify({
        book: "different",
        page: 5,
        savedAt: 1,
      }),
    });
    const result = await readPosition(bridge as never, "imported", 100);
    expect(result).toEqual({
      kind: "recovered",
      page: 0,
      reason: "wrong-book",
    });
  });

  it("v1 recovery state machine is preserved per book (out-of-range)", async () => {
    const bridge = fakeBridge({
      [positionKeyFor("imported")]: JSON.stringify({
        book: "imported",
        page: 200,
        savedAt: 1,
      }),
    });
    const result = await readPosition(bridge as never, "imported", 100);
    expect(result).toEqual({
      kind: "recovered",
      page: 0,
      reason: "out-of-range",
    });
  });
});
