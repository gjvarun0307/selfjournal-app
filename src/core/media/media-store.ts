import type { Db } from "@/core/db/types";
import type { AppSettings } from "@/core/settings/app-settings";
import {
  MediaUnavailableError,
  type ImagePrep,
  type MediaCipher,
  type MediaFiles,
  type MediaRecord,
  type MediaSize,
  type MediaStore,
} from "./types";

/** Core (unscoped) app setting holding the hex AES-256 media key. Plugin-scoped settings cannot reach it. */
export const MEDIA_KEY_SETTING = "media.key";

export const FULL_MAX_EDGE = 2048;
export const FULL_COMPRESS = 0.85;
export const THUMB_MAX_EDGE = 320;
export const THUMB_COMPRESS = 0.7;

const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_LIMIT: Record<MediaSize, number> = { thumb: 60, full: 4 };

export interface MediaStoreDeps {
  db: Db;
  settings: AppSettings;
  files: MediaFiles;
  cipherFor(keyHex: string): Promise<MediaCipher>;
  prep: ImagePrep;
  randomId(): string;
  randomHex(): string;
  now?(): number;
}

const fileName = (id: string, size: MediaSize) => `${id}.${size}`;
const SIZES: MediaSize[] = ["full", "thumb"];

/** Small insertion-ordered LRU of decrypted data URIs. Memory only. */
class Lru {
  private map = new Map<string, string>();
  constructor(private limit: number) {}
  get(id: string): string | undefined {
    const v = this.map.get(id);
    if (v !== undefined) {
      this.map.delete(id);
      this.map.set(id, v);
    }
    return v;
  }
  set(id: string, v: string): void {
    this.map.delete(id);
    this.map.set(id, v);
    while (this.map.size > this.limit) this.map.delete(this.map.keys().next().value!);
  }
  delete(id: string): void {
    this.map.delete(id);
  }
}

function placeholders(n: number): string {
  return Array.from({ length: n }, () => "?").join(", ");
}

export function createMediaStore(deps: MediaStoreDeps): MediaStore {
  const { db, settings, files, prep } = deps;
  const now = deps.now ?? Date.now;
  const caches: Record<MediaSize, Lru> = { thumb: new Lru(CACHE_LIMIT.thumb), full: new Lru(CACHE_LIMIT.full) };
  /** Ids whose files are being written but whose row is not inserted yet; sweep must not treat them as orphans. */
  const inFlight = new Set<string>();
  /** Bumped by remove() so a load that started before it never re-caches a removed photo. */
  let generation = 0;

  let cipherPromise: Promise<MediaCipher> | null = null;
  function cipher(): Promise<MediaCipher> {
    if (!cipherPromise) {
      const p = (async () => {
        let hex = await settings.get(MEDIA_KEY_SETTING);
        if (!hex) {
          // Another store over the same DB may race us: whoever inserts first wins, and both re-read.
          await db.run("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING", [
            MEDIA_KEY_SETTING,
            deps.randomHex(),
          ]);
          hex = await settings.get(MEDIA_KEY_SETTING);
          if (!hex) throw new Error("The media key could not be stored.");
        }
        return deps.cipherFor(hex);
      })();
      cipherPromise = p;
      // A transient failure must not poison the store for the rest of the session.
      p.catch(() => {
        if (cipherPromise === p) cipherPromise = null;
      });
    }
    return cipherPromise;
  }

  async function removeFiles(id: string): Promise<void> {
    for (const size of SIZES) await files.remove(fileName(id, size)).catch(() => undefined);
  }

  async function remove(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    generation++;
    for (const id of ids) for (const size of SIZES) caches[size].delete(id);
    await db.run(`DELETE FROM media WHERE id IN (${placeholders(ids.length)})`, ids);
    for (const id of ids) await removeFiles(id);
  }

  return {
    async importImage(sourceUri) {
      let id: string | null = null;
      try {
        const full = await prep.prepare(sourceUri, FULL_MAX_EDGE, FULL_COMPRESS);
        const thumb = await prep.prepare(sourceUri, THUMB_MAX_EDGE, THUMB_COMPRESS);
        const c = await cipher();
        const sealedFull = await c.encrypt(full.bytes);
        const sealedThumb = await c.encrypt(thumb.bytes);
        const newId = deps.randomId();
        id = newId;
        inFlight.add(newId);
        await files.write(fileName(newId, "full"), sealedFull);
        await files.write(fileName(newId, "thumb"), sealedThumb);
        const record: MediaRecord = { id: newId, mime: "image/jpeg", width: full.width, height: full.height };
        await db.run(
          "INSERT INTO media (id, mime, width, height, pending, created_at) VALUES (?, ?, ?, ?, 1, ?)",
          [record.id, record.mime, record.width, record.height, now()],
        );
        return record;
      } catch (e) {
        if (id) await removeFiles(id);
        throw e;
      } finally {
        if (id) inFlight.delete(id);
        try {
          await prep.discard(sourceUri);
        } catch (e) {
          console.warn("[Media] could not delete the picked file", e);
        }
      }
    },

    async commit(tx, ids) {
      if (ids.length === 0) return;
      await tx.run(`UPDATE media SET pending = 0 WHERE id IN (${placeholders(ids.length)})`, ids);
    },

    async info(id) {
      const row = await db.first<{ id: string; width: number; height: number }>(
        "SELECT id, width, height FROM media WHERE id = ?",
        [id],
      );
      return row ? { id: row.id, mime: "image/jpeg", width: row.width, height: row.height } : null;
    },

    async load(id, size) {
      const cached = caches[size].get(id);
      if (cached !== undefined) return cached;
      const startedAt = generation;
      let uri: string;
      try {
        const row = await db.first<{ mime: string }>("SELECT mime FROM media WHERE id = ?", [id]);
        if (!row) throw new MediaUnavailableError();
        const sealed = await files.read(fileName(id, size));
        const c = await cipher();
        uri = `data:${row.mime};base64,${await c.decryptToBase64(sealed)}`;
      } catch (e) {
        if (e instanceof MediaUnavailableError) throw e;
        throw new MediaUnavailableError(e instanceof Error ? e.message : undefined);
      }
      if (generation === startedAt) caches[size].set(id, uri);
      return uri;
    },

    remove,

    async sweep() {
      const stale = await db.all<{ id: string }>("SELECT id FROM media WHERE pending = 1 AND created_at < ?", [
        now() - PENDING_TTL_MS,
      ]);
      await remove(stale.map((r) => r.id));

      const names = await files.list();
      const checked = new Map<string, boolean>();
      for (const name of names) {
        const dot = name.lastIndexOf(".");
        const id = dot > 0 ? name.slice(0, dot) : name;
        // Checked in this order: an id no longer in flight has its row inserted already (or never will).
        if (inFlight.has(id)) continue;
        let known = checked.get(id);
        if (known === undefined) {
          known = (await db.first("SELECT 1 AS x FROM media WHERE id = ?", [id])) !== null;
          checked.set(id, known);
        }
        if (!known) await files.remove(name).catch(() => undefined);
      }
    },
  };
}
