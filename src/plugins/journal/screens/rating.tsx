import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, View } from "react-native";

import { useTheme } from "@/theme/use-theme";

const STARS = [1, 2, 3, 4, 5];

/** Five stars in the accent colour. Interactive only when `onChange` is given. */
export function Rating({ value, onChange }: { value: number; onChange?: (value: number) => void }) {
  const { colors, space } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: space.xs }}>
      {STARS.map((n) => {
        const icon = <Ionicons name={n <= value ? "star" : "star-outline"} size={space.lg + space.xs} color={colors.accent} />;
        if (!onChange) {
          return (
            <View key={n} accessible accessibilityLabel={`Rate ${n} of 5`}>
              {icon}
            </View>
          );
        }
        return (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityLabel={`Rate ${n} of 5`}
            accessibilityState={{ selected: n === value }}
            hitSlop={space.xs}
            onPress={() => onChange(n)}
          >
            {icon}
          </Pressable>
        );
      })}
    </View>
  );
}
