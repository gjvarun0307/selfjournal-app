import type { PluginDefinition } from "@/core/plugins/types";

export const journalPlugin: PluginDefinition = {
  id: "journal",
  name: "Journal",
  description: "A page for each day, with notes, photos, stickers and tape.",
  icon: "book",
  tab: { route: "index", title: "Journal", icon: "book", order: 10 },
};
