import type { EntryFields, EntryTypeDefinition } from "./types";

export function validateEntryTypes(pluginId: string, types: EntryTypeDefinition[]): void {
  const seen = new Set<string>();
  for (const t of types) {
    if (!t.id.startsWith(`${pluginId}.`)) {
      throw new Error(`Entry type "${t.id}" must start with "${pluginId}."`);
    }
    if (seen.has(t.id)) throw new Error(`Duplicate entry type id: ${t.id}`);
    seen.add(t.id);
    const keys = new Set<string>();
    for (const f of t.fields) {
      if (keys.has(f.key)) throw new Error(`Entry type "${t.id}" has duplicate field key "${f.key}"`);
      keys.add(f.key);
    }
    if (t.titleField !== undefined) {
      const f = t.fields.find((x) => x.key === t.titleField);
      if (!f || f.kind !== "text") {
        throw new Error(`Entry type "${t.id}": titleField "${t.titleField}" must be a text field`);
      }
    }
  }
}

const REQUIRED_MSG = "This one's needed to save.";
const NUMBER_MSG = "Use a number, like 2.5.";

export function normalizeFields(
  type: EntryTypeDefinition,
  raw: Record<string, string>,
  photoCount: number,
): { fields: EntryFields; errors: Record<string, string>; empty: boolean } {
  const fields: EntryFields = {};
  const errors: Record<string, string> = {};
  for (const f of type.fields) {
    const text = (raw[f.key] ?? "").trim();
    let value: string | number | null = null;
    if (f.kind === "text" || f.kind === "longText") {
      value = text === "" ? null : text;
    } else if (f.kind === "number") {
      if (text !== "") {
        const s = text.replace(",", ".");
        const n = /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
        if (Number.isFinite(n)) value = n;
        else errors[f.key] = NUMBER_MSG;
      }
    } else {
      const n = /^\d+$/.test(text) ? Number(text) : NaN;
      value = n >= 1 && n <= 5 ? n : null;
    }
    fields[f.key] = value;
    if (f.required && value === null && !errors[f.key]) errors[f.key] = REQUIRED_MSG;
  }
  const empty = photoCount === 0 && Object.values(fields).every((v) => v === null);
  return { fields, errors, empty };
}
