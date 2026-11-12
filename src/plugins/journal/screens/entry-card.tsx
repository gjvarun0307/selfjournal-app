import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";

import type { EntryTypeDefinition } from "@/core/entry-types/types";
import { MediaImage } from "@/core/media/media-image";
import { useTheme } from "@/theme/use-theme";
import type { JournalEntry } from "../journal-service";
import { Rating } from "./rating";

type IconName = keyof typeof Ionicons.glyphMap;

function str(v: unknown): string | undefined {
  if (typeof v === "number") return String(v);
  return typeof v === "string" && v.trim() ? v : undefined;
}

export function EntryCard({
  entry,
  type,
  onPress,
}: {
  entry: JournalEntry;
  type: EntryTypeDefinition | undefined;
  onPress: () => void;
}) {
  const { colors, space, radius, font } = useTheme();
  const typeName = type?.name ?? "Entry";
  const tint = colors.tints[type?.card.tint ?? "sand"];
  const variant = type?.card.variant ?? "note";

  const titleValue = type?.titleField ? str(entry.fields[type.titleField]) : undefined;
  const longText = type?.fields.filter((f) => f.kind === "longText").map((f) => str(entry.fields[f.key])).find(Boolean);
  const ratingField = type?.fields.find((f) => f.kind === "rating");
  const rating = ratingField ? Number(entry.fields[ratingField.key]) : 0;
  const unknownValues = type ? [] : Object.values(entry.fields).map(str).filter((v): v is string => !!v);

  const title = variant === "cover" ? (titleValue ?? typeName) : titleValue;
  const a11yTitle = title ?? longText ?? unknownValues[0] ?? "";

  const textStyle = { color: colors.text, fontSize: font.body } as const;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${typeName}: ${a11yTitle}`}
      android_ripple={{ color: colors.surfaceAlt }}
      style={{
        backgroundColor: tint,
        borderRadius: radius.lg,
        borderCurve: "continuous",
        overflow: "hidden",
        padding: space.lg,
        gap: space.sm,
      }}
    >
      {variant === "cover" && type ? (
        <>
          {entry.photoIds[0] ? (
            <MediaImage id={entry.photoIds[0]} size="thumb" style={{ width: "100%", aspectRatio: 16 / 9 }} />
          ) : null}
          <Text style={{ ...textStyle, fontSize: font.title * 0.8, fontWeight: "600" }}>{title}</Text>
          {rating > 0 ? <Rating value={rating} /> : null}
          {longText ? (
            <Text numberOfLines={2} style={textStyle}>
              {longText}
            </Text>
          ) : null}
        </>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Ionicons name={(type?.icon ?? "document-text") as IconName} size={font.body + space.xs} color={colors.text} />
            <Text style={{ color: colors.text, fontSize: font.small }}>{typeName}</Text>
          </View>
          {title ? <Text style={{ ...textStyle, fontWeight: "600" }}>{title}</Text> : null}
          {longText ? (
            <Text numberOfLines={4} style={textStyle}>
              {longText}
            </Text>
          ) : null}
          {unknownValues.map((v, i) => (
            <Text key={i} numberOfLines={4} style={textStyle}>
              {v}
            </Text>
          ))}
          {entry.photoIds.length > 0 ? (
            <View style={{ flexDirection: "row", gap: space.sm }}>
              {entry.photoIds.slice(0, 3).map((id) => (
                <MediaImage key={id} id={id} size="thumb" style={{ flex: 1 }} />
              ))}
            </View>
          ) : null}
        </>
      )}
    </Pressable>
  );
}
