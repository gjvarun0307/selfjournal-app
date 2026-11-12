import { createTestDb, failWritesTo } from "@/core/db/test-db";
import { runMigrations } from "@/core/db/migrations";
import { CORE_MIGRATIONS } from "@/core/db/core-migrations";
import { createAppSettings } from "./app-settings";

async function migratedDb() {
  const db = createTestDb();
  await runMigrations(db, CORE_MIGRATIONS);
  return db;
}

describe("AppSettings", () => {
  it("round-trips set/get/overwrite/delete", async () => {
    const s = createAppSettings(await migratedDb());
    expect(await s.get("k")).toBeNull();
    await s.set("k", "v1");
    expect(await s.get("k")).toBe("v1");
    await s.set("k", "v2");
    expect(await s.get("k")).toBe("v2");
    await s.delete("k");
    expect(await s.get("k")).toBeNull();
  });

  it("setMany writes and deletes several keys together", async () => {
    const s = createAppSettings(await migratedDb());
    await s.set("gone", "x");
    await s.setMany({ a: "1", b: "2", gone: null });
    expect(await s.get("a")).toBe("1");
    expect(await s.get("b")).toBe("2");
    expect(await s.get("gone")).toBeNull();
  });

  it("setMany is all-or-nothing", async () => {
    const db = await migratedDb();
    await createAppSettings(db).setMany({ a: "old-a", b: "old-b" });
    const s = createAppSettings(failWritesTo(db, "b"));

    await expect(s.setMany({ a: "new-a", b: "new-b" })).rejects.toThrow("killed");

    expect(await s.get("a")).toBe("old-a");
    expect(await s.get("b")).toBe("old-b");
  });
});
