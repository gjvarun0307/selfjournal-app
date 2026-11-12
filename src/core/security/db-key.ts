import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { defaultDatabaseDirectory } from 'expo-sqlite';

export const DB_NAME = 'selfjournal.db';
export const DB_KEY_NAME = 'selfjournal.db-key';

export interface KeyStore {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
}

export const secureKeyStore: KeyStore = {
  get: (name) => SecureStore.getItemAsync(name),
  set: (name, value) => SecureStore.setItemAsync(name, value),
};

/** The DB file exists but its key is not in the keystore. Never auto-recover by creating a new key. */
export class MissingDbKeyError extends Error {
  constructor() {
    super('Database file exists but its encryption key is missing from secure storage.');
    this.name = 'MissingDbKeyError';
  }
}

/** Wrong key, corrupted key, or unreadable database file. */
export class DbKeyError extends Error {
  constructor(message = 'Could not unlock the database with the stored key.') {
    super(message);
    this.name = 'DbKeyError';
  }
}

// @noble/hashes v2 is ESM-only and does not load under Jest; a tiny helper avoids it.
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomHex32(): string {
  return bytesToHex(Crypto.getRandomBytes(32));
}

export function dbFileExists(): boolean {
  // defaultDatabaseDirectory is a plain path on Android (no file:// scheme).
  const dir = String(defaultDatabaseDirectory);
  const base = dir.includes('://') ? dir : `file://${dir}`;
  return new File(base.endsWith('/') ? base : `${base}/`, DB_NAME).exists;
}

export async function getOrCreateDbKey(opts: {
  store: KeyStore;
  dbFileExists: boolean;
  randomHex: () => string;
}): Promise<string> {
  const existing = await opts.store.get(DB_KEY_NAME);
  if (existing) return existing;
  if (opts.dbFileExists) throw new MissingDbKeyError();
  const key = opts.randomHex();
  await opts.store.set(DB_KEY_NAME, key);
  return key;
}
