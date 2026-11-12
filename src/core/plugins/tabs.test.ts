import { visibleTabs } from "./tabs";
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
