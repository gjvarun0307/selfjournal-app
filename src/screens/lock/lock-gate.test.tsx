import { act, fireEvent, render, screen } from "@testing-library/react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { AppState, Text, type AppStateStatus } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppProvider, type AppServices } from "@/core/app-provider";
import { CORE_MIGRATIONS } from "@/core/db/core-migrations";
import { runMigrations } from "@/core/db/migrations";
import { createTestDb } from "@/core/db/test-db";
import { EventBus } from "@/core/events/bus";
import { PluginHost } from "@/core/plugins/host";
import { createAppLockStore, type AppLockStore } from "@/core/security/app-lock-store";
import { createAppSettings } from "@/core/settings/app-settings";
import { ALL_PLUGINS } from "@/plugins";
import { LockGate, NO_DEVICE_CREDENTIAL_MESSAGE, WRONG_PIN_MESSAGE } from "./index";

jest.mock("expo-local-authentication", () => ({
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  getEnrolledLevelAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}));
const mockedAuth = jest.mocked(LocalAuthentication);

const SALT = "0123456789abcdef0123456789abcdef";
const METRICS = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function setup({ pin }: { pin?: string } = {}) {
  const db = createTestDb();
  await runMigrations(db, CORE_MIGRATIONS);
  const settings = createAppSettings(db);
  const store = createAppLockStore(settings);
  if (pin) await store.setPin(pin, SALT);
  await store.markOnboarded();
  const bus = new EventBus({ onError: jest.fn() });
  const host = new PluginHost(ALL_PLUGINS, { db, bus, settings }, { onError: jest.fn() });
  const services: AppServices = { host, bus, settings };
  return { services, store };
}

let appStateListener: ((state: AppStateStatus) => void) | null = null;

beforeEach(() => {
  appStateListener = null;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    appStateListener = listener as (state: AppStateStatus) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  mockedAuth.getEnrolledLevelAsync.mockReset();
  mockedAuth.authenticateAsync.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function renderGate(services: AppServices, store: AppLockStore, onPinReset = jest.fn()) {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <AppProvider boot={() => Promise.resolve(services)}>
        <LockGate store={store} onPinReset={onPinReset}>
          <Text>app content</Text>
        </LockGate>
      </AppProvider>
    </SafeAreaProvider>,
  );
  return { onPinReset };
}

/** Types a PIN and presses Unlock, waiting (inside act) for the PIN check to settle. */
async function typePin(store: AppLockStore, pin: string) {
  for (const digit of pin) await fireEvent.press(screen.getByRole("button", { name: digit }));
  const check = jest.spyOn(store, "checkPin");
  await act(async () => {
    await fireEvent.press(screen.getByRole("button", { name: "Unlock" }));
    await check.mock.results.at(-1)?.value;
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  check.mockRestore();
}

async function moveApp(state: AppStateStatus, at: number) {
  jest.spyOn(Date, "now").mockReturnValue(at);
  await act(async () => appStateListener?.(state));
}

describe("LockGate", () => {
  it("shows the app directly when no PIN is set", async () => {
    const { services, store } = await setup();
    await renderGate(services, store);

    expect(await screen.findByText("app content")).toBeTruthy();
    expect(screen.queryByText("Welcome back")).toBeNull();
  });

  it("covers the app on cold start, answers a wrong PIN softly, and unlocks with the right one", async () => {
    const { services, store } = await setup({ pin: "2468" });
    await renderGate(services, store);

    expect(await screen.findByText("Welcome back")).toBeTruthy();
    // The app is mounted underneath but hidden from screen readers and touch.
    expect(screen.queryByText("app content")).toBeNull();

    await typePin(store, "1357");
    expect(await screen.findByText(WRONG_PIN_MESSAGE)).toBeTruthy();
    expect(screen.queryByText(/attempt/i)).toBeNull();
    expect(screen.getByText("Welcome back")).toBeTruthy();

    await typePin(store, "2468");
    expect(await screen.findByText("app content")).toBeTruthy();
    expect(screen.queryByText("Welcome back")).toBeNull();
  });

  it("locks again only after 30 seconds in the background", async () => {
    const { services, store } = await setup({ pin: "2468" });
    await renderGate(services, store);
    await screen.findByText("Welcome back");
    await typePin(store, "2468");
    await screen.findByText("app content");

    await moveApp("background", 1_000);
    await moveApp("active", 1_000 + 29_999);
    expect(screen.getByText("app content")).toBeTruthy();
    expect(screen.queryByText("Welcome back")).toBeNull();

    await moveApp("background", 100_000);
    await moveApp("active", 100_000 + 30_000);
    expect(screen.getByText("Welcome back")).toBeTruthy();
    expect(screen.queryByText("app content")).toBeNull();
  });

  it("Forgot PIN? confirms the phone's own credential, clears the PIN and opens App lock settings", async () => {
    const { services, store } = await setup({ pin: "2468" });
    mockedAuth.getEnrolledLevelAsync.mockResolvedValue(LocalAuthentication.SecurityLevel.SECRET);
    mockedAuth.authenticateAsync.mockResolvedValue({ success: true });
    const { onPinReset } = await renderGate(services, store);
    await screen.findByText("Welcome back");

    await fireEvent.press(screen.getByRole("button", { name: "Forgot PIN?" }));

    expect(mockedAuth.authenticateAsync).toHaveBeenCalledWith({
      disableDeviceFallback: false,
      promptMessage: "Confirm it's you",
    });
    expect(await screen.findByText("app content")).toBeTruthy();
    expect(onPinReset).toHaveBeenCalledTimes(1);
    expect(await store.getConfig()).toEqual({ lockEnabled: false, biometricsEnabled: false, hasPin: false });
  });

  it("Forgot PIN? explains calmly when the phone has no screen lock", async () => {
    const { services, store } = await setup({ pin: "2468" });
    mockedAuth.getEnrolledLevelAsync.mockResolvedValue(LocalAuthentication.SecurityLevel.NONE);
    const { onPinReset } = await renderGate(services, store);
    await screen.findByText("Welcome back");

    await fireEvent.press(screen.getByRole("button", { name: "Forgot PIN?" }));

    expect(await screen.findByText(NO_DEVICE_CREDENTIAL_MESSAGE)).toBeTruthy();
    expect(mockedAuth.authenticateAsync).not.toHaveBeenCalled();
    expect(onPinReset).not.toHaveBeenCalled();
    expect((await store.getConfig()).hasPin).toBe(true);
  });
});
