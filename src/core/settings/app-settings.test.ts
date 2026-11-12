import { createTestDb } from "@/core/db/test-db";
import { runMigrations } from "@/core/db/migrations";
import { CORE_MIGRATIONS } from "@/core/db/core-migrations";
import { createAppSettings } from "./app-settings";

describe("AppSettings", () => {
  it("round-trips set/get/overwrite/delete", async () => {
    const db = createTestDb();
    await runMigrations(db, CORE_MIGRATIONS);
    const s = createAppSettings(db);
    expect(await s.get("k")).toBeNull();
    await s.set("k", "v1");
    expect(await s.get("k")).toBe("v1");
    await s.set("k", "v2");
    expect(await s.get("k")).toBe("v2");
    await s.delete("k");
    expect(await s.get("k")).toBeNull();
  });
});
