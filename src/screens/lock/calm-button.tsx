import { ActivityIndicator, Pressable, Text } from "react-native";

import { useTheme } from "@/theme/use-theme";

/** A full-width button. `primary` is filled with the accent colour; `quiet` is a text-only button. */
export function CalmButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "quiet";
  disabled?: boolean;
  busy?: boolean;
}) {
  const { colors, space, radius, font } = useTheme();
  const inactive = disabled || busy;
  const filled = variant === "primary";
  const textColor = filled ? colors.accentText : colors.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      android_ripple={{ color: filled ? colors.accentText : colors.surfaceAlt, foreground: true }}
      style={{
        minHeight: 48,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderRadius: radius.pill,
        overflow: "hidden",
        backgroundColor: filled ? colors.accent : variant === "secondary" ? colors.surface : "transparent",
        borderWidth: variant === "secondary" ? 1 : 0,
        borderColor: colors.border,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {busy ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={{ color: textColor, fontSize: font.body, fontWeight: "600" }}>{label}</Text>
      )}
    </Pressable>
  );
}
