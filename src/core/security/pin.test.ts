import { hashPin, hashPinAsync, isValidPin, LOCK_GRACE_MS, shouldLock, verifyPin, verifyPinAsync } from "@/core/security/pin";

const SALT_A = "00112233445566778899aabbccddeeff";
const SALT_B = "ffeeddccbbaa99887766554433221100";

describe("pin hashing", () => {
  it("verifyPin accepts the right PIN and rejects a wrong one", () => {
    const hash = hashPin("2468", SALT_A);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyPin("2468", SALT_A, hash)).toBe(true);
    expect(verifyPin("2469", SALT_A, hash)).toBe(false);
    expect(verifyPin("2468", SALT_A, hash.slice(0, 62))).toBe(false);
  });

  it("same PIN with different salts gives different hashes", () => {
    expect(hashPin("2468", SALT_A)).not.toBe(hashPin("2468", SALT_B));
  });

  it("async variants agree with the sync ones", async () => {
    const hash = hashPin("2468", SALT_A);
    await expect(hashPinAsync("2468", SALT_A)).resolves.toBe(hash);
    await expect(verifyPinAsync("2468", SALT_A, hash)).resolves.toBe(true);
    await expect(verifyPinAsync("1357", SALT_A, hash)).resolves.toBe(false);
  });
});

describe("isValidPin", () => {
  it("isValidPin accepts 4–8 digits only", () => {
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("1234")).toBe(true);
    expect(isValidPin("12345678")).toBe(true);
    expect(isValidPin("123456789")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
    expect(isValidPin("")).toBe(false);
    expect(isValidPin("12 34")).toBe(false);
  });
});

describe("shouldLock", () => {
  it("shouldLock is false when lock disabled", () => {
    expect(shouldLock({ lockEnabled: false, backgroundedAt: 0 }, 10 * LOCK_GRACE_MS)).toBe(false);
    expect(shouldLock({ lockEnabled: false, backgroundedAt: null }, 10 * LOCK_GRACE_MS)).toBe(false);
  });

  it("shouldLock stays false within the grace period and true after it", () => {
    expect(LOCK_GRACE_MS).toBe(30_000);
    const state = { lockEnabled: true, backgroundedAt: 0 };
    expect(shouldLock(state, 29_999)).toBe(false);
    expect(shouldLock(state, 30_000)).toBe(true);
    expect(shouldLock(state, 5_000, 1_000)).toBe(true);
  });

  it("shouldLock is false when the app was never backgrounded", () => {
    expect(shouldLock({ lockEnabled: true, backgroundedAt: null }, 10 * LOCK_GRACE_MS)).toBe(false);
  });
});
