import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { createTestDb } from "@/core/db/test-db";
import { EventBus } from "@/core/events/bus";
import { PluginHost } from "@/core/plugins/host";
import { DbKeyError, EncryptionUnavailableError, MissingDbKeyError } from "@/core/security/db-key";
import { createAppSettings } from "@/core/settings/app-settings";
import { ALL_PLUGINS } from "@/plugins";
import {
  AppProvider,
  BOOT_FAILED_MESSAGE,
  ENCRYPTION_UNAVAILABLE_MESSAGE,
  UNLOCK_FAILED_MESSAGE,
  useEnabledPlugins,
  useHost,
  type AppServices,
} from "./app-provider";

function EnabledList() {
  return <Text>{useEnabledPlugins().join(",")}</Text>;
}

describe("AppProvider", () => {
  it("renders children with services once booted", async () => {
    const db = createTestDb();
    const bus = new EventBus({ onError: jest.fn() });
    const settings = createAppSettings(db);
    const host = new PluginHost(ALL_PLUGINS, { db, bus, settings }, { onError: jest.fn() });
    await host.start();
    const services: AppServices = { host, bus, settings };

    await render(
      <AppProvider boot={() => Promise.resolve(services)}>
        <EnabledList />
      </AppProvider>,
    );

    expect(await screen.findByText("journal,habits,recovery,gamification,lifestats")).toBeTruthy();
  });

  it.each([
    [new MissingDbKeyError(), UNLOCK_FAILED_MESSAGE],
    [new DbKeyError(), UNLOCK_FAILED_MESSAGE],
    [new EncryptionUnavailableError(), ENCRYPTION_UNAVAILABLE_MESSAGE],
    [new Error("disk on fire"), BOOT_FAILED_MESSAGE],
  ])("shows a calm message with no buttons when boot fails with %s", async (error, message) => {
    await render(
      <AppProvider boot={() => Promise.reject(error)}>
        <Text>app</Text>
      </AppProvider>,
    );

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText("app")).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("hooks throw a clear error outside the provider", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    function Orphan() {
      useHost();
      return null;
    }
    await expect(render(<Orphan />)).rejects.toThrow("useHost() must be used inside <AppProvider>");
    spy.mockRestore();
  });
});
