import { hashPinAsync, isValidPin, verifyPinAsync } from "@/core/security/pin";
import type { AppSettings } from "@/core/settings/app-settings";

export const LOCK_KEYS = {
  pinHash: "lock.pinHash",
  pinSalt: "lock.pinSalt",
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

/** PIN settings live in the encrypted app_settings table. Only a salted hash is stored, never the PIN. */
export function createAppLockStore(settings: AppSettings): AppLockStore {
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
      const hash = await hashPinAsync(pin, saltHex);
      await settings.set(LOCK_KEYS.pinSalt, saltHex);
      await settings.set(LOCK_KEYS.pinHash, hash);
    },
    async checkPin(pin) {
      const [hash, salt] = await Promise.all([settings.get(LOCK_KEYS.pinHash), settings.get(LOCK_KEYS.pinSalt)]);
      if (!hash || !salt) return false;
      return verifyPinAsync(pin, salt, hash);
    },
    async clearPin() {
      await settings.delete(LOCK_KEYS.pinHash);
      await settings.delete(LOCK_KEYS.pinSalt);
      await settings.delete(LOCK_KEYS.biometrics);
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
