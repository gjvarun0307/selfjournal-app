import type { ReactNode } from "react";
import { ScrollView, Text } from "react-native";

import { useTheme } from "@/theme/use-theme";

export function Placeholder({ title, note, children }: { title: string; note: string; children?: ReactNode }) {
  const { colors, space, font } = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center", padding: space.xl, gap: space.md }}
    >
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: font.title, fontWeight: "600" }}>
        {title}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: font.body, textAlign: "center" }}>{note}</Text>
      {children}
    </ScrollView>
  );
}
