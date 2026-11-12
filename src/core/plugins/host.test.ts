import { createTestDb } from "@/core/db/test-db";
import { EventBus } from "@/core/events/bus";
import { createAppSettings } from "@/core/settings/app-settings";
import type { Db } from "@/core/db/types";
import { PluginHost } from "./host";
import type { PluginDefinition } from "./types";

declare module "@/core/events/types" {
  interface AppEvents {
    "test.ping": { n: number };
  }
}

function setup(db: Db = createTestDb()) {
  const bus = new EventBus({ onError: jest.fn() });
  return { db, bus, ctx: { db, bus, settings: createAppSettings(db) } };
}

const plain = (id: string): PluginDefinition => ({ id, name: id, description: id, icon: id });

describe("PluginHost", () => {
  it("first start enables all plugins and persists state", async () => {
    const { db, ctx } = setup();
    const host = new PluginHost([plain("a"), plain("b")], ctx);
    await host.start();
    expect(host.enabledIds()).toEqual(["a", "b"]);
    const rows = await db.all<{ id: string; enabled: number }>("SELECT id, enabled FROM plugin_state ORDER BY id");
    expect(rows).toEqual([{ id: "a", enabled: 1 }, { id: "b", enabled: 1 }]);
  });

  it("runs migrations of disabled plugins too", async () => {
    const { db, ctx } = setup();
    await new PluginHost([plain("a")], ctx).start();
    await db.run("UPDATE plugin_state SET enabled = 0 WHERE id = 'a'");
    const def = { ...plain("a"), migrations: [{ id: "a:001", up: "CREATE TABLE a_data (x INTEGER)" }] };
    const host = new PluginHost([def], ctx);
    await host.start();
    expect(host.isEnabled("a")).toBe(false);
    expect(await db.all("SELECT * FROM a_data")).toEqual([]);
  });

  it("disable calls cleanup; enable re-activates; data table untouched", async () => {
    const { db, ctx } = setup();
    const cleanup = jest.fn();
    const activate = jest.fn(() => cleanup);
    const def: PluginDefinition = {
      ...plain("a"), activate,
      migrations: [{ id: "a:001", up: "CREATE TABLE a_data (x INTEGER)" }],
    };
    const host = new PluginHost([def], ctx);
    await host.start();
    await db.run("INSERT INTO a_data (x) VALUES (1)");
    expect(activate).toHaveBeenCalledTimes(1);
    await host.setEnabled("a", false);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(host.isEnabled("a")).toBe(false);
    await host.setEnabled("a", true);
    expect(activate).toHaveBeenCalledTimes(2);
    expect(await db.all("SELECT x FROM a_data")).toEqual([{ x: 1 }]);
  });

  it("toggling off→on→off→on leaves exactly one subscription", async () => {
    const { ctx, bus } = setup();
    const handler = jest.fn();
    const def: PluginDefinition = {
      ...plain("a"),
      activate: (c) => c.bus.on("test.ping", handler),
    };
    const host = new PluginHost([def], ctx);
    await host.start();
    // fire concurrently to also exercise serialization
    await Promise.all([
      host.setEnabled("a", false),
      host.setEnabled("a", true),
      host.setEnabled("a", false),
      host.setEnabled("a", true),
    ]);
    await bus.emit("test.ping", { n: 1 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(host.isEnabled("a")).toBe(true);
  });

  it("ignores stored ids of plugins that no longer exist", async () => {
    const { db, ctx } = setup();
    await new PluginHost([plain("a")], ctx).start();
    await db.run("INSERT INTO plugin_state (id, enabled) VALUES ('ghost', 1)");
    const host = new PluginHost([plain("a")], ctx);
    await expect(host.start()).resolves.toBeUndefined();
    expect(host.enabledIds()).toEqual(["a"]);
  });

  it("state persists across hosts", async () => {
    const { db, ctx } = setup();
    const h1 = new PluginHost([plain("a"), plain("b")], ctx);
    await h1.start();
    await h1.setEnabled("b", false);
    const h2 = new PluginHost([plain("a"), plain("b")], ctx);
    await h2.start();
    expect(h2.isEnabled("b")).toBe(false);
    expect(h2.isEnabled("a")).toBe(true);
    expect(db).toBeDefined();
  });

  it("throws on duplicate plugin ids", () => {
    const { ctx } = setup();
    expect(() => new PluginHost([plain("a"), plain("a")], ctx)).toThrow(/duplicate/i);
  });

  it("notifies subscribers on change", async () => {
    const { ctx } = setup();
    const host = new PluginHost([plain("a")], ctx);
    await host.start();
    const l = jest.fn();
    const off = host.subscribe(l);
    await host.setEnabled("a", true); // unchanged: no-op
    expect(l).not.toHaveBeenCalled();
    await host.setEnabled("a", false);
    expect(l).toHaveBeenCalledTimes(1);
    off();
    await host.setEnabled("a", true);
    expect(l).toHaveBeenCalledTimes(1);
  });

  it("throws on unknown id in setEnabled", async () => {
    const { ctx } = setup();
    const host = new PluginHost([plain("a")], ctx);
    await host.start();
    await expect(host.setEnabled("nope", true)).rejects.toThrow(/unknown/i);
  });

  it("a throwing activate does not crash start and is reported", async () => {
    const { ctx } = setup();
    const onError = jest.fn();
    const bad: PluginDefinition = { ...plain("bad"), activate: () => { throw new Error("boom"); } };
    const host = new PluginHost([bad, plain("ok")], ctx, { onError });
    await expect(host.start()).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(host.isEnabled("bad")).toBe(true);
  });
});
