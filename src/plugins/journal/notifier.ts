import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import type { Notifier, PermissionState } from "./reminder";

const CHANNEL_ID = "reminders";

// Nothing pops up while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Reminders",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export function toState(r: { status: string; canAskAgain: boolean }): PermissionState {
  if (r.status === "granted") return "granted";
  // Android 13+ reports "denied" before the first ask; canAskAgain tells the cases apart.
  return r.canAskAgain ? "undetermined" : "denied";
}

export const expoNotifier: Notifier = {
  async permission() {
    return toState(await Notifications.getPermissionsAsync());
  },
  async request() {
    await ensureChannel();
    return toState(await Notifications.requestPermissionsAsync());
  },
  async scheduleDaily(id, hour, minute, content) {
    await ensureChannel();
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: { title: content.title, body: content.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: CHANNEL_ID },
    });
  },
  async cancel(id) {
    await Notifications.cancelScheduledNotificationAsync(id);
  },
};
