// Test-only: the media store over in-memory files, Node AES-256-GCM and a fake image prep.
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "crypto";

import type { Db } from "@/core/db/types";
import type { AppSettings } from "@/core/settings/app-settings";
import { createMediaStore, type MediaStoreDeps } from "./media-store";
import type { ImagePrep, MediaCipher, MediaFiles, MediaStore } from "./types";

export const FAKE_JPEG_PREFIX = [0xff, 0xd8, 0xff];

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/** Same layout as expo-crypto's `combined()`: 12-byte IV | ciphertext | 16-byte tag. */
export async function nodeCipherFor(keyHex: string): Promise<MediaCipher> {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) throw new Error("Media key must be 32 bytes");
  return {
    async encrypt(plain) {
      const iv = randomBytes(IV_LENGTH);
      const c = createCipheriv("aes-256-gcm", key, iv);
      const body = Buffer.concat([c.update(plain), c.final()]);
      return new Uint8Array(Buffer.concat([iv, body, c.getAuthTag()]));
    },
    async decryptToBase64(sealed) {
      const buf = Buffer.from(sealed);
      const iv = buf.subarray(0, IV_LENGTH);
      const tag = buf.subarray(buf.length - TAG_LENGTH);
      const d = createDecipheriv("aes-256-gcm", key, iv);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(buf.subarray(IV_LENGTH, buf.length - TAG_LENGTH)), d.final()]).toString("base64");
    },
  };
}

export interface MemoryMediaFiles extends MediaFiles {
  /** Return true to make `write(name)` reject, as if the disk were full. */
  failWrite?: (name: string) => boolean;
}

export function createMemoryMediaFiles(): MemoryMediaFiles {
  const map = new Map<string, Uint8Array>();
  const files: MemoryMediaFiles = {
    async write(name, bytes) {
      if (files.failWrite?.(name)) throw new Error(`write failed: ${name}`);
      map.set(name, new Uint8Array(bytes));
    },
    async read(name) {
      const bytes = map.get(name);
      if (!bytes) throw new Error(`no such file: ${name}`);
      return new Uint8Array(bytes);
    },
    async remove(name) {
      map.delete(name);
    },
    async list() {
      return [...map.keys()];
    },
  };
  return files;
}

export interface FakeImagePrep extends ImagePrep {
  prepared: { uri: string; maxEdge: number; bytes: Uint8Array; width: number; height: number }[];
  discarded: string[];
  /** How many times `sweepTemp` ran. */
  tempSweeps: number;
  /** When set, `prepare` waits for it, so a test can hold an import mid-flight. */
  gate?: Promise<void>;
  /** Return true to make `sweepTemp` reject. */
  failSweepTemp?: boolean;
}

/** Pretends every source is a 4000x3000 photo and returns JPEG-like bytes that differ per call. */
export function createFakeImagePrep(): FakeImagePrep {
  let n = 0;
  const prep: FakeImagePrep = {
    prepared: [],
    discarded: [],
    tempSweeps: 0,
    async prepare(uri, maxEdge) {
      if (prep.gate) await prep.gate;
      const scale = Math.min(1, maxEdge / 4000);
      const width = Math.round(4000 * scale);
      const height = Math.round(3000 * scale);
      n++;
      const bytes = new Uint8Array([...FAKE_JPEG_PREFIX, 0xe0, n & 0xff, maxEdge & 0xff, ...Buffer.from(uri)]);
      prep.prepared.push({ uri, maxEdge, bytes, width, height });
      return { bytes, width, height };
    },
    async discard(uri) {
      prep.discarded.push(uri);
    },
    async sweepTemp() {
      prep.tempSweeps++;
      if (prep.failSweepTemp) throw new Error("temp sweep failed");
    },
  };
  return prep;
}

export type TestMedia = MediaStore & { files: MemoryMediaFiles; prep: FakeImagePrep };

export function createTestMedia(
  db: Db,
  settings: AppSettings,
  opts: { files?: MemoryMediaFiles; prep?: FakeImagePrep; now?: () => number } = {},
): TestMedia {
  const files = opts.files ?? createMemoryMediaFiles();
  const prep = opts.prep ?? createFakeImagePrep();
  const deps: MediaStoreDeps = {
    db,
    settings,
    files,
    prep,
    cipherFor: nodeCipherFor,
    randomId: () => randomUUID(),
    randomHex: () => randomBytes(32).toString("hex"),
    now: opts.now,
  };
  return Object.assign(createMediaStore(deps), { files, prep });
}
