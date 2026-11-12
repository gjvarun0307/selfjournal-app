import { useRouter } from "expo-router";
import { View } from "react-native";

import { Placeholder } from "@/screens/placeholder";
import { SettingsRow } from "@/screens/settings/settings-row";
import { useTheme } from "@/theme/use-theme";

export default function MeTab() {
  const router = useRouter();
  const { space } = useTheme();
  return (
    <Placeholder title="Me" note="Coming in the next update">
      <View style={{ alignSelf: "stretch", paddingTop: space.xl }}>
        <SettingsRow icon="settings-outline" title="Settings" onPress={() => router.push("/settings")} />
      </View>
    </Placeholder>
  );
}
