import type { PluginDefinition } from "@/core/plugins/types";

import { recoveryEntryTypes } from "./entry-types";

export const recoveryPlugin: PluginDefinition = {
  id: "recovery",
  name: "Recovery",
  description: "Step away from habits that hurt you, at your own pace. A slip never wipes your wins.",
  icon: "leaf",
  tab: { route: "recovery", title: "Recovery", icon: "leaf", order: 30 },
  entryTypes: recoveryEntryTypes,
};
