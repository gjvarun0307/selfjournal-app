// Native media deps. Only this file imports the native modules, so the store itself stays testable under Jest.
import * as Crypto from "expo-crypto";
import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import { randomHex32 } from "@/core/security/db-key";
import type { MediaStoreDeps } from "./media-store";
import type { ImagePrep, MediaCipher, MediaFiles } from "./types";

/** Encrypted photos live in app-private storage: `<document>/media/<id>.full` and `<id>.thumb`. */
export function expoMediaFiles(): MediaFiles {
  const dir = new Directory(Paths.document, "media");
  let ready = false;
  const ensureDir = () => {
    if (ready) return;
    dir.create({ idempotent: true, intermediates: true });
    ready = true;
  };
  return {
    async write(name, bytes) {
      ensureDir();
      await new File(dir, name).write(bytes);
    },
    async read(name) {
      return new File(dir, name).bytes();
    },
    async remove(name) {
      const f = new File(dir, name);
      if (f.exists) f.delete();
    },
    async list() {
      if (!dir.exists) return [];
      return dir.list().flatMap((entry) => (entry instanceof File ? [entry.name] : []));
    },
  };
}

/** AES-256-GCM via expo-crypto. Stored layout (the defaults): 12-byte IV | ciphertext | 16-byte tag. */
export async function expoCipherFor(keyHex: string): Promise<MediaCipher> {
  const key = await AESEncryptionKey.import(keyHex, "hex");
  return {
    async encrypt(plain) {
      const sealed = await aesEncryptAsync(plain, key);
      return sealed.combined();
    },
    async decryptToBase64(sealed) {
      return aesDecryptAsync(AESSealedData.fromCombined(sealed), key, { output: "base64" });
    },
  };
}

function cacheDirUri(): string {
  const uri = Paths.cache.uri;
  return uri.endsWith("/") ? uri : `${uri}/`;
}

/** Deletes `uri` only when it is a plain file under our cache dir. Gallery files and content:// URIs are never touched. */
function deleteIfCached(uri: string): void {
  if (!uri.startsWith(cacheDirUri()) || uri.includes("/../")) return;
  const f = new File(uri);
  if (f.exists) f.delete();
}

/** Cache subdirs where expo-image-picker and expo-image-manipulator leave plaintext copies. */
const TEMP_DIRS = ["ImagePicker", "ImageManipulator"];

export const expoImagePrep: ImagePrep = {
  async prepare(uri, maxEdge, compress) {
    // The load options downsample while decoding and never upscale.
    const context = ImageManipulator.manipulate(uri, { maxWidth: maxEdge, maxHeight: maxEdge });
    const image = await context.renderAsync();
    try {
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress });
      try {
        const bytes = await new File(saved.uri).bytes();
        return { bytes, width: saved.width, height: saved.height };
      } finally {
        // The saved JPEG is the manipulator's own plaintext temp file: remove it as soon as its bytes are in memory.
        try {
          const f = new File(saved.uri);
          if (f.exists) f.delete();
        } catch (e) {
          console.warn("[Media] could not delete the resized copy", e);
        }
      }
    } finally {
      image.release();
      context.release();
    }
  },
  async discard(uri) {
    deleteIfCached(uri);
  },
  async sweepTemp() {
    for (const name of TEMP_DIRS) {
      const dir = new Directory(Paths.cache, name);
      if (!dir.exists) continue;
      for (const entry of dir.list()) entry.delete();
    }
  },
};

/** Everything `createMediaStore` needs on a device except `db` and `settings`. */
export function expoMediaDeps(): Pick<MediaStoreDeps, "files" | "cipherFor" | "prep" | "randomId" | "randomHex"> {
  return {
    files: expoMediaFiles(),
    cipherFor: expoCipherFor,
    prep: expoImagePrep,
    randomId: () => Crypto.randomUUID(),
    randomHex: randomHex32,
  };
}
