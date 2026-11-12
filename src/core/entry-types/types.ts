export type EntryFieldKind = "text" | "longText" | "number" | "rating";
export interface EntryField {
  key: string;
  label: string;
  kind: EntryFieldKind;
  required?: boolean;
  placeholder?: string;
}
export type CardVariant = "cover" | "note";
export type CardTint = "sky" | "sage" | "peach" | "lilac" | "sand" | "mint";
export interface EntryTypeDefinition {
  id: string; // "<pluginId>.<name>"
  name: string;
  description: string;
  icon: string; // Ionicons base name; "-outline" is appended where needed
  fields: EntryField[];
  photos: boolean;
  titleField?: string; // key of a "text" field used as the card title
  card: { variant: CardVariant; tint: CardTint };
  templateId: string; // canvas template id, used in Plan 7
}
export type EntryFieldValue = string | number | null;
export type EntryFields = Record<string, EntryFieldValue>;
