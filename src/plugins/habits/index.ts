import type { PluginDefinition } from "@/core/plugins/types";

import { habitsEntryTypes } from "./entry-types";

export const habitsPlugin: PluginDefinition = {
  id: "habits",
  name: "Habits",
  description: "Good habits you want to build. Progress adds up and never resets.",
  icon: "checkmark-circle",
  tab: { route: "habits", title: "Habits", icon: "checkmark-circle", order: 20 },
  entryTypes: habitsEntryTypes,
};
