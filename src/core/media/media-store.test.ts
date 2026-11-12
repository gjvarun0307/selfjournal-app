import { CORE_MIGRATIONS } from "@/core/db/core-migrations";
import { runMigrations } from "@/core/db/migrations";
import { createTestServices } from "@/core/test-services";
import { createTestMedia } from "./test-media";
import { MediaUnavailableError } from "./types";

const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;

async function setup(opts: Parameters<typeof createTestMedia>[2] = {}) {
  const services = createTestServices();
  await runMigrations(services.db, CORE_MIGRATIONS);
  const media = createTestMedia(services.db, services.settings, opts);
  return { ...services, media };
}

function startsWithJpegMagic(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function decodeDataUri(uri: string): Uint8Array {
  return new Uint8Array(Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64"));
}

describe("MediaStore", () => {
  it("stores encrypted bytes, never the JPEG", async () => {
    const { media } = await setup();
    const rec = await media.importImage("file:///cache/ImagePicker/a.jpg");

    const names = await media.files.list();
    expect(names.sort()).toEqual([`${rec.id}.full`, `${rec.id}.thumb`]);
    const prepared = media.prep.prepared.map((p) => Buffer.from(p.bytes).toString("hex"));
    for (const name of names) {
      const stored = await media.files.read(name);
      expect(startsWithJpegMagic(stored)).toBe(false);
      expect(prepared).not.toContain(Buffer.from(stored).toString("hex"));
    }

    const full = await media.load(rec.id, "full");
    expect(full.startsWith("data:image/jpeg;base64,")).toBe(true);
    const fullPrep = media.prep.prepared.find((p) => p.maxEdge > 1000)!;
    expect(decodeDataUri(full)).toEqual(fullPrep.bytes);
    expect(startsWithJpegMagic(decodeDataUri(full))).toBe(true);

    const thumb = await media.load(rec.id, "thumb");
    const thumbPrep = media.prep.prepared.find((p) => p.maxEdge < 1000)!;
    expect(decodeDataUri(thumb)).toEqual(thumbPrep.bytes);

    expect(rec).toEqual({ id: rec.id, mime: "image/jpeg", width: fullPrep.width, height: fullPrep.height });
    expect(await media.info(rec.id)).toEqual(rec);
  });

  it("deletes the picked source file", async () => {
    const { media } = await setup();
    await media.importImage("file:///cache/ImagePicker/b.jpg");
    expect(media.prep.discarded).toEqual(["file:///cache/ImagePicker/b.jpg"]);
  });

  it("deletes the picked source file even when the import fails", async () => {
    const { media } = await setup();
    media.files.failWrite = () => true;
    await expect(media.importImage("file:///cache/ImagePicker/c.jpg")).rejects.toThrow();
    expect(media.prep.discarded).toEqual(["file:///cache/ImagePicker/c.jpg"]);
  });

  it("one key, even with concurrent imports", async () => {
    const { db, media } = await setup();
    const recs = await Promise.all([1, 2, 3].map((n) => media.importImage(`file:///cache/${n}.jpg`)));

    expect(await db.all("SELECT key FROM app_settings WHERE key = 'media.key'")).toHaveLength(1);
    for (const r of recs) {
      await expect(media.load(r.id, "full")).resolves.toMatch(/^data:image\/jpeg;base64,/);
    }
  });

  it("a second store over the same DB reuses the key", async () => {
    const { db, settings, media } = await setup();
    const rec = await media.importImage("file:///cache/a.jpg");
    const again = createTestMedia(db, settings, { files: media.files });
    await expect(again.load(rec.id, "thumb")).resolves.toMatch(/^data:image\/jpeg;base64,/);
  });

  it("a failed file write leaves no row", async () => {
    const { db, media } = await setup();
    media.files.failWrite = (name) => name.endsWith(".thumb");

    await expect(media.importImage("file:///cache/a.jpg")).rejects.toThrow();

    expect(await db.first("SELECT count(*) AS n FROM media")).toEqual({ n: 0 });
    expect((await media.files.list()).filter((n) => n.endsWith(".full"))).toEqual([]);
  });

  it("new media is pending until committed inside the owner's transaction", async () => {
    const { db, media } = await setup();
    const a = await media.importImage("file:///cache/a.jpg");
    const b = await media.importImage("file:///cache/b.jpg");
    expect(await db.all("SELECT id FROM media WHERE pending = 1 ORDER BY id")).toHaveLength(2);

    await db.transaction(async (tx) => {
      await media.commit(tx, [a.id]);
      await media.commit(tx, []);
    });

    expect(await db.all("SELECT id FROM media WHERE pending = 1")).toEqual([{ id: b.id }]);
  });

  it("commit rolls back with the owner's transaction", async () => {
    const { db, media } = await setup();
    const a = await media.importImage("file:///cache/a.jpg");
    await expect(
      db.transaction(async (tx) => {
        await media.commit(tx, [a.id]);
        throw new Error("owner failed");
      }),
    ).rejects.toThrow("owner failed");
    expect(await db.first("SELECT pending FROM media WHERE id = ?", [a.id])).toEqual({ pending: 1 });
  });

  it("sweep removes stale pending media and orphan files, keeps committed", async () => {
    let t = NOW - 25 * HOUR;
    const { db, media } = await setup({ now: () => t });
    const committed = await media.importImage("file:///cache/committed.jpg");
    await db.transaction((tx) => media.commit(tx, [committed.id]));
    const stale = await media.importImage("file:///cache/stale.jpg");
    t = NOW - 1 * HOUR;
    const recent = await media.importImage("file:///cache/recent.jpg");
    await media.files.write("x.full", new Uint8Array([1, 2, 3]));
    t = NOW;

    await media.sweep();

    const ids = (await db.all<{ id: string }>("SELECT id FROM media")).map((r) => r.id).sort();
    expect(ids).toEqual([committed.id, recent.id].sort());
    expect((await media.files.list()).sort()).toEqual(
      [`${committed.id}.full`, `${committed.id}.thumb`, `${recent.id}.full`, `${recent.id}.thumb`].sort(),
    );
    await expect(media.load(stale.id, "thumb")).rejects.toBeInstanceOf(MediaUnavailableError);
  });

  it("sweep clears the image temp dirs first", async () => {
    const { media } = await setup();
    await media.sweep();
    expect(media.prep.tempSweeps).toBe(1);
  });

  it("sweep leaves the image temp dirs alone while an import is in flight", async () => {
    const { media } = await setup();
    let release!: () => void;
    media.prep.gate = new Promise((r) => (release = r));
    const pending = media.importImage("file:///cache/ImagePicker/a.jpg");
    await media.sweep();
    expect(media.prep.tempSweeps).toBe(0);
    release();
    await pending;
    await media.sweep();
    expect(media.prep.tempSweeps).toBe(1);
  });

  it("a failed temp sweep warns and the rest of the sweep still runs", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const { media } = await setup();
    media.prep.failSweepTemp = true;
    await media.files.write("orphan.full", new Uint8Array([1]));
    await media.sweep();
    expect(await media.files.list()).toEqual([]);
    expect(warn).toHaveBeenCalledWith("[Media] could not clear image temp files", expect.any(Error));
    warn.mockRestore();
  });

  it("load of a missing file rejects with MediaUnavailableError", async () => {
    const { media } = await setup();
    const rec = await media.importImage("file:///cache/a.jpg");
    await media.files.remove(`${rec.id}.full`);

    await expect(media.load(rec.id, "full")).rejects.toBeInstanceOf(MediaUnavailableError);
    await expect(media.load("no-such-id", "thumb")).rejects.toBeInstanceOf(MediaUnavailableError);
  });

  it("load of tampered bytes rejects with MediaUnavailableError", async () => {
    const { media } = await setup();
    const rec = await media.importImage("file:///cache/a.jpg");
    const bytes = await media.files.read(`${rec.id}.thumb`);
    bytes[bytes.length - 1] ^= 0xff;
    await media.files.write(`${rec.id}.thumb`, bytes);

    await expect(media.load(rec.id, "thumb")).rejects.toBeInstanceOf(MediaUnavailableError);
  });

  it("remove deletes rows and files, clears the cache, and ignores unknown ids", async () => {
    const { db, media } = await setup();
    const rec = await media.importImage("file:///cache/a.jpg");
    await media.load(rec.id, "thumb"); // cached

    await media.remove([rec.id, "unknown"]);
    await media.remove([]);

    expect(await db.first("SELECT count(*) AS n FROM media")).toEqual({ n: 0 });
    expect(await media.files.list()).toEqual([]);
    expect(await media.info(rec.id)).toBeNull();
    await expect(media.load(rec.id, "thumb")).rejects.toBeInstanceOf(MediaUnavailableError);
  });
});
