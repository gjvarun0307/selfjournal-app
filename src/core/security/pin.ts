import { pbkdf2, pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import * as Crypto from "expo-crypto";

/** PBKDF2-SHA256 parameters for the app-lock PIN. Changing them invalidates every stored PIN. */
export const PIN_ITERATIONS = 100_000;
export const PIN_HASH_BYTES = 32;

/** How long the app may sit in the background before it asks for the PIN again. */
export const LOCK_GRACE_MS = 30_000;

const SALT_BYTES = 16;

/** A fresh random salt (16 bytes, hex) for each PIN that is set. */
export function newPinSalt(): string {
  return bytesToHex(Crypto.getRandomBytes(SALT_BYTES));
}

const PIN_PATTERN = /^\d{4,8}$/;

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

const opts = { c: PIN_ITERATIONS, dkLen: PIN_HASH_BYTES };
// pbkdf2Async yields to the event loop every `asyncTick` ms. On React Native each yield costs
// about a frame, so noble's 10 ms default roughly triples the total time; 100 ms keeps the JS
// thread responsive enough (taps and AppState still get through) at a small cost.
const asyncOpts = { ...opts, asyncTick: 100 };

/** Synchronous hash. Blocks the JS thread for the whole derivation, so UI code uses `hashPinAsync`. */
export function hashPin(pin: string, saltHex: string): string {
  return bytesToHex(pbkdf2(sha256, utf8ToBytes(pin), hexToBytes(saltHex), opts));
}

/** Same result as `hashPin`, but yields to the event loop while deriving so the UI stays responsive. */
export async function hashPinAsync(pin: string, saltHex: string): Promise<string> {
  return bytesToHex(await pbkdf2Async(sha256, utf8ToBytes(pin), hexToBytes(saltHex), asyncOpts));
}

/** Compares two hex strings in time that depends only on their length. */
function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function verifyPin(pin: string, saltHex: string, hashHex: string): boolean {
  return constantTimeEqualHex(hashPin(pin, saltHex), hashHex.toLowerCase());
}

export async function verifyPinAsync(pin: string, saltHex: string, hashHex: string): Promise<boolean> {
  return constantTimeEqualHex(await hashPinAsync(pin, saltHex), hashHex.toLowerCase());
}

export interface LockState {
  lockEnabled: boolean;
  /** When the app last went to the background, or `null` if it hasn't since it was last unlocked. */
  backgroundedAt: number | null;
}

/**
 * True when returning to the foreground should show the lock. A cold start has no `backgroundedAt`,
 * so this returns false for it; callers treat a cold start with the lock enabled as locked.
 */
export function shouldLock(state: LockState, now: number, graceMs = LOCK_GRACE_MS): boolean {
  if (!state.lockEnabled || state.backgroundedAt === null) return false;
  return now - state.backgroundedAt >= graceMs;
}
