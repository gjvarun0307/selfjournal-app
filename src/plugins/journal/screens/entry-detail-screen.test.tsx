import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { AppProvider, type AppServices } from "@/core/app-provider";
import { PluginHost } from "@/core/plugins/host";
import { createTestServices } from "@/core/test-services";
import { ALL_PLUGINS } from "@/plugins";
import { dayKey } from "../days";
import { getJournalService } from "../journal-service";
import { ENTRY_MISSING_COPY, EntryDetailScreen } from "./entry-detail-screen";

let mockId = 0;
jest.mock("expo-crypto", () => ({ randomUUID: () => `entry-${++mockId}` }));

const mockRouter = { push: jest.fn(), back: jest.fn() };
const mockTitle = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...a: unknown[]) => mockRouter.push(...a), back: (...a: unknown[]) => mockRouter.back(...a) },
  Stack: { Screen: ({ options }: { options: { title: string } }) => (mockTitle(options.title), null) },
}));

const today = () => dayKey(new Date());

async function setup() {
  const core = createTestServices();
  const host = new PluginHost(ALL_PLUGINS, core, { onError: jest.fn() });
  await host.start();
  const services: AppServices = { host, bus: core.bus, settings: core.settings, media: core.media };
  const journal = getJournalService(host.contextFor("journal"), (id) => host.entryType(id));
  const view = (id: string) =>
    render(
      <AppProvider boot={() => Promise.resolve(services)}>
        <EntryDetailScreen id={id} />
      </AppProvider>,
    );
  return { core, journal, view };
}

beforeEach(() => {
  mockRouter.push.mockClear();
  mockRouter.back.mockReset();
  mockTitle.mockClear();
});

describe("EntryDetailScreen", () => {
  it("shows fields with labels, skips empty ones, and titles the screen by type", async () => {
    const { journal, view } = await setup();
    const e = await journal.create({
      day: today(),
      typeId: "journal.game",
      fields: { game: "Hades", hours: 2.5, rating: 4, remember: "" },
      photoIds: [],
    });
    await view(e.id);

    expect(await screen.findByText("Hades")).toBeTruthy();
    expect(screen.getByText("Game")).toBeTruthy();
    expect(screen.getByText("Hours played")).toBeTruthy();
    expect(screen.getByText("2.5")).toBeTruthy();
    expect(screen.getByLabelText("4 of 5 stars")).toBeTruthy();
    expect(screen.queryByText("What I want to remember")).toBeNull();
    expect(mockTitle).toHaveBeenLastCalledWith("Game cleared");
  });

  it("Edit opens the editor for this entry", async () => {
    const { journal, view } = await setup();
    const e = await journal.create({ day: today(), typeId: "journal.day", fields: { text: "Hi" }, photoIds: [] });
    await view(e.id);
    await screen.findByText("Hi");
    await fireEvent.press(screen.getByLabelText("Edit"));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: "/journal/edit", params: { id: e.id } });
  });

  it("Delete then confirm removes the entry and goes back", async () => {
    const { journal, view } = await setup();
    const e = await journal.create({ day: today(), typeId: "journal.day", fields: { text: "Bye" }, photoIds: [] });
    await view(e.id);
    await screen.findByText("Bye");
    await fireEvent.press(screen.getByLabelText("Delete"));
    expect(screen.getByText("Delete this entry? Its photos go too. This can't be undone.")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Delete"));
    expect(await journal.get(e.id)).toBeNull();
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it("never flashes the missing-entry copy while deleting", async () => {
    const { journal, view } = await setup();
    const e = await journal.create({ day: today(), typeId: "journal.day", fields: { text: "Gone soon" }, photoIds: [] });
    const seenAtBack: boolean[] = [];
    mockRouter.back.mockImplementation(() => seenAtBack.push(screen.queryByText(ENTRY_MISSING_COPY) !== null));
    await view(e.id);
    await screen.findByText("Gone soon");
    await fireEvent.press(screen.getByLabelText("Delete"));
    await fireEvent.press(screen.getByLabelText("Delete"));
    // Let the reload the delete triggers settle; the screen would still be up until navigation finishes.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(seenAtBack).toEqual([false]);
    expect(screen.queryByText(ENTRY_MISSING_COPY)).toBeNull();
  });

  it("Keep it leaves the entry", async () => {
    const { journal, view } = await setup();
    const e = await journal.create({ day: today(), typeId: "journal.day", fields: { text: "Stay" }, photoIds: [] });
    await view(e.id);
    await screen.findByText("Stay");
    await fireEvent.press(screen.getByLabelText("Delete"));
    await fireEvent.press(screen.getByLabelText("Keep it"));
    expect(await journal.get(e.id)).not.toBeNull();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Keep it")).toBeNull();
  });

  it("an unknown type has no Edit but can be deleted", async () => {
    const { core, journal, view } = await setup();
    await core.db.run(
      "INSERT INTO journal_entries (id, day, type_id, fields, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ["u1", today(), "gone.type", JSON.stringify({ note: "Kept words" }), 1, 1],
    );
    await view("u1");
    expect(await screen.findByText("Kept words")).toBeTruthy();
    expect(mockTitle).toHaveBeenLastCalledWith("Entry");
    expect(screen.queryByLabelText("Edit")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Delete"));
    await fireEvent.press(screen.getByLabelText("Delete"));
    expect(await journal.get("u1")).toBeNull();
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("shows kind copy when the entry doesn't exist", async () => {
    const { view } = await setup();
    await view("nope");
    expect(await screen.findByText("This entry isn't here any more.")).toBeTruthy();
  });
});
