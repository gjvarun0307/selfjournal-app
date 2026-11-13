import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { FlatList, Pressable, Text, View } from "react-native";

import { useEnabledPlugins, useHost } from "@/core/app-provider";
import { useTheme } from "@/theme/use-theme";
import type { DayKey } from "../days";

type IconName = keyof typeof Ionicons.glyphMap;

/** Every entry type from the enabled plugins. Picking one opens the editor for `day`. */
export function TypePickerScreen({ day }: { day: DayKey }) {
  const { colors, space, radius, font } = useTheme();
  const host = useHost();
  useEnabledPlugins(); // re-render when a plugin is switched on or off
  const types = host.entryTypes();

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: space.lg, gap: space.sm }}
      data={types}
      keyExtractor={(t) => t.id}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.name}
          accessibilityHint={item.description}
          onPress={() => router.push({ pathname: "/journal/edit", params: { day, typeId: item.id } })}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: space.md,
            padding: space.lg,
            borderRadius: radius.lg,
            borderCurve: "continuous",
            backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
          })}
        >
          <View
            style={{
              width: space.xxl + space.lg,
              height: space.xxl + space.lg,
              borderRadius: radius.pill,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.tints[item.card.tint],
            }}
          >
            <Ionicons name={`${item.icon}-outline` as IconName} size={space.xl} color={colors.text} />
          </View>
          <View style={{ flex: 1, gap: space.xs }}>
            <Text style={{ color: colors.text, fontSize: font.body, fontWeight: "600" }}>{item.name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: font.small }}>{item.description}</Text>
          </View>
          <Ionicons name="chevron-forward" size={space.lg + space.xs} color={colors.textMuted} />
        </Pressable>
      )}
    />
  );
}
