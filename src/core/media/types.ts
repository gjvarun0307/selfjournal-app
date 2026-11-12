import type { Db } from "@/core/db/types";

export interface MediaRecord {
  id: string;
  mime: "image/jpeg";
  width: number;
  height: number;
}

export type MediaSize = "full" | "thumb";

/** The photo's row or file is gone, or it could not be decrypted. Shown as a calm placeholder. */
export class MediaUnavailableError extends Error {
  constructor(message = "This photo is not available.") {
    super(message);
    this.name = "MediaUnavailableError";
  }
}

export interface MediaStore {
  /** Downscales, encrypts and stores an image, then deletes `sourceUri` (only if it is under the cache dir). Stays `pending` until committed. */
  importImage(sourceUri: string): Promise<MediaRecord>;
  /** Call inside the owner's transaction with its `tx`: marks pending media as kept. */
  commit(tx: Db, ids: string[]): Promise<void>;
  info(id: string): Promise<MediaRecord | null>;
  /** `data:image/jpeg;base64,…` of the decrypted image. Rejects with MediaUnavailableError. */
  load(id: string, size: MediaSize): Promise<string>;
  /** Deletes rows, then files. Unknown ids are ignored. */
  remove(ids: string[]): Promise<void>;
  /** Removes pending rows older than 24 h (and their files) and files with no row. */
  sweep(): Promise<void>;
}

export interface MediaCipher {
  encrypt(plain: Uint8Array): Promise<Uint8Array>;
  decryptToBase64(sealed: Uint8Array): Promise<string>;
}

export interface MediaFiles {
  write(name: string, bytes: Uint8Array): Promise<void>;
  read(name: string): Promise<Uint8Array>;
  /** Missing files are ignored. */
  remove(name: string): Promise<void>;
  list(): Promise<string[]>;
}

export interface ImagePrep {
  prepare(uri: string, maxEdge: number, compress: number): Promise<{ bytes: Uint8Array; width: number; height: number }>;
  discard(uri: string): Promise<void>;
}
