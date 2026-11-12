import { createTestServices } from "@/core/test-services";
import { PluginHost } from "./host";
import type { PluginDefinition } from "./types";

declare module "@/core/events/types" {
  interface AppEvents {
    "test.ping": { n: number };
  }
}

function setup() {
  const services = createTestServices();
  return { db: services.db, bus: services.bus, ctx: services };
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

  it("contextFor gives each plugin scoped settings", async () => {
    const { ctx } = setup();
    const host = new PluginHost([plain("a"), plain("b")], ctx);
    await host.start();
    await host.contextFor("a").settings.set("k", "1");
    expect(await ctx.settings.get("plugin.a.k")).toBe("1");
    expect(await host.contextFor("b").settings.get("k")).toBeNull();
    expect(host.contextFor("a")).toBe(host.contextFor("a"));
    expect(host.contextFor("a").pluginId).toBe("a");
    expect(() => host.contextFor("zzz")).toThrow();
  });

  it("host drops a plugin's subscriptions on disable without a cleanup", async () => {
    const { ctx, bus } = setup();
    const h = jest.fn();
    const def: PluginDefinition = {
      ...plain("a"),
      activate(c) {
        c.bus.on("test.ping", h);
      },
    };
    const host = new PluginHost([def], ctx);
    await host.start();
    await host.setEnabled("a", false);
    await bus.emit("test.ping", { n: 1 });
    expect(h).not.toHaveBeenCalled();
    await host.setEnabled("a", true);
    await bus.emit("test.ping", { n: 2 });
    expect(h).toHaveBeenCalledTimes(1);
  });

  it("a disabled plugin's context neither subscribes nor emits", async () => {
    const { ctx, bus } = setup();
    const host = new PluginHost([plain("a")], ctx);
    await host.start();
    await host.setEnabled("a", false);
    const own = jest.fn();
    const other = jest.fn();
    const off = host.contextFor("a").bus.on("test.ping", own);
    expect(typeof off).toBe("function");
    bus.on("test.ping", other);
    await expect(host.contextFor("a").bus.emit("test.ping", { n: 1 })).resolves.toBeUndefined();
    await bus.emit("test.ping", { n: 2 });
    expect(own).not.toHaveBeenCalled();
    expect(other).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledWith({ n: 2 });
  });

  it("a throwing change listener does not reject setEnabled", async () => {
    const { ctx } = setup();
    const onError = jest.fn();
    const host = new PluginHost([plain("a")], ctx, { onError });
    await host.start();
    host.subscribe(() => {
      throw new Error("x");
    });
    await expect(host.setEnabled("a", false)).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("start() is serialized with setEnabled", async () => {
    const { ctx } = setup();
    const cleanup = jest.fn();
    const activate = jest.fn(() => cleanup);
    const host = new PluginHost([{ ...plain("a"), activate }], ctx);
    const p = host.start();
    const q = host.setEnabled("a", false);
    await Promise.all([p, q]);
    expect(host.isEnabled("a")).toBe(false);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
