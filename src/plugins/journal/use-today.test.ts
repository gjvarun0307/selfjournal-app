import { act, renderHook } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

import { useToday } from "./use-today";

jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  return { useFocusEffect: (effect: () => void) => useEffect(effect, [effect]) };
});

let listener: ((s: AppStateStatus) => void) | null = null;

beforeEach(() => {
  jest.useFakeTimers();
  listener = null;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_t, l) => {
    listener = l as (s: AppStateStatus) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("useToday", () => {
  it("returns the new day after midnight once the app becomes active", async () => {
    jest.setSystemTime(new Date(2026, 10, 12, 23, 59));
    const { result } = await renderHook(() => useToday());
    expect(result.current).toBe("2026-11-12");

    jest.setSystemTime(new Date(2026, 10, 13, 0, 1));
    expect(result.current).toBe("2026-11-12");
    await act(async () => listener?.("active"));
    expect(result.current).toBe("2026-11-13");
  });

  it("ignores AppState changes that are not active", async () => {
    jest.setSystemTime(new Date(2026, 10, 12, 23, 59));
    const { result } = await renderHook(() => useToday());
    jest.setSystemTime(new Date(2026, 10, 13, 0, 1));
    await act(async () => listener?.("background"));
    expect(result.current).toBe("2026-11-12");
  });
});
