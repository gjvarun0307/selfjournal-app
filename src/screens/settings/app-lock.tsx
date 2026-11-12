import * as LocalAuthentication from "expo-local-authentication";
import { useEffect, useState } from "react";
import { Alert, ScrollView, Switch, Text, View } from "react-native";

import { useAppLock } from "@/screens/lock";
import { PinSetup } from "@/screens/lock/pin-setup";
import { SettingsRow } from "@/screens/settings/settings-row";
import { useTheme } from "@/theme/use-theme";

async function biometricsAvailable(): Promise<boolean> {
  const [hardware, enrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return hardware && enrolled;
}

/** Set, change or remove the PIN, and turn fingerprint/face unlock on or off. */
export function AppLockSettingsScreen() {
  const { colors, space, radius, font } = useTheme();
  const lock = useAppLock();
  const { hasPin, biometricsEnabled } = lock.config;
  const [settingPin, setSettingPin] = useState(false);
  const [canUseBiometrics, setCanUseBiometrics] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    biometricsAvailable().then(
      (ok) => live && setCanUseBiometrics(ok),
      () => live && setCanUseBiometrics(false),
    );
    return () => {
      live = false;
    };
  }, []);

  const savePin = async (pin: string) => {
    const changing = hasPin;
    await lock.savePin(pin);
    setSettingPin(false);
    setNote(changing ? "Your new PIN is saved." : "Your PIN is saved. App lock is on.");
  };

  const confirmRemove = () => {
    Alert.alert("Remove your PIN?", "SelfJournal will open without asking for it. You can set a new one any time.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Remove",
        onPress: () => {
          lock.removePin().then(
            () => setNote("Your PIN is removed. App lock is off."),
            () => setNote("That couldn't be changed just now. Please try again."),
          );
        },
      },
    ]);
  };

  const toggleBiometrics = (on: boolean) => {
    lock.setBiometrics(on).catch(() => setNote("That couldn't be changed just now. Please try again."));
  };

  if (settingPin) {
    return (
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: space.xl }}
      >
        <PinSetup onSave={savePin} onCancel={() => setSettingPin(false)} />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: space.lg, gap: space.md }}
    >
      <Text style={{ color: colors.textMuted, fontSize: font.body, lineHeight: font.body * 1.5 }}>
        {hasPin
          ? "App lock is on. SelfJournal asks for your PIN when it opens, and when you come back after 30 seconds away."
          : "App lock is off. A PIN keeps your journal private if someone else picks up your phone."}
      </Text>
      {note ? (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.text, fontSize: font.body }}>
          {note}
        </Text>
      ) : null}
      {hasPin ? (
        <>
          <SettingsRow
            icon="keypad-outline"
            title="Change PIN"
            onPress={() => {
              setNote(null);
              setSettingPin(true);
            }}
          />
          <SettingsRow icon="lock-open-outline" title="Remove PIN" note="Turns app lock off" onPress={confirmRemove} />
          {canUseBiometrics ? (
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
                <Text style={{ color: colors.text, fontSize: font.body }}>Unlock with fingerprint or face</Text>
                <Text style={{ color: colors.textMuted, fontSize: font.small }}>Your PIN still works too</Text>
              </View>
              <Switch
                accessibilityLabel="Unlock with fingerprint or face"
                value={biometricsEnabled}
                onValueChange={toggleBiometrics}
                trackColor={{ false: colors.surfaceAlt, true: colors.accent }}
                thumbColor={colors.surface}
                ios_backgroundColor={colors.surfaceAlt}
              />
            </View>
          ) : null}
        </>
      ) : (
        <SettingsRow
          icon="keypad-outline"
          title="Set a PIN"
          note="4 to 8 digits"
          onPress={() => {
            setNote(null);
            setSettingPin(true);
          }}
        />
      )}
      {hasPin ? (
        <Text style={{ color: colors.textMuted, fontSize: font.small, lineHeight: font.small * 1.5 }}>
          Forgot your PIN? Tap “Forgot PIN?” on the lock screen and confirm with your phone’s own screen lock.
        </Text>
      ) : null}
    </ScrollView>
  );
}
