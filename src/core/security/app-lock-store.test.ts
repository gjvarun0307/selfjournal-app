import { CORE_MIGRATIONS } from "@/core/db/core-migrations";
import { runMigrations } from "@/core/db/migrations";
import { createTestDb, failWritesTo } from "@/core/db/test-db";
import { createAppLockStore } from "@/core/security/app-lock-store";
import { hashPin, LEGACY_PIN_PBKDF2_ITERATIONS, PIN_PBKDF2_ITERATIONS } from "@/core/security/pin";
import { createAppSettings } from "@/core/settings/app-settings";

const SALT = "0123456789abcdef0123456789abcdef";
const NEW_SALT = "fedcba9876543210fedcba9876543210";

async function setup() {
  const db = createTestDb();
  await runMigrations(db, CORE_MIGRATIONS);
  const settings = createAppSettings(db);
  return { db, settings, store: createAppLockStore(settings, { newSalt: () => NEW_SALT }) };
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
    // Only the salt, a hash and the iteration count are stored, never the PIN itself.
    expect(await settings.get("lock.pinSalt")).toBe(SALT);
    expect(await settings.get("lock.pinHash")).toBe(hashPin("2468", SALT, PIN_PBKDF2_ITERATIONS));
    expect(await settings.get("lock.pinIterations")).toBe(String(PIN_PBKDF2_ITERATIONS));
  });

  it("rejects an invalid PIN", async () => {
    const { store } = await setup();
    await expect(store.setPin("12", SALT)).rejects.toThrow();
    expect((await store.getConfig()).hasPin).toBe(false);
  });

  it("setPin writes salt, hash and iterations together, so a failed write keeps the old PIN working", async () => {
    const { db, store } = await setup();
    await store.setPin("2468", SALT);

    // Simulate the app dying while the new hash is written: the new salt must not land alone.
    const broken = createAppLockStore(createAppSettings(failWritesTo(db, "lock.pinHash")));
    await expect(broken.setPin("1357", NEW_SALT)).rejects.toThrow("killed");

    expect(await store.checkPin("2468")).toBe(true);
    expect(await store.checkPin("1357")).toBe(false);
  });

  it("a PIN hashed before the iteration change still works and is upgraded on unlock", async () => {
    const { store, settings } = await setup();
    // A hash from before `lock.pinIterations` existed: 100k iterations, no count stored.
    await settings.set("lock.pinSalt", SALT);
    await settings.set("lock.pinHash", hashPin("2468", SALT, LEGACY_PIN_PBKDF2_ITERATIONS));

    expect(await store.checkPin("1357")).toBe(false);
    expect(await settings.get("lock.pinIterations")).toBeNull(); // a wrong PIN changes nothing

    expect(await store.checkPin("2468")).toBe(true);

    expect(await settings.get("lock.pinIterations")).toBe(String(PIN_PBKDF2_ITERATIONS));
    expect(await settings.get("lock.pinSalt")).toBe(NEW_SALT);
    expect(await settings.get("lock.pinHash")).toBe(hashPin("2468", NEW_SALT, PIN_PBKDF2_ITERATIONS));
    expect(await store.checkPin("2468")).toBe(true);
    expect(await store.checkPin("1357")).toBe(false);
  });

  it("clearPin disables lock", async () => {
    const { store, settings } = await setup();
    await store.setPin("2468", SALT);
    await store.setBiometrics(true);
    expect((await store.getConfig()).biometricsEnabled).toBe(true);

    await store.clearPin();

    expect(await store.getConfig()).toEqual({ lockEnabled: false, biometricsEnabled: false, hasPin: false });
    expect(await store.checkPin("2468")).toBe(false);
    for (const key of ["lock.pinHash", "lock.pinSalt", "lock.pinIterations", "lock.biometrics"]) {
      expect(await settings.get(key)).toBeNull();
    }
  });

  it("onboarding flag round-trip", async () => {
    const { store, settings } = await setup();
    expect(await store.isOnboarded()).toBe(false);
    await store.markOnboarded();
    expect(await store.isOnboarded()).toBe(true);
    expect(await settings.get("onboarding.done")).not.toBeNull();
  });
});
