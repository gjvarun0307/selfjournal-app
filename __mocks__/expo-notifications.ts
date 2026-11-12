// Native-free stand-in so importing the journal plugin never touches expo-notifications in tests.
export const SchedulableTriggerInputTypes = { DAILY: "daily" };
export const AndroidImportance = { DEFAULT: 3 };
export const setNotificationHandler = jest.fn();
export const setNotificationChannelAsync = jest.fn().mockResolvedValue(null);
export const getPermissionsAsync = jest.fn().mockResolvedValue({ status: "undetermined" });
export const requestPermissionsAsync = jest.fn().mockResolvedValue({ status: "granted" });
export const scheduleNotificationAsync = jest.fn().mockResolvedValue("id");
export const cancelScheduledNotificationAsync = jest.fn().mockResolvedValue(undefined);
