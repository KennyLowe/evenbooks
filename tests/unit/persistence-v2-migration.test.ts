import { describe, expect, it, vi } from "vitest";
import { migrateV1IfNeeded } from "../../src/platform/persistence-v2-migration";
import {
  bootstrapWithSample,
  emptyLibrary,
  findEntry,
} from "../../src/library/library";
import { positionKeyFor } from "../../src/platform/persistence";
import {
  createNoticeChannel,
  type Notice,
} from "../../src/platform/errors";

const V1_KEY = "evenBooks.position.v1";

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

describe("migrateV1IfNeeded", () => {
  it("returns no-migration-needed when v1 key is absent", async () => {
    const bridge = fakeBridge();
    const channel = createNoticeChannel();
    const notices = captured(channel);

    const out = await migrateV1IfNeeded(
      bridge as never,
      channel,
      emptyLibrary(),
      45,
    );

    expect(out.result.kind).toBe("no-migration-needed");
    expect(notices).toHaveLength(0);
  });

  it("migrates a valid v1 payload onto the sample entry", async () => {
    const bridge = fakeBridge({
      [V1_KEY]: JSON.stringify({ book: "sample", page: 12, savedAt: 1 }),
    });
    const channel = createNoticeChannel();
    const notices = captured(channel);

    const out = await migrateV1IfNeeded(
      bridge as never,
      channel,
      emptyLibrary(),
      45,
    );

    expect(out.result.kind).toBe("migrated");
    if (out.result.kind === "migrated") {
      expect(out.result.page).toBe(12);
    }
    // v1 key is deleted (set to empty string in our fake store)
    expect(bridge._store[V1_KEY]).toBe("");
    // Sample entry exists in the migrated library
    const sample = findEntry(out.library, "sample");
    expect(sample).toBeDefined();
    expect(sample?.lastOpenedAt).not.toBeNull();
    // Sample position written under v2 key
    const written = bridge._store[positionKeyFor("sample")];
    expect(written).toBeDefined();
    expect(JSON.parse(written)).toEqual({
      book: "sample",
      page: 12,
      savedAt: expect.any(Number),
    });
    // Migration is silent on success
    expect(notices).toHaveLength(0);
  });

  it("clamps an out-of-range v1 page to the valid range", async () => {
    const bridge = fakeBridge({
      [V1_KEY]: JSON.stringify({ book: "sample", page: 1_000, savedAt: 1 }),
    });
    const channel = createNoticeChannel();

    const out = await migrateV1IfNeeded(
      bridge as never,
      channel,
      emptyLibrary(),
      45,
    );

    expect(out.result.kind).toBe("migrated");
    if (out.result.kind === "migrated") {
      expect(out.result.page).toBe(44);
    }
  });

  it("emits a recovery notice and preserves the v1 key when payload is unparseable", async () => {
    const bridge = fakeBridge({ [V1_KEY]: "not json {{{" });
    const channel = createNoticeChannel();
    const notices = captured(channel);

    const out = await migrateV1IfNeeded(
      bridge as never,
      channel,
      emptyLibrary(),
      45,
    );

    expect(out.result.kind).toBe("migration-failed");
    expect(notices).toContainEqual({
      kind: "recovery",
      reason: "unparseable",
    });
    // v1 key is preserved for forensics (NOT cleared to empty)
    expect(bridge._store[V1_KEY]).toBe("not json {{{");
  });

  it("is idempotent — running twice with v1 key present once produces consistent state", async () => {
    const bridge = fakeBridge({
      [V1_KEY]: JSON.stringify({ book: "sample", page: 7, savedAt: 1 }),
    });
    const channel = createNoticeChannel();

    const first = await migrateV1IfNeeded(
      bridge as never,
      channel,
      emptyLibrary(),
      45,
    );
    expect(first.result.kind).toBe("migrated");

    // Second invocation: v1 key now empty, so nothing to do.
    const second = await migrateV1IfNeeded(
      bridge as never,
      channel,
      first.library,
      45,
    );
    expect(second.result.kind).toBe("no-migration-needed");
  });

  it("treats already-opened sample entry + lingering v1 key as no-migration-needed (cleans up v1 key)", async () => {
    const bridge = fakeBridge({
      [V1_KEY]: JSON.stringify({ book: "sample", page: 7, savedAt: 1 }),
    });
    const channel = createNoticeChannel();
    const seedLib = bootstrapWithSample(45, 1_000_000);
    const opened = {
      ...seedLib,
      entries: [{ ...seedLib.entries[0], lastOpenedAt: 1_500_000 }],
    };

    const out = await migrateV1IfNeeded(bridge as never, channel, opened, 45);
    expect(out.result.kind).toBe("no-migration-needed");
    // v1 key cleaned up despite the no-migration-needed result
    expect(bridge._store[V1_KEY]).toBe("");
  });
});
