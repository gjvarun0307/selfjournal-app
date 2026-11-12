import { Pressable, Text, View } from "react-native";

import { useTheme } from "@/theme/use-theme";

/**
 * A calm question shown in the screen's own tree (never an RN Modal, which would draw above the
 * app lock). The confirm button is in the accent colour; cancel is a quiet outlined button.
 */
export function InlineConfirm({
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy = false,
}: {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const { colors, space, radius, font } = useTheme();
  const button = (label: string, onPress: () => void, filled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 48,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderRadius: radius.pill,
        backgroundColor: filled ? colors.accent : colors.surface,
        borderWidth: filled ? 0 : 1,
        borderColor: colors.border,
        opacity: busy ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ color: filled ? colors.accentText : colors.text, fontSize: font.body, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        gap: space.lg,
        padding: space.lg,
        borderRadius: radius.lg,
        borderCurve: "continuous",
        backgroundColor: colors.surfaceAlt,
      }}
    >
      <Text selectable style={{ color: colors.text, fontSize: font.body, lineHeight: font.body * 1.4 }}>
        {message}
      </Text>
      <View style={{ flexDirection: "row", gap: space.md }}>
        {button(cancelLabel, onCancel, false)}
        {button(confirmLabel, onConfirm, true)}
      </View>
    </View>
  );
}
