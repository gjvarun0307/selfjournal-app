import type { EntryTypeDefinition } from "@/core/entry-types/types";

export const habitsEntryTypes: EntryTypeDefinition[] = [
  {
    id: "habits.win",
    name: "Habit win",
    description: "A good moment worth remembering.",
    icon: "checkmark-circle",
    fields: [
      { key: "habit", label: "Habit", kind: "text" },
      { key: "note", label: "Note", kind: "longText" },
    ],
    photos: true,
    titleField: "habit",
    card: { variant: "note", tint: "mint" },
    templateId: "win",
  },
];
