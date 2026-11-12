import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AppState, Linking, type AppStateStatus } from "react-native";

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

function fakeNotifier(initial: PermissionState, afterRequest: PermissionState = initial) {
  const n = {
    state: initial,
    permission: jest.fn(async (): Promise<PermissionState> => n.state),
    request: jest.fn(async (): Promise<PermissionState> => {
      n.state = afterRequest;
      return n.state;
    }),
    scheduleDaily: jest.fn().mockResolvedValue(undefined),
    cancel: jest.fn().mockResolvedValue(undefined),
  } satisfies Notifier & { state: PermissionState };
  return n;
}

async function setup(state: PermissionState = "granted", afterRequest: PermissionState = state) {
  const core = createTestServices();
  const host = new PluginHost(ALL_PLUGINS, core, { onError: jest.fn() });
  await host.start();
  const services: AppServices = { host, bus: core.bus, settings: core.settings, media: core.media };
  const notifier = fakeNotifier(state, afterRequest);
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
    await fireEvent.press(await screen.findByLabelText(/^Time, /));
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

  it("labels the time row with the chosen time", async () => {
    const { ui } = await setup();
    await render(ui());
    const timeRow = await screen.findByLabelText(/^Time, /);
    expect(timeRow.props.accessibilityLabel).toMatch(/^Time, (20:00|0?8:00\s?PM)$/i);
  });

  it("rechecks permission on return to the app and schedules once it's granted", async () => {
    let listener: ((s: AppStateStatus) => void) | undefined;
    const remove = jest.fn();
    // Once only: the preset's AppState.addEventListener is itself a mock, which mockRestore would blank.
    jest.spyOn(AppState, "addEventListener").mockImplementationOnce((_type, l) => {
      listener = l as (s: AppStateStatus) => void;
      return { remove };
    });
    const { notifier, ui } = await setup("denied");
    const view = await render(ui());
    expect(await screen.findByText(DENIED_NOTE)).toBeTruthy();
    expect(notifier.scheduleDaily).not.toHaveBeenCalled();

    notifier.state = "granted";
    await act(async () => listener?.("active"));
    expect(notifier.scheduleDaily).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(DENIED_NOTE)).toBeNull();

    await view.unmount();
    expect(remove).toHaveBeenCalled();
  });

  it("offers to allow notifications while undetermined, then schedules", async () => {
    const { notifier, ui } = await setup("undetermined", "granted");
    await render(ui());
    await fireEvent.press(await screen.findByLabelText("Allow notifications"));
    await act(async () => undefined);
    expect(notifier.request).toHaveBeenCalledTimes(1);
    expect(notifier.scheduleDaily).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Allow notifications")).toBeNull();
  });
});
