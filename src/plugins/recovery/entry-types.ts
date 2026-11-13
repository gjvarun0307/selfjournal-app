import type { EntryTypeDefinition } from "@/core/entry-types/types";

export const recoveryEntryTypes: EntryTypeDefinition[] = [
  {
    id: "recovery.note",
    name: "Recovery note",
    description: "Something you want to hold onto from your recovery.",
    icon: "document-text",
    fields: [
      { key: "about", label: "Where from", kind: "text", placeholder: "Therapy, a meeting, my sponsor…" },
      { key: "text", label: "What came up", kind: "longText" },
    ],
    photos: false,
    titleField: "about",
    card: { variant: "note", tint: "sand" },
    templateId: "note",
  },
  {
    id: "recovery.slip",
    name: "Slip reflection",
    description: "Only if it helps. You can leave any of it blank.",
    icon: "leaf",
    fields: [
      { key: "happened", label: "What happened", kind: "longText" },
      { key: "feel", label: "How I feel", kind: "longText" },
    ],
    photos: false,
    card: { variant: "note", tint: "lilac" },
    templateId: "slip",
  },
];
