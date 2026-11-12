jest.mock("expo-crypto", () => ({ randomUUID: () => "11111111-2222-3333-4444-555555555555" }));

import { PluginHost } from "@/core/plugins/host";
import { createTestServices } from "@/core/test-services";
import { ALL_PLUGINS } from "@/plugins";
import { createJournalService, EntryInvalidError, getJournalService } from "./journal-service";

async function setup() {
  const services = createTestServices();
  const host = new PluginHost(ALL_PLUGINS, services);
  await host.start();
  const ctx = host.contextFor("journal");
  let n = 0;
  let t = 1000;
  const service = createJournalService(ctx, (id) => host.entryType(id), {
    now: () => (t += 10),
    randomId: () => `id-${++n}`,
  });
  const photo = async () => (await services.media.importImage("file:///cache/x.jpg")).id;
  return { services, host, ctx, service, photo };
}

describe("JournalService", () => {
  it("create stores fields and photos in order, and commits media", async () => {
    const { services, service, photo } = await setup();
    const a = await photo();
    const b = await photo();
    const e = await service.create({ day: "2026-05-10", typeId: "journal.day", fields: { text: "  hi " }, photoIds: [b, a] });
    expect(e.fields.text).toBe("hi");
    expect(e.photoIds).toEqual([b, a]);
    expect((await service.get(e.id))?.photoIds).toEqual([b, a]);
    expect(await services.db.all("SELECT id FROM media WHERE pending = 1")).toHaveLength(0);
  });

  it("emits journal.entryCreated after the row is readable", async () => {
    const { host, service } = await setup();
    const seen: unknown[] = [];
    host.contextFor("journal").bus.on("journal.entryCreated", async ({ entryId }) => {
      seen.push(await service.get(entryId));
    });
    const e = await service.create({ day: "2026-05-10", typeId: "journal.day", fields: { text: "x" }, photoIds: [] });
    expect(seen).toHaveLength(1);
    expect((seen[0] as { id: string }).id).toBe(e.id);
  });

  it("rejects unknown types, empty and invalid input", async () => {
    const { service } = await setup();
    await expect(service.create({ day: "2026-05-10", typeId: "nope.x", fields: { text: "x" }, photoIds: [] })).rejects.toBeInstanceOf(EntryInvalidError);
    await expect(service.create({ day: "2026-05-10", typeId: "journal.day", fields: { text: "  " }, photoIds: [] })).rejects.toBeInstanceOf(EntryInvalidError);
    await expect(service.create({ day: "2026-05-10", typeId: "journal.game", fields: { hours: 2 }, photoIds: [] })).rejects.toBeInstanceOf(EntryInvalidError);
  });

  it("update merges fields, commits new photos and removes dropped media", async () => {
    const { services, service, photo } = await setup();
    const a = await photo();
    const e = await service.create({ day: "2026-05-10", typeId: "journal.day", fields: { text: "one", legacy: "x" }, photoIds: [a] });
    const b = await photo();
    const u = await service.update(e.id, { fields: { text: "two" }, photoIds: [b] });
    expect(u.fields).toEqual({ text: "two", legacy: "x" });
    expect(u.photoIds).toEqual([b]);
    expect(u.updatedAt).toBeGreaterThan(e.updatedAt);
    expect(u.createdAt).toBe(e.createdAt);
    expect(await services.media.info(a)).toBeNull();
    expect(await services.media.info(b)).not.toBeNull();
    expect(await services.db.all("SELECT id FROM media WHERE pending = 1")).toHaveLength(0);
  });

  it("update rejects missing ids and results that would be empty", async () => {
    const { service } = await setup();
    await expect(service.update("nope", { fields: { text: "x" }, photoIds: [] })).rejects.toBeInstanceOf(EntryInvalidError);
    const e = await service.create({ day: "2026-05-10", typeId: "journal.day", fields: { text: "one" }, photoIds: [] });
    await expect(service.update(e.id, { fields: { text: "" }, photoIds: [] })).rejects.toBeInstanceOf(EntryInvalidError);
  });

  it("remove deletes the entry, photo rows and media only for that entry", async () => {
    const { services, service, photo } = await setup();
    const a = await photo();
    const b = await photo();
    const e1 = await service.create({ day: "2026-05-10", typeId: "journal.day", fields: { text: "1" }, photoIds: [a] });
    const e2 = await service.create({ day: "2026-05-10", typeId: "journal.day", fields: { text: "2" }, photoIds: [b] });
    await service.remove(e1.id);
    expect(await service.get(e1.id)).toBeNull();
    expect(await services.db.all("SELECT * FROM journal_entry_photos WHERE entry_id = ?", [e1.id])).toEqual([]);
    expect(await services.media.info(a)).toBeNull();
    expect((await service.get(e2.id))?.photoIds).toEqual([b]);
    expect(await services.media.info(b)).not.toBeNull();
    await expect(service.remove(e1.id)).rejects.toBeInstanceOf(EntryInvalidError);
  });

  it("listDay returns that day's entries in creation order", async () => {
    const { service } = await setup();
    const a = await service.create({ day: "2026-05-10", typeId: "journal.day", fields: { text: "a" }, photoIds: [] });
    await service.create({ day: "2026-05-11", typeId: "journal.day", fields: { text: "other" }, photoIds: [] });
    const b = await service.create({ day: "2026-05-10", typeId: "journal.day", fields: { text: "b" }, photoIds: [] });
    expect((await service.listDay("2026-05-10")).map((e) => e.id)).toEqual([a.id, b.id]);
  });

  it("subscribe fires once per change and can unsubscribe", async () => {
    const { service } = await setup();
    const fn = jest.fn();
    const off = service.subscribe(fn);
    const e = await service.create({ day: "2026-05-10", typeId: "journal.day", fields: { text: "a" }, photoIds: [] });
    expect(fn).toHaveBeenCalledTimes(1);
    await service.update(e.id, { fields: { text: "b" }, photoIds: [] });
    expect(fn).toHaveBeenCalledTimes(2);
    await service.remove(e.id);
    expect(fn).toHaveBeenCalledTimes(3);
    off();
    await service.create({ day: "2026-05-10", typeId: "journal.day", fields: { text: "c" }, photoIds: [] });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("default ids work and getJournalService memoizes per context", async () => {
    const { ctx, host } = await setup();
    const s1 = getJournalService(ctx, (id) => host.entryType(id));
    expect(getJournalService(ctx, (id) => host.entryType(id))).toBe(s1);
    const e = await s1.create({ day: "2026-05-10", typeId: "journal.day", fields: { text: "a" }, photoIds: [] });
    expect(e.id).toBe("11111111-2222-3333-4444-555555555555"); // default id comes from expo-crypto (native module is mocked)
  });
});
