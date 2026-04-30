import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  loadSettings,
  saveSettings,
} from "../../src/library/library-settings";
import {
  createNoticeChannel,
  type Notice,
} from "../../src/platform/errors";

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

function captured(channel: ReturnType<typeof createNoticeChannel>) {
  const got: Notice[] = [];
  channel.subscribe((n) => got.push(n));
  return got;
}

describe("loadSettings", () => {
  it("returns DEFAULT_SETTINGS when the key is absent", async () => {
    const bridge = fakeBridge();
    const channel = createNoticeChannel();
    const result = await loadSettings(bridge as never, channel);
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it("returns parsed settings when valid JSON is present", async () => {
    const bridge = fakeBridge({
      [SETTINGS_KEY]: JSON.stringify({ version: 3, sort: "title-asc" }),
    });
    const result = await loadSettings(bridge as never, createNoticeChannel());
    expect(result).toEqual({ version: 3, sort: "title-asc" });
  });

  it("recovers to default + emits notice on garbage payload", async () => {
    const bridge = fakeBridge({ [SETTINGS_KEY]: "not json" });
    const channel = createNoticeChannel();
    const notices = captured(channel);
    const result = await loadSettings(bridge as never, channel);
    expect(result).toEqual(DEFAULT_SETTINGS);
    expect(notices).toContainEqual({
      kind: "recovery",
      reason: "unparseable",
    });
  });

  it("recovers to default when the sort value is invalid", async () => {
    const bridge = fakeBridge({
      [SETTINGS_KEY]: JSON.stringify({ version: 3, sort: "invented-sort" }),
    });
    const channel = createNoticeChannel();
    const notices = captured(channel);
    const result = await loadSettings(bridge as never, channel);
    expect(result).toEqual(DEFAULT_SETTINGS);
    expect(notices).toHaveLength(1);
  });

  it("recovers when the version field is wrong", async () => {
    const bridge = fakeBridge({
      [SETTINGS_KEY]: JSON.stringify({ version: 99, sort: "title-asc" }),
    });
    const channel = createNoticeChannel();
    const result = await loadSettings(bridge as never, channel);
    expect(result).toEqual(DEFAULT_SETTINGS);
  });
});

describe("saveSettings", () => {
  let channel: ReturnType<typeof createNoticeChannel>;

  beforeEach(() => {
    channel = createNoticeChannel();
  });

  it("writes the settings JSON under SETTINGS_KEY", async () => {
    const bridge = fakeBridge();
    await saveSettings(bridge as never, channel, {
      version: 3,
      sort: "author-asc",
    });
    expect(bridge._store[SETTINGS_KEY]).toBe(
      JSON.stringify({ version: 3, sort: "author-asc" }),
    );
  });

  it("emits save-failed when the bridge rejects", async () => {
    const bridge = {
      setLocalStorage: vi.fn().mockResolvedValue(false),
      getLocalStorage: vi.fn(),
    };
    const notices = captured(channel);
    await saveSettings(bridge as never, channel, DEFAULT_SETTINGS);
    expect(notices).toEqual([{ kind: "save-failed" }]);
  });
});
