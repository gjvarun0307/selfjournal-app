import { useRouter } from "expo-router";
import { ScrollView } from "react-native";

import { SettingsRow } from "@/screens/settings/settings-row";
import { useTheme } from "@/theme/use-theme";

export default function SettingsIndex() {
  const router = useRouter();
  const { colors, space } = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: space.lg, gap: space.md }}
    >
      <SettingsRow
        icon="extension-puzzle-outline"
        title="Plugins"
        note="Choose which parts of SelfJournal you use"
        onPress={() => router.push("/settings/plugins")}
      />
      <SettingsRow
        icon="lock-closed-outline"
        title="App lock"
        note="Keep your journal private with a PIN"
        onPress={() => router.push("/settings/app-lock")}
      />
    </ScrollView>
  );
}
