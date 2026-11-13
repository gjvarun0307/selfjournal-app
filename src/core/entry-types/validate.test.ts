import type { EntryTypeDefinition } from "./types";
import { normalizeFields, validateEntryTypes } from "./validate";

const base: EntryTypeDefinition = {
  id: "p.game",
  name: "Game",
  description: "d",
  icon: "game-controller",
  fields: [
    { key: "game", label: "Game", kind: "text", required: true },
    { key: "hours", label: "Hours", kind: "number" },
    { key: "rating", label: "Rating", kind: "rating" },
    { key: "notes", label: "Notes", kind: "longText" },
  ],
  photos: true,
  titleField: "game",
  card: { variant: "cover", tint: "lilac" },
  templateId: "game",
};

describe("validateEntryTypes", () => {
  it("accepts a valid type", () => {
    expect(() => validateEntryTypes("p", [base])).not.toThrow();
  });
  it("throws on prefix mismatch", () => {
    expect(() => validateEntryTypes("q", [base])).toThrow();
  });
  it("throws on duplicate type id", () => {
    expect(() => validateEntryTypes("p", [base, base])).toThrow();
  });
  it("throws on duplicate field key", () => {
    const t = { ...base, fields: [...base.fields, { key: "game", label: "x", kind: "text" as const }] };
    expect(() => validateEntryTypes("p", [t])).toThrow();
  });
  it("throws on bad titleField", () => {
    expect(() => validateEntryTypes("p", [{ ...base, titleField: "nope" }])).toThrow();
    expect(() => validateEntryTypes("p", [{ ...base, titleField: "notes" }])).toThrow();
  });
});

describe("normalizeFields", () => {
  it("trims text and nulls blanks", () => {
    const r = normalizeFields(base, { game: "  Hades ", hours: "", rating: "", notes: "  " }, 0);
    expect(r.fields).toEqual({ game: "Hades", hours: null, rating: null, notes: null });
    expect(r.errors).toEqual({});
    expect(r.empty).toBe(false);
  });
  it("parses comma and dot decimals", () => {
    expect(normalizeFields(base, { game: "a", hours: "2,5" }, 0).fields.hours).toBe(2.5);
    expect(normalizeFields(base, { game: "a", hours: "2.5" }, 0).fields.hours).toBe(2.5);
  });
  it("rejects negative and non-numeric", () => {
    for (const bad of ["-1", "abc"]) {
      expect(normalizeFields(base, { game: "a", hours: bad }, 0).errors.hours).toBe("Use a number, like 2.5.");
    }
  });
  it("requires required fields", () => {
    expect(normalizeFields(base, { game: " " }, 0).errors.game).toBe("This one's needed to save.");
  });
  it("handles ratings leniently", () => {
    expect(normalizeFields(base, { game: "a", rating: "4" }, 0).fields.rating).toBe(4);
    for (const bad of ["0", "6", "2.5", "x"]) {
      const r = normalizeFields(base, { game: "a", rating: bad }, 0);
      expect(r.fields.rating).toBeNull();
      expect(r.errors.rating).toBeUndefined();
    }
  });
  it("empty depends on photos", () => {
    expect(normalizeFields(base, {}, 0).empty).toBe(true);
    expect(normalizeFields(base, {}, 1).empty).toBe(false);
  });
});
