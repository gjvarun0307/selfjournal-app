import { PluginHost } from "@/core/plugins/host";
import { createTestServices } from "@/core/test-services";
import { ALL_PLUGINS } from "@/plugins";
import { expoNotifier } from "./notifier";
import {
  askOnce,
  readReminder,
  REMINDER_CONTENT,
  REMINDER_ID,
  syncReminder,
  writeReminder,
  type Notifier,
  type PermissionState,
} from "./reminder";

jest.mock("./notifier", () => ({
  expoNotifier: {
    permission: jest.fn().mockResolvedValue("granted"),
    request: jest.fn().mockResolvedValue("granted"),
    scheduleDaily: jest.fn().mockResolvedValue(undefined),
    cancel: jest.fn().mockResolvedValue(undefined),
  },
}));

function fakeNotifier(initial: PermissionState, afterRequest: PermissionState = "granted") {
  let state = initial;
  const calls: string[] = [];
  const scheduled: { id: string; hour: number; minute: number; content: { title: string; body: string } }[] = [];
  const n: Notifier = {
    permission: async () => state,
    request: async () => {
      calls.push("request");
      state = afterRequest;
      return state;
    },
    scheduleDaily: async (id, hour, minute, content) => {
      calls.push("schedule");
      scheduled.push({ id, hour, minute, content });
    },
    cancel: async (id) => {
      calls.push(`cancel:${id}`);
    },
  };
  return { n, calls, scheduled };
}

async function freshSettings() {
  const host = new PluginHost(ALL_PLUGINS, createTestServices(), { onError: jest.fn() });
  await host.start();
  return host.contextFor("journal").settings;
}

describe("reminder", () => {
  it("schedules the default 20:00 reminder with the generic copy", async () => {
    const settings = await freshSettings();
    const { n, scheduled } = fakeNotifier("granted");
    expect(await syncReminder(settings, n)).toBe("scheduled");
    expect(scheduled).toEqual([{ id: REMINDER_ID, hour: 20, minute: 0, content: REMINDER_CONTENT }]);
    expect(REMINDER_CONTENT).toEqual({ title: "SelfJournal", body: "Time to check in." });
  });

  it("cancels when disabled", async () => {
    const settings = await freshSettings();
    await writeReminder(settings, { enabled: false, hour: 8, minute: 30 });
    const { n, calls } = fakeNotifier("granted");
    expect(await syncReminder(settings, n)).toBe("off");
    expect(calls).toEqual([`cancel:${REMINDER_ID}`]);
    expect(await readReminder(settings)).toEqual({ enabled: false, hour: 8, minute: 30 });
  });

  it("schedules nothing without permission", async () => {
    const settings = await freshSettings();
    const { n, scheduled } = fakeNotifier("denied");
    expect(await syncReminder(settings, n)).toBe("no-permission");
    expect(scheduled).toEqual([]);
  });

  it("falls back to defaults for a bad stored time", async () => {
    const settings = await freshSettings();
    await settings.set("reminder.time", "07:5x");
    expect(await readReminder(settings)).toEqual({ enabled: true, hour: 20, minute: 0 });
    await settings.set("reminder.time", "25:00");
    expect((await readReminder(settings)).hour).toBe(20);
  });

  it("askOnce requests only when undetermined and not asked before, then syncs", async () => {
    const settings = await freshSettings();
    const { n, calls, scheduled } = fakeNotifier("undetermined");
    const runPrompt = jest.fn();
    runPrompt.mockImplementation((p: () => Promise<unknown>) => p());
    await askOnce(settings, n, runPrompt as never);
    expect(runPrompt).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["request", "schedule"]);
    expect(scheduled).toHaveLength(1);
  });

  it("askOnce never asks twice, even when permission stays undetermined", async () => {
    const settings = await freshSettings();
    // Still "undetermined" after the request (e.g. the prompt was dismissed), so only the asked key stops a second ask.
    const { n, calls } = fakeNotifier("undetermined", "undetermined");
    const runPrompt = jest.fn();
    runPrompt.mockImplementation((p: () => Promise<unknown>) => p());
    await askOnce(settings, n, runPrompt as never);
    await askOnce(settings, n, runPrompt as never);
    expect(runPrompt).toHaveBeenCalledTimes(1);
    expect(calls.filter((c) => c === "request")).toHaveLength(1);
  });

  it("askOnce does not prompt when permission is already decided", async () => {
    const settings = await freshSettings();
    const { n, calls } = fakeNotifier("denied");
    const runPrompt = jest.fn();
    runPrompt.mockImplementation((p: () => Promise<unknown>) => p());
    await askOnce(settings, n, runPrompt as never);
    expect(runPrompt).not.toHaveBeenCalled();
    expect(calls).not.toContain("request");
  });

  it("disabling the journal plugin cancels the reminder", async () => {
    const mocked = jest.mocked(expoNotifier);
    mocked.cancel.mockClear();
    const host = new PluginHost(ALL_PLUGINS, createTestServices(), { onError: jest.fn() });
    await host.start();
    await host.setEnabled("journal", false);
    expect(mocked.cancel).toHaveBeenCalledWith(REMINDER_ID);
  });
});
