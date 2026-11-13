import { render, screen } from "@testing-library/react-native";

import { AppProvider, type AppServices } from "@/core/app-provider";
import { CORE_MIGRATIONS } from "@/core/db/core-migrations";
import { runMigrations } from "@/core/db/migrations";
import { PluginHost } from "@/core/plugins/host";
import { createTestServices } from "@/core/test-services";
import { MediaImage } from "./media-image";

const MISSING_LABEL = "This photo can't be shown right now";

async function services(): Promise<AppServices> {
  const core = createTestServices();
  await runMigrations(core.db, CORE_MIGRATIONS);
  return { host: new PluginHost([], core), bus: core.bus, settings: core.settings, media: core.media };
}

describe("MediaImage", () => {
  it("a missing id renders the calm placeholder", async () => {
    const s = await services();
    await render(
      <AppProvider boot={() => Promise.resolve(s)}>
        <MediaImage id="no-such-id" size="thumb" />
      </AppProvider>,
    );

    expect(await screen.findByLabelText(MISSING_LABEL)).toBeTruthy();
  });

  it("a stored photo renders as an image, not the placeholder", async () => {
    const s = await services();
    const rec = await s.media.importImage("file:///cache/a.jpg");
    await render(
      <AppProvider boot={() => Promise.resolve(s)}>
        <MediaImage id={rec.id} size="full" />
      </AppProvider>,
    );

    expect(await screen.findByTestId("media-image")).toBeTruthy();
    expect(screen.queryByLabelText(MISSING_LABEL)).toBeNull();
  });
});
