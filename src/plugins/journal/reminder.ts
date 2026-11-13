import type { AppSettings } from "@/core/settings/app-settings";

export const REMINDER_ID = "journal.daily-reminder";
// Generic on purpose: never names a habit or behaviour, never nags.
export const REMINDER_CONTENT = { title: "SelfJournal", body: "Time to check in." } as const;

export interface ReminderSettings {
  enabled: boolean;
  hour: number;
  minute: number;
}

export const DEFAULT_REMINDER: ReminderSettings = { enabled: true, hour: 20, minute: 0 };

export type PermissionState = "granted" | "denied" | "undetermined";

export interface Notifier {
  permission(): Promise<PermissionState>;
  request(): Promise<PermissionState>;
  scheduleDaily(id: string, hour: number, minute: number, content: { title: string; body: string }): Promise<void>;
  cancel(id: string): Promise<void>;
}

const ENABLED_KEY = "reminder.enabled";
const TIME_KEY = "reminder.time";
const ASKED_KEY = "reminder.asked";

const pad = (n: number) => String(n).padStart(2, "0");

function parseTime(value: string | null): { hour: number; minute: number } {
  const m = value === null ? null : /^(\d{2}):(\d{2})$/.exec(value);
  if (m) {
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    if (hour <= 23 && minute <= 59) return { hour, minute };
  }
  return { hour: DEFAULT_REMINDER.hour, minute: DEFAULT_REMINDER.minute };
}

export async function readReminder(settings: AppSettings): Promise<ReminderSettings> {
  const [enabled, time] = await Promise.all([settings.get(ENABLED_KEY), settings.get(TIME_KEY)]);
  return {
    enabled: enabled === null ? DEFAULT_REMINDER.enabled : enabled !== "0",
    ...parseTime(time),
  };
}

export async function writeReminder(settings: AppSettings, r: ReminderSettings): Promise<void> {
  await settings.setMany({ [ENABLED_KEY]: r.enabled ? "1" : "0", [TIME_KEY]: `${pad(r.hour)}:${pad(r.minute)}` });
}

export async function syncReminder(settings: AppSettings, n: Notifier): Promise<"scheduled" | "off" | "no-permission"> {
  const r = await readReminder(settings);
  if (!r.enabled) {
    await n.cancel(REMINDER_ID);
    return "off";
  }
  if ((await n.permission()) !== "granted") return "no-permission";
  await n.scheduleDaily(REMINDER_ID, r.hour, r.minute, REMINDER_CONTENT);
  return "scheduled";
}

/** Asks for notification permission once, ever, through the app-lock-aware prompt wrapper. */
export async function askOnce(
  settings: AppSettings,
  n: Notifier,
  runPrompt: <T>(p: () => Promise<T>) => Promise<T>,
): Promise<void> {
  if ((await settings.get(ASKED_KEY)) !== null) return;
  if ((await n.permission()) !== "undetermined") return;
  await settings.set(ASKED_KEY, "1");
  await runPrompt(() => n.request());
  await syncReminder(settings, n);
}
