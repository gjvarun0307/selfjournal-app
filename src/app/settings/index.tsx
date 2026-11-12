import { useRouter } from "expo-router";
import { ScrollView } from "react-native";

import { useEnabledPlugins } from "@/core/app-provider";
import { SettingsRow } from "@/screens/settings/settings-row";
import { useTheme } from "@/theme/use-theme";

export default function SettingsIndex() {
  const router = useRouter();
  const { colors, space } = useTheme();
  const journalOn = useEnabledPlugins().includes("journal");
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
      {journalOn ? (
        <SettingsRow
          icon="notifications-outline"
          title="Reminders"
          note="A gentle nudge to check in each day"
          onPress={() => router.push("/settings/reminders")}
        />
      ) : null}
      <SettingsRow
        icon="lock-closed-outline"
        title="App lock"
        note="Keep your journal private with a PIN"
        onPress={() => router.push("/settings/app-lock")}
      />
    </ScrollView>
  );
}
