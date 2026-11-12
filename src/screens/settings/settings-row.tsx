import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";

import { useTheme } from "@/theme/use-theme";

type IconName = keyof typeof Ionicons.glyphMap;

/** A tappable settings-style row. Without `onPress` it renders as a quiet, inactive row. */
export function SettingsRow({
  icon,
  title,
  note,
  onPress,
}: {
  icon: IconName;
  title: string;
  note?: string;
  onPress?: () => void;
}) {
  const { colors, space, radius, font } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityState={{ disabled: !onPress }}
      android_ripple={onPress ? { color: colors.surfaceAlt } : undefined}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        padding: space.lg,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
        opacity: onPress ? 1 : 0.6,
      }}
    >
      <Ionicons name={icon} size={22} color={colors.accent} />
      <View style={{ flex: 1, gap: space.xs }}>
        <Text style={{ color: colors.text, fontSize: font.body }}>{title}</Text>
        {note ? <Text style={{ color: colors.textMuted, fontSize: font.small }}>{note}</Text> : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </Pressable>
  );
}
