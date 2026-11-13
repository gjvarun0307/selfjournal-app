import { Host, TimePickerDialog } from "@expo/ui/jetpack-compose";
import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Pressable, ScrollView, Switch, Text, View } from "react-native";

import { usePluginContext } from "@/core/app-provider";
import { useAppLock } from "@/screens/lock";
import { useTheme } from "@/theme/use-theme";
import { expoNotifier } from "../notifier";
import {
  DEFAULT_REMINDER,
  readReminder,
  syncReminder,
  writeReminder,
  type Notifier,
  type PermissionState,
  type ReminderSettings,
} from "../reminder";

export const DENIED_NOTE = "Notifications are turned off for SelfJournal in your phone's settings.";

function uses24Hour(): boolean | undefined {
  try {
    const o = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions();
    if (o.hourCycle) return o.hourCycle === "h23" || o.hourCycle === "h24";
    return o.hour12 === undefined ? undefined : !o.hour12;
  } catch {
    return undefined;
  }
}

function atTime(hour: number, minute: number): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

export function ReminderSettingsScreen({ notifier = expoNotifier }: { notifier?: Notifier }) {
  const { colors, space, radius, font } = useTheme();
  const { settings } = usePluginContext("journal");
  const { locked, withSystemPrompt } = useAppLock();
  const [reminder, setReminder] = useState<ReminderSettings>(DEFAULT_REMINDER);
  const [permission, setPermission] = useState<PermissionState>("undetermined");
  const [pickingTime, setPickingTime] = useState(false);

  const refreshPermission = useCallback(
    () => notifier.permission().then(setPermission, () => undefined),
    [notifier],
  );

  useEffect(() => {
    let live = true;
    readReminder(settings).then((r) => live && setReminder(r), () => undefined);
    refreshPermission();
    return () => {
      live = false;
    };
  }, [settings, refreshPermission]);

  // Back from the phone's settings: the permission may have changed, and a newly granted one should schedule.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      (async () => {
        const p = await notifier.permission();
        setPermission(p);
        if (p === "granted" && (await readReminder(settings)).enabled) await syncReminder(settings, notifier);
      })().catch((e) => console.warn("Could not refresh the daily reminder", e));
    });
    return () => sub.remove();
  }, [notifier, settings]);

  // The dialog is its own window above the lock overlay, so it must go when the app locks.
  useEffect(() => {
    if (locked) setPickingTime(false);
  }, [locked]);

  const change = async (next: ReminderSettings) => {
    setReminder(next);
    try {
      await writeReminder(settings, next);
      if (next.enabled && (await notifier.permission()) === "undetermined") {
        await withSystemPrompt(() => notifier.request());
      }
      await syncReminder(settings, notifier);
    } catch (e) {
      console.warn("Could not update the daily reminder", e);
    }
    await refreshPermission();
  };

  const allow = async () => {
    try {
      await withSystemPrompt(() => notifier.request());
      await syncReminder(settings, notifier);
    } catch (e) {
      console.warn("Could not update the daily reminder", e);
    }
    await refreshPermission();
  };

  const timeLabel = atTime(reminder.hour, reminder.minute).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  const row = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.lg, gap: space.md }}
    >
      <View style={row}>
        <Text style={{ flex: 1, color: colors.text, fontSize: font.body, fontWeight: "600" }}>
          Daily journal reminder
        </Text>
        <Switch
          accessibilityLabel="Daily journal reminder"
          value={reminder.enabled}
          onValueChange={(enabled) => void change({ ...reminder, enabled })}
          trackColor={{ false: colors.surfaceAlt, true: colors.accent }}
          thumbColor={colors.surface}
          ios_backgroundColor={colors.surfaceAlt}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Time, ${timeLabel}`}
        onPress={() => setPickingTime(true)}
        style={row}
      >
        <Text style={{ flex: 1, color: colors.text, fontSize: font.body, fontWeight: "600" }}>Time</Text>
        <Text style={{ color: colors.textMuted, fontSize: font.body }}>{timeLabel}</Text>
      </Pressable>

      {permission === "denied" ? (
        <View style={{ gap: space.md, padding: space.lg }}>
          <Text style={{ color: colors.textMuted, fontSize: font.small }}>{DENIED_NOTE}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open phone settings"
            onPress={() => void Linking.openSettings()}
            style={{
              alignSelf: "flex-start",
              paddingHorizontal: space.lg,
              paddingVertical: space.sm,
              borderRadius: radius.pill,
              backgroundColor: colors.surfaceAlt,
            }}
          >
            <Text style={{ color: colors.text, fontSize: font.small }}>Open phone settings</Text>
          </Pressable>
        </View>
      ) : null}

      {permission === "undetermined" && reminder.enabled ? (
        <View style={{ padding: space.lg }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Allow notifications"
            onPress={() => void allow()}
            style={{
              alignSelf: "flex-start",
              paddingHorizontal: space.lg,
              paddingVertical: space.sm,
              borderRadius: radius.pill,
              backgroundColor: colors.surfaceAlt,
            }}
          >
            <Text style={{ color: colors.text, fontSize: font.small }}>Allow notifications</Text>
          </Pressable>
        </View>
      ) : null}

      {pickingTime && !locked ? (
        <Host matchContents>
          <TimePickerDialog
            initialDate={atTime(reminder.hour, reminder.minute).toISOString()}
            is24Hour={uses24Hour()}
            onDateSelected={(d) => {
              setPickingTime(false);
              void change({ ...reminder, hour: d.getHours(), minute: d.getMinutes() });
            }}
            onDismissRequest={() => setPickingTime(false)}
          />
        </Host>
      ) : null}
    </ScrollView>
  );
}
