import type { PluginDefinition, PluginTab } from "./types";

const ME_TAB: PluginTab = { route: "me", title: "Me", icon: "person", order: 100 };

/** Route name of the tab a router segment list points at, or null when not inside the tabs group. */
export function tabRouteFromSegments(segments: readonly string[]): PluginTab["route"] | null {
  if (segments[0] !== "(tabs)") return null;
  return (segments[1] ?? "index") as PluginTab["route"];
}

/** Where to send the user when the focused tab is no longer visible (plugin turned off); null = stay. */
export function redirectTarget(
  currentRoute: PluginTab["route"] | null,
  visibleRoutes: readonly PluginTab["route"][],
): PluginTab["route"] | null {
  if (currentRoute === null || visibleRoutes.includes(currentRoute)) return null;
  return visibleRoutes[0] ?? "me";
}

export function visibleTabs(defs: PluginDefinition[], enabledIds: string[]): PluginTab[] {
  const enabled = new Set(enabledIds);
  const tabs = defs
    .filter((d) => d.tab && enabled.has(d.id))
    .map((d) => d.tab as PluginTab)
    .sort((a, b) => a.order - b.order);
  return [...tabs, ME_TAB];
}
