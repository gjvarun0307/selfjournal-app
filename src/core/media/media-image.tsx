import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { StyleSheet, View, type ImageStyle, type StyleProp } from "react-native";

import { useMedia } from "@/core/app-provider";
import { useTheme } from "@/theme/use-theme";
import type { MediaSize } from "./types";
import { useMediaUri } from "./use-media-uri";

export const MEDIA_UNAVAILABLE_LABEL = "This photo can't be shown right now";

/** Width / height from the stored record, so a full-size photo keeps its shape when the caller gives no height. */
function useAspectRatio(id: string, enabled: boolean): number | undefined {
  const media = useMedia();
  const [found, setFound] = useState<{ id: string; ratio: number } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    media.info(id).then(
      (rec) => live && rec && rec.height > 0 && setFound({ id, ratio: rec.width / rec.height }),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [media, id, enabled]);
  return enabled && found?.id === id ? found.ratio : undefined;
}

export function MediaImage({ id, size, style }: { id: string; size: MediaSize; style?: StyleProp<ImageStyle> }) {
  const { colors, radius, space } = useTheme();
  const state = useMediaUri(id, size);
  const flat = StyleSheet.flatten(style) ?? {};
  const wantsRatio = size === "full" && flat.height === undefined && flat.aspectRatio === undefined;
  const ratio = useAspectRatio(id, wantsRatio);
  const shape: ImageStyle = {
    borderRadius: radius.md,
    ...(size === "thumb" && flat.aspectRatio === undefined ? { aspectRatio: 1 } : null),
    ...(size === "full" && flat.width === undefined ? { width: "100%" } : null),
    ...(wantsRatio ? { aspectRatio: ratio ?? 4 / 3 } : null),
  };

  if (state.status === "ready") {
    return (
      <Image
        testID="media-image"
        source={{ uri: state.uri }}
        cachePolicy="none"
        contentFit="cover"
        accessibilityIgnoresInvertColors
        style={[shape, style]}
      />
    );
  }

  const missing = state.status === "missing";
  return (
    <View
      accessible={missing}
      accessibilityRole={missing ? "image" : undefined}
      accessibilityLabel={missing ? MEDIA_UNAVAILABLE_LABEL : undefined}
      style={[
        shape,
        { backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center", padding: space.sm },
        style,
      ]}
    >
      {missing ? <Ionicons name="image-outline" size={space.xl} color={colors.textMuted} /> : null}
    </View>
  );
}
