import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  STORAGE_KEY,
  readPosition,
  writePosition,
} from "../../src/platform/persistence";
import { createNoticeChannel } from "../../src/platform/errors";

interface FakeBridge {
  setLocalStorage: ReturnType<typeof vi.fn>;
  getLocalStorage: ReturnType<typeof vi.fn>;
}

function fakeBridge(stored: string | null = null): FakeBridge {
  return {
    setLocalStorage: vi.fn().mockResolvedValue(true),
    getLocalStorage: vi.fn().mockResolvedValue(stored ?? ""),
  };
}

describe("readPosition", () => {
  it("returns fresh-start when storage is empty", async () => {
    const bridge = fakeBridge("");
    const result = await readPosition(bridge as never, "sample", 45);
    expect(result).toEqual({ kind: "fresh-start" });
    expect(bridge.getLocalStorage).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it("returns recovered/unparseable for garbage", async () => {
    const bridge = fakeBridge("not json {{{");
    const result = await readPosition(bridge as never, "sample", 45);
    expect(result).toEqual({ kind: "recovered", page: 0, reason: "unparseable" });
  });

  it("returns recovered/wrong-book for a different book id", async () => {
    const bridge = fakeBridge(
      JSON.stringify({ book: "other", page: 5, savedAt: Date.now() }),
    );
    const result = await readPosition(bridge as never, "sample", 45);
    expect(result).toEqual({ kind: "recovered", page: 0, reason: "wrong-book" });
  });

  it("returns recovered/out-of-range for negative page", async () => {
    const bridge = fakeBridge(
      JSON.stringify({ book: "sample", page: -1, savedAt: Date.now() }),
    );
    const result = await readPosition(bridge as never, "sample", 45);
    expect(result).toEqual({ kind: "recovered", page: 0, reason: "out-of-range" });
  });

  it("returns recovered/out-of-range for page === totalPages", async () => {
    const bridge = fakeBridge(
      JSON.stringify({ book: "sample", page: 45, savedAt: Date.now() }),
    );
    const result = await readPosition(bridge as never, "sample", 45);
    expect(result).toEqual({ kind: "recovered", page: 0, reason: "out-of-range" });
  });

  it("returns resumed for a valid in-range page", async () => {
    const bridge = fakeBridge(
      JSON.stringify({ book: "sample", page: 12, savedAt: Date.now() }),
    );
    const result = await readPosition(bridge as never, "sample", 45);
    expect(result).toEqual({ kind: "resumed", page: 12 });
  });
});

describe("writePosition", () => {
  let channel: ReturnType<typeof createNoticeChannel>;
  let received: unknown[];

  beforeEach(() => {
    channel = createNoticeChannel();
    received = [];
    channel.subscribe((n) => received.push(n));
  });

  it("succeeds silently when the bridge accepts the write", async () => {
    const bridge = fakeBridge();
    await writePosition(bridge as never, channel, {
      book: "sample",
      page: 12,
      savedAt: 1730000000000,
    });
    expect(bridge.setLocalStorage).toHaveBeenCalledWith(STORAGE_KEY, expect.any(String));
    expect(received).toHaveLength(0);
  });

  it("emits save-failed and does not throw when the bridge rejects", async () => {
    const bridge: FakeBridge = {
      setLocalStorage: vi.fn().mockRejectedValue(new Error("boom")),
      getLocalStorage: vi.fn(),
    };
    await writePosition(bridge as never, channel, {
      book: "sample",
      page: 12,
      savedAt: 1730000000000,
    });
    expect(received).toEqual([{ kind: "save-failed" }]);
  });

  it("emits save-failed when the bridge returns false", async () => {
    const bridge: FakeBridge = {
      setLocalStorage: vi.fn().mockResolvedValue(false),
      getLocalStorage: vi.fn(),
    };
    await writePosition(bridge as never, channel, {
      book: "sample",
      page: 12,
      savedAt: 1730000000000,
    });
    expect(received).toEqual([{ kind: "save-failed" }]);
  });
});
