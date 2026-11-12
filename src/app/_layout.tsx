import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme as NavTheme } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { AppProvider } from "@/core/app-provider";
import { useTheme } from "@/theme/use-theme";

export default function RootLayout() {
  const { colors, scheme } = useTheme();
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const navTheme: NavTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.accent,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <AppProvider>
        <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="settings/index" options={{ title: "Settings" }} />
          <Stack.Screen name="settings/plugins" options={{ title: "Plugins" }} />
        </Stack>
      </AppProvider>
    </ThemeProvider>
  );
}
