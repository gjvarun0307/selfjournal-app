import { fireEvent, render, screen } from "@testing-library/react-native";

import { createTestDb } from "@/core/db/test-db";
import { EventBus } from "@/core/events/bus";
import { PluginHost } from "@/core/plugins/host";
import { createAppSettings } from "@/core/settings/app-settings";
import { ALL_PLUGINS } from "@/plugins";
import { PluginsScreen } from "./plugins";

async function startedHost() {
  const db = createTestDb();
  const onError = jest.fn();
  const host = new PluginHost(
    ALL_PLUGINS,
    { db, bus: new EventBus({ onError: jest.fn() }), settings: createAppSettings(db) },
    { onError },
  );
  await host.start();
  return { db, host, onError };
}

describe("PluginsScreen", () => {
  it("lists every plugin with a switch", async () => {
    const { host, onError } = await startedHost();
    await render(<PluginsScreen host={host} />);

    for (const p of ALL_PLUGINS) {
      expect(screen.getByText(p.name)).toBeTruthy();
      expect(screen.getByText(p.description)).toBeTruthy();
      expect(screen.getByRole("switch", { name: p.name }).props.value).toBe(true);
    }
    expect(screen.getAllByRole("switch")).toHaveLength(ALL_PLUGINS.length);
    expect(onError).not.toHaveBeenCalled();
  });

  it("toggling a switch disables the plugin and persists it", async () => {
    const { db, host, onError } = await startedHost();
    await render(<PluginsScreen host={host} />);

    await fireEvent(screen.getByRole("switch", { name: "Habits" }), "valueChange", false);

    expect(host.isEnabled("habits")).toBe(false);
    expect(await db.first("SELECT enabled FROM plugin_state WHERE id = 'habits'")).toEqual({ enabled: 0 });
    expect(screen.getByRole("switch", { name: "Habits" }).props.value).toBe(false);
    expect(screen.getByRole("switch", { name: "Journal" }).props.value).toBe(true);
    expect(screen.getByText("Turning a plugin off hides it. Your data stays.")).toBeTruthy();
    expect(onError).not.toHaveBeenCalled();
  });
});
