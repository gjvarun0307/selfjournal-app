import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppLock } from "@/screens/lock";
import { CalmButton } from "@/screens/lock/calm-button";
import { PinSetup } from "@/screens/lock/pin-setup";
import { useTheme } from "@/theme/use-theme";

export const ONBOARDING_COPY = "Your journal stays on this phone. A PIN keeps it private if someone else picks it up.";

/** First launch only: offers a PIN. Either choice marks onboarding done. */
export function OnboardingScreen() {
  const { colors, space, font } = useTheme();
  const insets = useSafeAreaInsets();
  const lock = useAppLock();
  const [settingPin, setSettingPin] = useState(false);

  const setAPin = () => {
    setSettingPin(true);
    lock.markOnboarded().catch((err: unknown) => console.warn("[Onboarding] could not save progress", err));
  };

  const notNow = () => {
    lock.finishOnboarding().catch((err: unknown) => console.warn("[Onboarding] could not save progress", err));
  };

  const savePin = async (pin: string) => {
    await lock.savePin(pin);
    await lock.finishOnboarding();
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        gap: space.xl,
        paddingTop: insets.top + space.xl,
        paddingBottom: insets.bottom + space.xl,
        paddingHorizontal: space.xl,
      }}
    >
      {settingPin ? (
        <PinSetup onSave={savePin} onCancel={() => setSettingPin(false)} cancelLabel="Back" />
      ) : (
        <>
          <View style={{ alignItems: "center", gap: space.md }}>
            <Ionicons name="lock-closed-outline" size={40} color={colors.accent} />
            <Text
              accessibilityRole="header"
              style={{ color: colors.text, fontSize: font.heading, fontWeight: "600", textAlign: "center" }}
            >
              Protect your journal?
            </Text>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: font.body,
                lineHeight: font.body * 1.5,
                textAlign: "center",
              }}
            >
              {ONBOARDING_COPY}
            </Text>
          </View>
          <View style={{ gap: space.sm }}>
            <CalmButton label="Set a PIN" onPress={setAPin} />
            <CalmButton label="Not now" variant="quiet" onPress={notNow} />
          </View>
          <Text style={{ color: colors.textMuted, fontSize: font.small, textAlign: "center" }}>
            You can change this any time in Settings.
          </Text>
        </>
      )}
    </ScrollView>
  );
}
