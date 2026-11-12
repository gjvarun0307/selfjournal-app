import { ALL_PLUGINS } from "./index";

describe("ALL_PLUGINS", () => {
  it("ALL_PLUGINS has the five ids, unique", () => {
    const ids = ALL_PLUGINS.map((p) => p.id);
    expect(ids).toEqual(["journal", "habits", "recovery", "gamification", "lifestats"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("journal/habits/recovery declare tabs; gamification/lifestats do not", () => {
    const byId = Object.fromEntries(ALL_PLUGINS.map((p) => [p.id, p]));
    expect(byId.journal.tab).toEqual({ route: "index", title: "Journal", icon: "book", order: 10 });
    expect(byId.habits.tab).toEqual({ route: "habits", title: "Habits", icon: "checkmark-circle", order: 20 });
    expect(byId.recovery.tab).toEqual({ route: "recovery", title: "Recovery", icon: "leaf", order: 30 });
    expect(byId.gamification.tab).toBeUndefined();
    expect(byId.lifestats.tab).toBeUndefined();
  });
});
