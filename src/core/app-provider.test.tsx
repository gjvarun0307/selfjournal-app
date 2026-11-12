import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { PluginHost } from "@/core/plugins/host";
import { DbKeyError, EncryptionUnavailableError, MissingDbKeyError } from "@/core/security/db-key";
import { createTestServices } from "@/core/test-services";
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
    const core = createTestServices();
    const host = new PluginHost(ALL_PLUGINS, core, { onError: jest.fn() });
    await host.start();
    const services: AppServices = { host, bus: core.bus, settings: core.settings };

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
