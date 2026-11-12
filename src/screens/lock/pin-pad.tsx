import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";

import { useTheme } from "@/theme/use-theme";

export const PIN_MAX_LENGTH = 8;

const ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["", "0", "del"],
] as const;

/** Dots for the digits typed so far. The digits themselves are never shown. */
export function PinDots({ length }: { length: number }) {
  const { colors, space } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={length === 1 ? "1 digit entered" : `${length} digits entered`}
      style={{ flexDirection: "row", gap: space.md, minHeight: 16, justifyContent: "center" }}
    >
      {Array.from({ length: Math.max(length, 4) }, (_, i) => (
        <View
          key={i}
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            borderWidth: 1.5,
            borderColor: colors.accent,
            backgroundColor: i < length ? colors.accent : "transparent",
          }}
        />
      ))}
    </View>
  );
}

/** A number pad for 4–8 digit PINs. Controlled: the parent owns `value`. */
export function PinPad({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const { colors, space, font } = useTheme();

  const press = (key: string) => {
    if (key === "del") onChange(value.slice(0, -1));
    else if (value.length < PIN_MAX_LENGTH) onChange(value + key);
  };

  return (
    <View style={{ gap: space.sm, alignSelf: "center" }}>
      {ROWS.map((row, r) => (
        <View key={r} style={{ flexDirection: "row", gap: space.lg }}>
          {row.map((key, c) =>
            key === "" ? (
              <View key={c} style={{ width: 72, height: 64 }} />
            ) : (
              <Pressable
                key={c}
                onPress={() => press(key)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={key === "del" ? "Delete last digit" : key}
                android_ripple={{ color: colors.surfaceAlt, borderless: true, radius: 36 }}
                style={{
                  width: 72,
                  height: 64,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 32,
                  backgroundColor: key === "del" ? "transparent" : colors.surface,
                  opacity: disabled ? 0.5 : 1,
                }}
              >
                {key === "del" ? (
                  <Ionicons name="backspace-outline" size={26} color={colors.textMuted} />
                ) : (
                  <Text style={{ color: colors.text, fontSize: font.title, fontVariant: ["tabular-nums"] }}>{key}</Text>
                )}
              </Pressable>
            ),
          )}
        </View>
      ))}
    </View>
  );
}
