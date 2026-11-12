import type { PluginDefinition } from "@/core/plugins/types";

import type { DayKey } from "./days";
import { journalEntryTypes } from "./entry-types";

declare module "@/core/events/types" {
  interface AppEvents {
    "journal.entryCreated": { entryId: string; typeId: string; day: DayKey };
  }
}

export const journalPlugin: PluginDefinition = {
  id: "journal",
  name: "Journal",
  description: "A page for each day, with notes, photos, stickers and tape.",
  icon: "book",
  tab: { route: "index", title: "Journal", icon: "book", order: 10 },
  entryTypes: journalEntryTypes,
  migrations: [
    {
      id: "journal:001",
      up: `CREATE TABLE journal_entries (id TEXT PRIMARY KEY, day TEXT NOT NULL, type_id TEXT NOT NULL,
  fields TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX journal_entries_day ON journal_entries (day, created_at);
CREATE TABLE journal_entry_photos (entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (entry_id, media_id));`,
    },
  ],
};
