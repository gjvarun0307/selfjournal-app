import { redirectTarget, tabRouteFromSegments, visibleTabs } from "./tabs";
import type { PluginDefinition } from "./types";

const def = (id: string, route: "index" | "habits" | "recovery", order: number): PluginDefinition => ({
  id, name: id, description: id, icon: id,
  tab: { route, title: id, icon: id, order },
});

describe("visibleTabs", () => {
  it("hides tabs of disabled plugins and always includes Me last", () => {
    const defs = [def("journal", "index", 10), def("habits", "habits", 20), def("recovery", "recovery", 30)];
    const tabs = visibleTabs(defs, ["journal", "recovery"]);
    expect(tabs.map((t) => t.route)).toEqual(["index", "recovery", "me"]);
  });
});

describe("visibleTabs Me tab", () => {
  it("returns a fresh Me tab each call", () => {
    const first = visibleTabs([], []);
    first[first.length - 1].title = "changed";
    expect(visibleTabs([], [])[0].title).toBe("Me");
  });
});

describe("redirectTarget", () => {
  it("stays put when the current tab is visible or outside the tabs", () => {
    expect(redirectTarget("habits", ["habits", "me"])).toBeNull();
    expect(redirectTarget(null, ["me"])).toBeNull();
  });
  it("goes to the first visible tab when the current one is hidden", () => {
    expect(redirectTarget("index", ["habits", "me"])).toBe("habits");
    expect(redirectTarget("index", ["me"])).toBe("me");
  });
  it("maps segments to routes", () => {
    expect(tabRouteFromSegments(["(tabs)"])).toBe("index");
    expect(tabRouteFromSegments(["(tabs)", "habits"])).toBe("habits");
    expect(tabRouteFromSegments(["settings"])).toBeNull();
  });
});
