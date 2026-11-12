import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";

import { MediaImage } from "@/core/media/media-image";
import { useTheme } from "@/theme/use-theme";

export const MAX_PHOTOS = 12;

/** The draft's photos as thumbs with a remove button each, plus "Add photos" up to MAX_PHOTOS. */
export function PhotoEditor({
  photoIds,
  importing,
  note,
  onAdd,
  onRemove,
}: {
  photoIds: string[];
  importing: boolean;
  note: string | null;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const { colors, space, radius, font } = useTheme();
  const thumb = space.xxl * 3;
  const full = photoIds.length >= MAX_PHOTOS;
  const addDisabled = full || importing;

  return (
    <View style={{ gap: space.sm }}>
      <Text style={{ color: colors.text, fontSize: font.body, fontWeight: "600" }}>Photos</Text>
      {photoIds.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {photoIds.map((id, i) => (
            <View key={id} style={{ width: thumb, height: thumb }}>
              <MediaImage id={id} size="thumb" style={{ width: thumb, height: thumb }} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${i + 1}`}
                hitSlop={space.sm}
                onPress={() => onRemove(id)}
                style={{
                  position: "absolute",
                  top: space.xs,
                  right: space.xs,
                  width: space.xl + space.xs,
                  height: space.xl + space.xs,
                  borderRadius: radius.pill,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.surface,
                }}
              >
                <Ionicons name="close" size={space.lg + space.xs} color={colors.text} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      {importing ? (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.textMuted, fontSize: font.small }}>
          Adding photos…
        </Text>
      ) : null}
      {note ? (
        <Text selectable accessibilityLiveRegion="polite" style={{ color: colors.textMuted, fontSize: font.small }}>
          {note}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add photos"
        accessibilityState={{ disabled: addDisabled, busy: importing }}
        disabled={addDisabled}
        onPress={onAdd}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignSelf: "flex-start",
          alignItems: "center",
          gap: space.sm,
          minHeight: 48,
          paddingHorizontal: space.lg,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          opacity: addDisabled ? 0.5 : pressed ? 0.8 : 1,
        })}
      >
        <Ionicons name="images-outline" size={space.xl} color={colors.accent} />
        <Text style={{ color: colors.accent, fontSize: font.body, fontWeight: "600" }}>Add photos</Text>
      </Pressable>
      {full ? (
        <Text style={{ color: colors.textMuted, fontSize: font.small }}>{`That's ${MAX_PHOTOS} photos, the most one entry can hold.`}</Text>
      ) : null}
    </View>
  );
}
