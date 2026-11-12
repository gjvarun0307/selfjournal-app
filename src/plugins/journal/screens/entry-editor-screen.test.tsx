import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Modal, Text, View } from "react-native";

import { AppProvider, type AppServices } from "@/core/app-provider";
import { PluginHost } from "@/core/plugins/host";
import { createTestServices } from "@/core/test-services";
import { ALL_PLUGINS } from "@/plugins";
import { dayKey } from "../days";
import { getJournalService } from "../journal-service";
import { pickImages } from "../pick-images";
import { EntryEditorScreen, type EditorMode } from "./entry-editor-screen";
import { TypePickerScreen } from "./type-picker-screen";

let mockId = 0;
jest.mock("expo-crypto", () => ({ randomUUID: () => `entry-${++mockId}` }));

const mockRouter = { push: jest.fn(), back: jest.fn(), dismissTo: jest.fn() };
const mockDispatch = jest.fn();
const mockDisable = jest.fn();
type PreventCallback = (e: { data: { action: unknown } }) => void;
const mockPrevent: { enabled: boolean; callback?: PreventCallback } = { enabled: false };
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  return {
    router: {
      push: (...a: unknown[]) => mockRouter.push(...a),
      back: (...a: unknown[]) => mockRouter.back(...a),
      dismissTo: (...a: unknown[]) => mockRouter.dismissTo(...a),
    },
    useNavigation: () => ({ dispatch: (...a: unknown[]) => mockDispatch(...a) }),
    // Stands in for the navigator: records whether removal is blocked and the callback it would call.
    usePreventRemove: (enabled: boolean, callback?: PreventCallback) => {
      mockPrevent.enabled = enabled;
      mockPrevent.callback = callback;
      return mockDisable;
    },
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});
jest.mock("../pick-images", () => ({ pickImages: jest.fn() }));
const mockPick = pickImages as jest.MockedFunction<typeof pickImages>;

const BACK = { type: "GO_BACK" };
const day = () => dayKey(new Date());

/**
 * fireEvent.press resolves only when the handler's promise does. To look at the screen while a
 * handler is still running, start the press, then let its act() finish before starting another.
 */
const settle = () => new Promise((r) => setTimeout(r, 0));

/** What the navigator does on a back press: ask the screen if it is blocked, otherwise just go. */
async function attemptLeave() {
  await act(async () => {
    if (mockPrevent.enabled) mockPrevent.callback?.({ data: { action: BACK } });
    else mockDispatch(BACK);
  });
}

async function setup() {
  const core = createTestServices();
  const host = new PluginHost(ALL_PLUGINS, core, { onError: jest.fn() });
  await host.start();
  const services: AppServices = { host, bus: core.bus, settings: core.settings, media: core.media };
  const ctx = host.contextFor("journal");
  const journal = getJournalService(ctx, (id) => host.entryType(id));
  const boot = () => Promise.resolve(services);
  const wrap = (node: ReactNode) => <AppProvider boot={boot}>{node}</AppProvider>;
  const editor = (mode: EditorMode) => render(wrap(<EntryEditorScreen mode={mode} />));
  return { core, host, ctx, journal, wrap, editor };
}

const newGame = (): EditorMode => ({ kind: "new", day: day(), typeId: "journal.game" });

const isModal = (n: { type: unknown }) => n.type === "Modal" || n.type === "RCTModalHostView" || n.type === Modal;
/** Every Modal host node in the rendered tree, the root included. */
const modals = () => {
  const root = screen.root!;
  return [root, ...root.queryAll(() => true)].filter(isModal);
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrevent.enabled = false;
  mockPrevent.callback = undefined;
  mockDisable.mockImplementation(() => {
    mockPrevent.enabled = false;
  });
});

describe("EntryEditorScreen", () => {
  it("asks for the required field, then saves exactly one entry even when Save is pressed twice", async () => {
    const { journal, editor } = await setup();
    await editor(newGame());

    const save = await screen.findByLabelText("Save");
    expect(save.props.accessibilityState).toMatchObject({ disabled: true });

    await fireEvent.changeText(screen.getByLabelText("Hours played"), "3");
    await fireEvent.press(screen.getByLabelText("Save"));
    expect(await screen.findByText("This one's needed to save.")).toBeTruthy();
    expect(await journal.listDay(day())).toHaveLength(0);

    // Hold the first save open so the second tap lands while it is still running.
    const realCreate = journal.create.bind(journal);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const create = jest.spyOn(journal, "create").mockImplementation(async (input) => {
      await gate;
      return realCreate(input);
    });

    await fireEvent.changeText(screen.getByLabelText("Game"), "Hades");
    expect(screen.queryByText("This one's needed to save.")).toBeNull();
    const first = fireEvent.press(screen.getByLabelText("Save"));
    await settle();
    await fireEvent.press(screen.getByLabelText("Save"));
    await act(async () => {
      release();
      await first;
    });

    expect(create).toHaveBeenCalledTimes(1);
    const entries = await journal.listDay(day());
    expect(entries).toHaveLength(1);
    expect(entries[0].fields).toMatchObject({ game: "Hades", hours: 3 });
    expect(mockRouter.dismissTo).toHaveBeenCalledWith("/");
    create.mockRestore();
  });

  it("does not block the navigation that follows a save", async () => {
    const { editor } = await setup();
    await editor(newGame());
    await fireEvent.changeText(await screen.findByLabelText("Game"), "Hades");
    expect(mockPrevent.enabled).toBe(true);

    await fireEvent.press(screen.getByLabelText("Save"));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith("/");
    expect(mockPrevent.enabled).toBe(false);
  });

  it("adds picked photos, and Leave removes them and saves nothing", async () => {
    const { core, journal, editor } = await setup();
    const importImage = jest.spyOn(core.media, "importImage");
    const remove = jest.spyOn(core.media, "remove");
    mockPick.mockResolvedValue(["file:///cache/a.jpg", "file:///cache/b.jpg"]);
    await editor(newGame());

    await fireEvent.press(await screen.findByLabelText("Add photos"));
    expect(mockPick).toHaveBeenCalledWith(12);
    expect(await screen.findAllByTestId("media-image")).toHaveLength(2);
    expect(importImage.mock.calls.map((c) => c[0])).toEqual(["file:///cache/a.jpg", "file:///cache/b.jpg"]);
    const ids = await Promise.all(importImage.mock.results.map((r) => r.value as Promise<{ id: string }>));

    await attemptLeave();
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(screen.getByText("Leave without saving? What you wrote here won't be kept.")).toBeTruthy();
    expect(modals()).toHaveLength(0);

    await fireEvent.press(screen.getByLabelText("Leave"));
    expect(remove).toHaveBeenCalledWith(ids.map((r) => r.id));
    expect(mockDispatch).toHaveBeenCalledWith(BACK);
    expect(await journal.listDay(day())).toHaveLength(0);
    for (const r of ids) expect(await core.media.info(r.id)).toBeNull();
  });

  it("Keep writing closes the question and keeps the draft", async () => {
    const { editor } = await setup();
    await editor(newGame());
    await fireEvent.changeText(await screen.findByLabelText("Game"), "Hades");

    await attemptLeave();
    await fireEvent.press(screen.getByLabelText("Keep writing"));
    expect(screen.queryByText("Leave without saving? What you wrote here won't be kept.")).toBeNull();
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Hades")).toBeTruthy();
  });

  it("leaves without asking when nothing changed", async () => {
    const { editor } = await setup();
    await editor(newGame());
    await screen.findByLabelText("Game");
    await attemptLeave();
    expect(mockDispatch).toHaveBeenCalledWith(BACK);
  });

  it("shows 'Adding photos…' while importing and keeps the photos that worked", async () => {
    const { core, editor } = await setup();
    const realImport = core.media.importImage.bind(core.media);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    jest.spyOn(core.media, "importImage").mockImplementation(async (uri) => {
      await gate;
      if (uri.endsWith("bad.jpg")) throw new Error("decode failed");
      return realImport(uri);
    });
    mockPick.mockResolvedValue(["file:///cache/a.jpg", "file:///cache/bad.jpg"]);
    await editor({ kind: "new", day: day(), typeId: "journal.day" });

    // fireEvent.press resolves when the handler's promise does, so start it and look while it runs.
    const pressed = fireEvent.press(await screen.findByLabelText("Add photos"));
    await settle();
    await waitFor(() => expect(screen.getByText("Adding photos…")).toBeTruthy());
    await act(async () => {
      release();
      await pressed;
    });

    expect(await screen.findAllByTestId("media-image")).toHaveLength(1);
    expect(screen.queryByText("Adding photos…")).toBeNull();
    expect(screen.getByText("One photo couldn't be added.")).toBeTruthy();
  });

  it("limits the picker to the photos still allowed", async () => {
    const { core, journal, editor } = await setup();
    const photoIds: string[] = [];
    for (let i = 0; i < 10; i++) photoIds.push((await core.media.importImage(`file:///cache/${i}.jpg`)).id);
    const entry = await journal.create({ day: day(), typeId: "journal.day", fields: { text: "Ten" }, photoIds });
    mockPick.mockResolvedValue([]);
    await editor({ kind: "edit", id: entry.id });

    await fireEvent.press(await screen.findByLabelText("Add photos"));
    expect(mockPick).toHaveBeenCalledWith(2);
  });

  it("imports no more picks than there is room for", async () => {
    const { core, journal, editor } = await setup();
    const photoIds: string[] = [];
    for (let i = 0; i < 10; i++) photoIds.push((await core.media.importImage(`file:///cache/${i}.jpg`)).id);
    const entry = await journal.create({ day: day(), typeId: "journal.day", fields: { text: "Ten" }, photoIds });
    const importImage = jest.spyOn(core.media, "importImage");
    // A picker that ignores selectionLimit.
    mockPick.mockResolvedValue(["file:///cache/x1.jpg", "file:///cache/x2.jpg", "file:///cache/x3.jpg", "file:///cache/x4.jpg"]);
    await editor({ kind: "edit", id: entry.id });

    await fireEvent.press(await screen.findByLabelText("Add photos"));
    expect(importImage.mock.calls.map((c) => c[0])).toEqual(["file:///cache/x1.jpg", "file:///cache/x2.jpg"]);
    expect(await screen.findAllByTestId("media-image")).toHaveLength(12);
  });

  it("a quick double tap on Add photos opens the picker once", async () => {
    const { editor } = await setup();
    const openPickers: ((uris: string[]) => void)[] = [];
    mockPick.mockImplementation(() => new Promise<string[]>((r) => openPickers.push(r)));
    await editor({ kind: "new", day: day(), typeId: "journal.day" });

    const first = fireEvent.press(await screen.findByLabelText("Add photos"));
    await settle();
    const second = fireEvent.press(screen.getByLabelText("Add photos"));
    await settle();
    await act(async () => {
      for (const close of openPickers) close([]);
      await Promise.all([first, second]);
    });
    expect(mockPick).toHaveBeenCalledTimes(1);
    // The button works again once the picker has closed.
    mockPick.mockResolvedValue([]);
    await fireEvent.press(screen.getByLabelText("Add photos"));
    expect(mockPick).toHaveBeenCalledTimes(2);
  });

  it("a picker that fails shows a calm note and keeps the draft", async () => {
    const { editor } = await setup();
    mockPick.mockRejectedValue(new Error("activity not found"));
    await editor({ kind: "new", day: day(), typeId: "journal.day" });
    await fireEvent.changeText(await screen.findByLabelText("How was the day?"), "Quiet");

    // Would throw here if the handler's promise rejected.
    await fireEvent.press(screen.getByLabelText("Add photos"));
    expect(screen.getByText("Photos couldn't be opened just now.")).toBeTruthy();
    expect(screen.getByDisplayValue("Quiet")).toBeTruthy();
    expect(screen.getByLabelText("Add photos").props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("editing keeps fields the type doesn't know about", async () => {
    const { journal, editor } = await setup();
    const entry = await journal.create({
      day: day(),
      typeId: "journal.game",
      fields: { game: "Hades", legacy: "keep" },
      photoIds: [],
    });
    await editor({ kind: "edit", id: entry.id });

    await fireEvent.changeText(await screen.findByDisplayValue("Hades"), "Hades II");
    await fireEvent.press(screen.getByLabelText("Save"));

    expect(mockRouter.back).toHaveBeenCalled();
    const saved = await journal.get(entry.id);
    expect(saved?.fields).toMatchObject({ game: "Hades II", legacy: "keep" });
  });

  it("removing a saved photo from the draft keeps its media until the edit is saved", async () => {
    const { core, journal, editor } = await setup();
    const photo = await core.media.importImage("file:///cache/kept.jpg");
    const entry = await journal.create({ day: day(), typeId: "journal.day", fields: { text: "Hi" }, photoIds: [photo.id] });
    await editor({ kind: "edit", id: entry.id });

    await fireEvent.press(await screen.findByLabelText("Remove photo 1"));
    expect(screen.queryAllByTestId("media-image")).toHaveLength(0);
    expect(await core.media.info(photo.id)).not.toBeNull();

    await attemptLeave();
    await fireEvent.press(screen.getByLabelText("Leave"));
    expect(mockDispatch).toHaveBeenCalledWith(BACK);
    expect(await core.media.info(photo.id)).not.toBeNull();
    expect((await journal.get(entry.id))?.photoIds).toEqual([photo.id]);
  });

  it("renders no Modal, and typed text survives the lock overlay coming and going", async () => {
    const { wrap } = await setup();
    // Same shape as LockGate: the app stays mounted and the lock screen is a sibling overlay.
    const Shell = ({ locked }: { locked: boolean }) => (
      <View style={{ flex: 1 }}>
        <EntryEditorScreen mode={newGame()} />
        {locked ? (
          <View testID="lock-overlay">
            <Text>Locked</Text>
          </View>
        ) : null}
      </View>
    );
    const view = await render(wrap(<Shell locked={false} />));
    await fireEvent.changeText(await screen.findByLabelText("Game"), "Hades");
    await fireEvent.changeText(screen.getByLabelText("What I want to remember"), "The last run");
    expect(modals()).toHaveLength(0);

    await view.rerender(wrap(<Shell locked />));
    expect(screen.getByTestId("lock-overlay")).toBeTruthy();
    await view.rerender(wrap(<Shell locked={false} />));

    expect(screen.queryByTestId("lock-overlay")).toBeNull();
    expect(screen.getByDisplayValue("Hades")).toBeTruthy();
    expect(screen.getByDisplayValue("The last run")).toBeTruthy();
    expect(modals()).toHaveLength(0);
  });

  it("the Modal check would catch a Modal", async () => {
    await render(
      <Modal visible>
        <Text>Hi</Text>
      </Modal>,
    );
    expect(modals().length).toBeGreaterThan(0);
  });
});

describe("TypePickerScreen", () => {
  it("lists enabled plugins' types and opens the editor for the picked one", async () => {
    const { wrap } = await setup();
    await render(wrap(<TypePickerScreen day="2026-11-10" />));
    expect(await screen.findByText("Game cleared")).toBeTruthy();
    expect(screen.getByText("Habit win")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Game cleared"));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: "/journal/edit",
      params: { day: "2026-11-10", typeId: "journal.game" },
    });
  });

  it("omits habits.win when Habits is off", async () => {
    const { host, wrap } = await setup();
    await host.setEnabled("habits", false);
    await render(wrap(<TypePickerScreen day={day()} />));
    expect(await screen.findByText("Game cleared")).toBeTruthy();
    expect(screen.queryByText("Habit win")).toBeNull();
  });
});
