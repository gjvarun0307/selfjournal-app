import { useEffect, useState } from "react";

import { useMedia } from "@/core/app-provider";
import type { MediaSize } from "./types";

export type MediaUriState = { status: "loading" } | { status: "ready"; uri: string } | { status: "missing" };

const LOADING: MediaUriState = { status: "loading" };

/** Decrypts a photo into an in-memory `data:` URI. Never writes decrypted bytes anywhere. */
export function useMediaUri(id: string, size: MediaSize): MediaUriState {
  const media = useMedia();
  const key = `${id}:${size}`;
  const [result, setResult] = useState<{ key: string; state: MediaUriState } | null>(null);

  useEffect(() => {
    let live = true;
    media.load(id, size).then(
      (uri) => live && setResult({ key, state: { status: "ready", uri } }),
      () => live && setResult({ key, state: { status: "missing" } }),
    );
    return () => {
      live = false;
    };
  }, [media, id, size, key]);

  return result?.key === key ? result.state : LOADING;
}
