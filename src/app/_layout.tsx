import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router, type Theme as NavTheme } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { AppProvider } from "@/core/app-provider";
import { LockGate, useAppLock } from "@/screens/lock";
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
        <LockGate onPinReset={() => router.push("/settings/app-lock")}>
          <RootStack />
        </LockGate>
      </AppProvider>
    </ThemeProvider>
  );
}

/** First run shows only the onboarding screen; once it's done, only the app. */
function RootStack() {
  const { colors } = useTheme();
  const { onboarded } = useAppLock();
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="settings/index" options={{ title: "Settings" }} />
        <Stack.Screen name="settings/plugins" options={{ title: "Plugins" }} />
        <Stack.Screen name="settings/app-lock" options={{ title: "App lock" }} />
        <Stack.Screen name="settings/reminders" options={{ title: "Reminders" }} />
        <Stack.Screen name="journal/new" options={{ title: "New entry" }} />
        <Stack.Screen name="journal/edit" options={{ title: "Entry" }} />
        <Stack.Screen name="journal/[id]" options={{ title: "Entry" }} />
      </Stack.Protected>
      <Stack.Protected guard={!onboarded}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
