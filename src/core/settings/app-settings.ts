import type { Db } from "@/core/db/types";

export interface AppSettings {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export function createAppSettings(db: Db): AppSettings {
  return {
    async get(key) {
      const row = await db.first<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", [key]);
      return row ? row.value : null;
    },
    async set(key, value) {
      await db.run(
        "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
      );
    },
    async delete(key) {
      await db.run("DELETE FROM app_settings WHERE key = ?", [key]);
    },
  };
}
