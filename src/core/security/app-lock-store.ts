import {
  hashPinAsync,
  isValidPin,
  LEGACY_PIN_PBKDF2_ITERATIONS,
  newPinSalt,
  PIN_PBKDF2_ITERATIONS,
  verifyPinAsync,
} from "@/core/security/pin";
import type { AppSettings } from "@/core/settings/app-settings";

export const LOCK_KEYS = {
  pinHash: "lock.pinHash",
  pinSalt: "lock.pinSalt",
  pinIterations: "lock.pinIterations",
  biometrics: "lock.biometrics",
  onboarded: "onboarding.done",
} as const;

export interface AppLockConfig {
  /** Always equal to `hasPin`: the lock is on exactly when a PIN is set. */
  lockEnabled: boolean;
  biometricsEnabled: boolean;
  hasPin: boolean;
}

export interface AppLockStore {
  getConfig(): Promise<AppLockConfig>;
  setPin(pin: string, saltHex: string): Promise<void>;
  checkPin(pin: string): Promise<boolean>;
  clearPin(): Promise<void>;
  setBiometrics(on: boolean): Promise<void>;
  markOnboarded(): Promise<void>;
  isOnboarded(): Promise<boolean>;
}

function storedIterations(value: string | null): number {
  if (value === null) return LEGACY_PIN_PBKDF2_ITERATIONS;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : LEGACY_PIN_PBKDF2_ITERATIONS;
}

/**
 * PIN settings live in the encrypted app_settings table. Only a salted hash and its iteration count
 * are stored, never the PIN. Salt, hash and count are always written together in one transaction.
 */
export function createAppLockStore(
  settings: AppSettings,
  { newSalt = newPinSalt }: { newSalt?: () => string } = {},
): AppLockStore {
  const writePin = async (pin: string, saltHex: string) => {
    const hash = await hashPinAsync(pin, saltHex, PIN_PBKDF2_ITERATIONS);
    await settings.setMany({
      [LOCK_KEYS.pinSalt]: saltHex,
      [LOCK_KEYS.pinHash]: hash,
      [LOCK_KEYS.pinIterations]: String(PIN_PBKDF2_ITERATIONS),
    });
  };

  return {
    async getConfig() {
      const [hash, salt, biometrics] = await Promise.all([
        settings.get(LOCK_KEYS.pinHash),
        settings.get(LOCK_KEYS.pinSalt),
        settings.get(LOCK_KEYS.biometrics),
      ]);
      const hasPin = !!hash && !!salt;
      return { lockEnabled: hasPin, hasPin, biometricsEnabled: hasPin && biometrics === "1" };
    },
    async setPin(pin, saltHex) {
      if (!isValidPin(pin)) throw new Error("A PIN must be 4 to 8 digits.");
      await writePin(pin, saltHex);
    },
    async checkPin(pin) {
      const [hash, salt, count] = await Promise.all([
        settings.get(LOCK_KEYS.pinHash),
        settings.get(LOCK_KEYS.pinSalt),
        settings.get(LOCK_KEYS.pinIterations),
      ]);
      if (!hash || !salt) return false;
      const iterations = storedIterations(count);
      const ok = await verifyPinAsync(pin, salt, hash, iterations);
      if (ok && iterations !== PIN_PBKDF2_ITERATIONS) {
        // Re-hash an older PIN at the current count, with a fresh salt. If this fails the old hash
        // stays intact (the write is atomic) and the upgrade is simply tried on the next unlock.
        await writePin(pin, newSalt()).catch(() => console.warn("[AppLock] could not upgrade the stored PIN hash"));
      }
      return ok;
    },
    async clearPin() {
      await settings.setMany({
        [LOCK_KEYS.pinHash]: null,
        [LOCK_KEYS.pinSalt]: null,
        [LOCK_KEYS.pinIterations]: null,
        [LOCK_KEYS.biometrics]: null,
      });
    },
    async setBiometrics(on) {
      await settings.set(LOCK_KEYS.biometrics, on ? "1" : "0");
    },
    async markOnboarded() {
      await settings.set(LOCK_KEYS.onboarded, "1");
    },
    async isOnboarded() {
      return (await settings.get(LOCK_KEYS.onboarded)) === "1";
    },
  };
}
