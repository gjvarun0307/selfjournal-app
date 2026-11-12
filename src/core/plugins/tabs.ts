import type { PluginDefinition, PluginTab } from "./types";

const ME_TAB: PluginTab = { route: "me", title: "Me", icon: "person", order: 100 };

export function visibleTabs(defs: PluginDefinition[], enabledIds: string[]): PluginTab[] {
  const enabled = new Set(enabledIds);
  const tabs = defs
    .filter((d) => d.tab && enabled.has(d.id))
    .map((d) => d.tab as PluginTab)
    .sort((a, b) => a.order - b.order);
  return [...tabs, ME_TAB];
}
