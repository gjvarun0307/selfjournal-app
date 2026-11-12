import { CORE_MIGRATIONS } from "@/core/db/core-migrations";
import { runMigrations } from "@/core/db/migrations";
import { createTestDb } from "@/core/db/test-db";
import { createAppLockStore } from "@/core/security/app-lock-store";
import { createAppSettings } from "@/core/settings/app-settings";

const SALT = "0123456789abcdef0123456789abcdef";

async function setup() {
  const db = createTestDb();
  await runMigrations(db, CORE_MIGRATIONS);
  const settings = createAppSettings(db);
  return { settings, store: createAppLockStore(settings) };
}

describe("AppLockStore", () => {
  it("setPin then checkPin", async () => {
    const { store, settings } = await setup();
    expect(await store.getConfig()).toEqual({ lockEnabled: false, biometricsEnabled: false, hasPin: false });
    expect(await store.checkPin("2468")).toBe(false);

    await store.setPin("2468", SALT);

    expect(await store.getConfig()).toEqual({ lockEnabled: true, biometricsEnabled: false, hasPin: true });
    expect(await store.checkPin("2468")).toBe(true);
    expect(await store.checkPin("1357")).toBe(false);
    // Only the salt and a hash are stored, never the PIN itself.
    expect(await settings.get("lock.pinSalt")).toBe(SALT);
    expect(await settings.get("lock.pinHash")).toMatch(/^[0-9a-f]{64}$/);
    expect(await settings.get("lock.pinHash")).not.toContain("2468");
  });

  it("rejects an invalid PIN", async () => {
    const { store } = await setup();
    await expect(store.setPin("12", SALT)).rejects.toThrow();
    expect((await store.getConfig()).hasPin).toBe(false);
  });

  it("clearPin disables lock", async () => {
    const { store, settings } = await setup();
    await store.setPin("2468", SALT);
    await store.setBiometrics(true);
    expect((await store.getConfig()).biometricsEnabled).toBe(true);

    await store.clearPin();

    expect(await store.getConfig()).toEqual({ lockEnabled: false, biometricsEnabled: false, hasPin: false });
    expect(await store.checkPin("2468")).toBe(false);
    expect(await settings.get("lock.pinHash")).toBeNull();
    expect(await settings.get("lock.pinSalt")).toBeNull();
  });

  it("onboarding flag round-trip", async () => {
    const { store, settings } = await setup();
    expect(await store.isOnboarded()).toBe(false);
    await store.markOnboarded();
    expect(await store.isOnboarded()).toBe(true);
    expect(await settings.get("onboarding.done")).not.toBeNull();
  });
});
