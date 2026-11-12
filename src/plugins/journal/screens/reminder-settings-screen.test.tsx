import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

import { AppProvider, type AppServices } from "@/core/app-provider";
import { PluginHost } from "@/core/plugins/host";
import { createTestServices } from "@/core/test-services";
import { ALL_PLUGINS } from "@/plugins";
import type { Notifier, PermissionState } from "../reminder";
import { DENIED_NOTE, ReminderSettingsScreen } from "./reminder-settings-screen";

let mockLocked = false;
jest.mock("@/screens/lock", () => ({
  useAppLock: () => ({ locked: mockLocked, withSystemPrompt: <T,>(p: () => Promise<T>) => p() }),
}));

jest.mock("@expo/ui/jetpack-compose", () => {
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Host: ({ children }: { children: React.ReactNode }) => children,
    TimePickerDialog: () => <Text>time-dialog</Text>,
  };
});

function fakeNotifier(state: PermissionState): Notifier {
  return {
    permission: async () => state,
    request: async () => state,
    scheduleDaily: jest.fn().mockResolvedValue(undefined),
    cancel: jest.fn().mockResolvedValue(undefined),
  };
}

async function setup(state: PermissionState = "granted") {
  const core = createTestServices();
  const host = new PluginHost(ALL_PLUGINS, core, { onError: jest.fn() });
  await host.start();
  const services: AppServices = { host, bus: core.bus, settings: core.settings, media: core.media };
  const notifier = fakeNotifier(state);
  const ui = () => (
    <AppProvider boot={() => Promise.resolve(services)}>
      <ReminderSettingsScreen notifier={notifier} />
    </AppProvider>
  );
  return { core, notifier, ui };
}

beforeEach(() => {
  mockLocked = false;
});

describe("ReminderSettingsScreen", () => {
  it("persists the switch and cancels the reminder", async () => {
    const { core, notifier, ui } = await setup();
    await render(ui());
    const toggle = await screen.findByLabelText("Daily journal reminder");
    await fireEvent(toggle, "valueChange", false);
    await act(async () => undefined);
    expect(await core.settings.get("plugin.journal.reminder.enabled")).toBe("0");
    expect(notifier.cancel).toHaveBeenCalledWith("journal.daily-reminder");
  });

  it("closes the time dialog when the app locks", async () => {
    const { ui } = await setup();
    const view = await render(ui());
    await fireEvent.press(await screen.findByLabelText("Time"));
    expect(screen.getByText("time-dialog")).toBeTruthy();
    mockLocked = true;
    await view.rerender(ui());
    expect(screen.queryByText("time-dialog")).toBeNull();
  });

  it("explains denied permission and opens phone settings", async () => {
    const open = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    const { ui } = await setup("denied");
    await render(ui());
    expect(await screen.findByText(DENIED_NOTE)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Open phone settings"));
    expect(open).toHaveBeenCalled();
  });
});
