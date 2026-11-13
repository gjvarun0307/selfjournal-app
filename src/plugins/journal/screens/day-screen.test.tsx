import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { AppProvider, type AppServices } from "@/core/app-provider";
import { PluginHost } from "@/core/plugins/host";
import { createTestServices } from "@/core/test-services";
import { ALL_PLUGINS } from "@/plugins";
import { dayKey, shiftDay } from "../days";
import { getJournalService } from "../journal-service";
import { expoNotifier } from "../notifier";
import { EMPTY_DAY_COPY, JournalDayScreen } from "./day-screen";

let mockId = 0;
jest.mock("expo-crypto", () => ({ randomUUID: () => `entry-${++mockId}` }));

let mockLocked = false;
jest.mock("@/screens/lock", () => ({
  useAppLock: () => ({ locked: mockLocked, withSystemPrompt: <T,>(p: () => Promise<T>) => p() }),
}));

jest.mock("../notifier", () => ({
  expoNotifier: {
    permission: jest.fn().mockResolvedValue("undetermined"),
    request: jest.fn().mockResolvedValue("granted"),
    scheduleDaily: jest.fn().mockResolvedValue(undefined),
    cancel: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  return {
    router: { push: (...args: unknown[]) => mockPush(...args) },
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

const today = () => dayKey(new Date());

async function setup() {
  const core = createTestServices();
  const host = new PluginHost(ALL_PLUGINS, core, { onError: jest.fn() });
  await host.start();
  const services: AppServices = { host, bus: core.bus, settings: core.settings, media: core.media };
  const journal = getJournalService(host.contextFor("journal"), (id) => host.entryType(id));
  const boot = () => Promise.resolve(services);
  const tree = () => (
    <AppProvider boot={boot}>
      <JournalDayScreen />
    </AppProvider>
  );
  const view = () => render(tree());
  return { core, host, journal, view, tree };
}

beforeEach(() => {
  mockPush.mockClear();
  mockLocked = false;
});

describe("JournalDayScreen", () => {
  it("shows today's cards in order, steps back a day, and disables next on today", async () => {
    const { journal, view } = await setup();
    await journal.create({ day: today(), typeId: "journal.day", fields: { text: "First thoughts" }, photoIds: [] });
    await journal.create({ day: today(), typeId: "journal.day", fields: { text: "Second thoughts" }, photoIds: [] });
    await journal.create({ day: shiftDay(today(), -1), typeId: "journal.day", fields: { text: "Old thoughts" }, photoIds: [] });
    await view();

    expect(await screen.findByText("First thoughts")).toBeTruthy();
    const texts = screen.getAllByText(/thoughts/).map((n) => n.props.children);
    expect(texts).toEqual(["First thoughts", "Second thoughts"]);
    expect(screen.getByLabelText("Next day").props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.queryByLabelText("Today")).toBeNull();

    await fireEvent.press(screen.getByLabelText("Previous day"));
    expect(await screen.findByText("Old thoughts")).toBeTruthy();
    expect(screen.queryByText("First thoughts")).toBeNull();
    expect(screen.getByText("Yesterday")).toBeTruthy();
    expect(screen.getByLabelText("Next day").props.accessibilityState).toMatchObject({ disabled: false });

    await fireEvent.press(screen.getByLabelText("Today"));
    expect(await screen.findByText("First thoughts")).toBeTruthy();
  });

  it("asks about the daily reminder once on mount", async () => {
    const { view } = await setup();
    jest.mocked(expoNotifier.request).mockClear();
    await view();
    await screen.findByText(EMPTY_DAY_COPY);
    await act(async () => undefined);
    expect(expoNotifier.request).toHaveBeenCalledTimes(1);
  });

  it("doesn't ask about the reminder while locked, then asks once after unlock", async () => {
    const { view, tree } = await setup();
    jest.mocked(expoNotifier.request).mockClear();
    mockLocked = true;
    await view();
    await screen.findByText(EMPTY_DAY_COPY);
    await act(async () => undefined);
    expect(expoNotifier.request).not.toHaveBeenCalled();

    mockLocked = false;
    await screen.rerender(tree());
    await act(async () => undefined);
    expect(expoNotifier.request).toHaveBeenCalledTimes(1);

    await screen.rerender(tree());
    await act(async () => undefined);
    expect(expoNotifier.request).toHaveBeenCalledTimes(1);
  });

  it("renders an entry of an unknown type as a plain 'Entry' card", async () => {
    const { core, view } = await setup();
    await core.db.run(
      "INSERT INTO journal_entries (id, day, type_id, fields, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ["e1", today(), "gone.type", JSON.stringify({ note: "Kept words" }), 1, 1],
    );
    await view();

    expect(await screen.findByText("Kept words")).toBeTruthy();
    expect(screen.getByText("Entry")).toBeTruthy();
  });

  it("shows the calm placeholder and the title when a photo is missing", async () => {
    const { journal, core, view } = await setup();
    const entry = await journal.create({ day: today(), typeId: "journal.game", fields: { game: "Hades" }, photoIds: [] });
    await core.db.run("INSERT INTO journal_entry_photos (entry_id, media_id, position) VALUES (?, 'no-such', 0)", [entry.id]);
    await view();

    expect(await screen.findByText("Hades")).toBeTruthy();
    expect(await screen.findByLabelText("This photo can't be shown right now")).toBeTruthy();
  });

  it("shows kind copy on an empty day", async () => {
    const { view } = await setup();
    await view();
    expect(await screen.findByText("Nothing here yet. Add whatever's on your mind.")).toBeTruthy();
  });

  it("Add entry opens the new-entry route for the shown day", async () => {
    const { view } = await setup();
    await view();
    await screen.findByText("Nothing here yet. Add whatever's on your mind.");

    await fireEvent.press(screen.getByLabelText("Add entry"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/journal/new", params: { day: today() } });

    await fireEvent.press(screen.getByLabelText("Previous day"));
    await fireEvent.press(screen.getByLabelText("Add entry"));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: "/journal/new", params: { day: shiftDay(today(), -1) } });
  });

  it("opens the detail route when a card is pressed", async () => {
    const { journal, view } = await setup();
    const e = await journal.create({ day: today(), typeId: "journal.day", fields: { text: "Tap me" }, photoIds: [] });
    await view();
    await fireEvent.press(await screen.findByText("Tap me"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/journal/[id]", params: { id: e.id } });
  });

  it("reloads when an entry is created", async () => {
    const { journal, view } = await setup();
    await view();
    await screen.findByText("Nothing here yet. Add whatever's on your mind.");
    await act(async () => {
      await journal.create({ day: today(), typeId: "journal.day", fields: { text: "Fresh" }, photoIds: [] });
    });
    expect(await screen.findByText("Fresh")).toBeTruthy();
  });
});
