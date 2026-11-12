// A local factory replaces the root mock so each call's result is controllable here.
const mockOrder: string[] = [];
jest.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: { DAILY: "daily" },
  AndroidImportance: { DEFAULT: 3 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async (id: string) => {
    mockOrder.push(`channel:${id}`);
    return null;
  }),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(async () => {
    mockOrder.push("request");
    return { status: "granted", canAskAgain: true };
  }),
  scheduleNotificationAsync: jest.fn(async () => {
    mockOrder.push("schedule");
    return "id";
  }),
  cancelScheduledNotificationAsync: jest.fn(),
}));

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { expoNotifier, toState } from "./notifier";

const mocked = jest.mocked(Notifications);

beforeEach(() => {
  mockOrder.length = 0;
  // The jest-expo preset runs as iOS; the channel only exists on Android.
  jest.replaceProperty(Platform, "OS", "android");
});

describe("toState", () => {
  it("maps granted to granted", () => {
    expect(toState({ status: "granted", canAskAgain: true })).toBe("granted");
  });

  it("maps denied that can still ask (Android 13+ before the first ask) to undetermined", () => {
    expect(toState({ status: "denied", canAskAgain: true })).toBe("undetermined");
  });

  it("maps denied that can't ask again to denied", () => {
    expect(toState({ status: "denied", canAskAgain: false })).toBe("denied");
  });
});

describe("expoNotifier", () => {
  it("permission() uses canAskAgain", async () => {
    mocked.getPermissionsAsync.mockResolvedValueOnce({ status: "denied", canAskAgain: true } as never);
    expect(await expoNotifier.permission()).toBe("undetermined");
    mocked.getPermissionsAsync.mockResolvedValueOnce({ status: "denied", canAskAgain: false } as never);
    expect(await expoNotifier.permission()).toBe("denied");
  });

  it("creates the reminders channel before requesting", async () => {
    expect(await expoNotifier.request()).toBe("granted");
    expect(mockOrder).toEqual(["channel:reminders", "request"]);
  });

  it("creates the channel before scheduling a daily trigger on it", async () => {
    await expoNotifier.scheduleDaily("rid", 7, 45, { title: "T", body: "B" });
    expect(mockOrder).toEqual(["channel:reminders", "schedule"]);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: "rid",
      content: { title: "T", body: "B" },
      trigger: { type: "daily", hour: 7, minute: 45, channelId: "reminders" },
    });
  });
});
