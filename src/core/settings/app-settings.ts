import type { Db } from "@/core/db/types";

export interface AppSettings {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Writes every entry in one transaction: all of them land or none do. `null` deletes the key. */
  setMany(entries: Record<string, string | null>): Promise<void>;
}

const UPSERT =
  "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value";

export function createAppSettings(db: Db): AppSettings {
  return {
    async get(key) {
      const row = await db.first<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", [key]);
      return row ? row.value : null;
    },
    async set(key, value) {
      await db.run(UPSERT, [key, value]);
    },
    async delete(key) {
      await db.run("DELETE FROM app_settings WHERE key = ?", [key]);
    },
    async setMany(entries) {
      await db.transaction(async (tx) => {
        for (const [key, value] of Object.entries(entries)) {
          if (value === null) await tx.run("DELETE FROM app_settings WHERE key = ?", [key]);
          else await tx.run(UPSERT, [key, value]);
        }
      });
    },
  };
}
