import { FlatList, Switch, Text, View } from "react-native";

import type { PluginHost } from "@/core/plugins/host";
import { useEnabledIds } from "@/core/plugins/use-enabled-ids";
import { useTheme } from "@/theme/use-theme";

export function PluginsScreen({ host }: { host: PluginHost }) {
  const { colors, space, radius, font } = useTheme();
  const enabled = new Set(useEnabledIds(host));

  const toggle = (id: string, on: boolean) => {
    host.setEnabled(id, on).catch((err) => console.warn(`[Plugins] could not switch "${id}"`, err));
  };

  return (
    <FlatList
      data={host.list()}
      keyExtractor={(p) => p.id}
      style={{ backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: space.lg, gap: space.md }}
      renderItem={({ item }) => (
        <View
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
          }}
        >
          <View style={{ flex: 1, gap: space.xs }}>
            <Text style={{ color: colors.text, fontSize: font.body, fontWeight: "600" }}>{item.name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: font.small }}>{item.description}</Text>
          </View>
          <Switch
            accessibilityLabel={item.name}
            value={enabled.has(item.id)}
            onValueChange={(on) => toggle(item.id, on)}
            trackColor={{ false: colors.surfaceAlt, true: colors.accent }}
            thumbColor={colors.surface}
            ios_backgroundColor={colors.surfaceAlt}
          />
        </View>
      )}
      ListFooterComponent={
        <Text style={{ color: colors.textMuted, fontSize: font.small, paddingTop: space.sm, textAlign: "center" }}>
          Turning a plugin off hides it. Your data stays.
        </Text>
      }
    />
  );
}
