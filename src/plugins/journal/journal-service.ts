import * as Crypto from "expo-crypto";

import type { Db } from "@/core/db/types";
import type { EntryFields, EntryTypeDefinition } from "@/core/entry-types/types";
import { normalizeFields } from "@/core/entry-types/validate";
import type { PluginContext } from "@/core/plugins/types";

import type { DayKey } from "./days";

export interface JournalEntry {
  id: string;
  day: DayKey;
  typeId: string;
  fields: EntryFields;
  photoIds: string[];
  createdAt: number;
  updatedAt: number;
}
export interface EntryInput {
  day: DayKey;
  typeId: string;
  fields: EntryFields;
  photoIds: string[];
}

/** Unknown type or id, or fields that fail the type's validation. */
export class EntryInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntryInvalidError";
  }
}

export interface JournalService {
  listDay(day: DayKey): Promise<JournalEntry[]>;
  get(id: string): Promise<JournalEntry | null>;
  create(input: EntryInput): Promise<JournalEntry>;
  update(id: string, change: { fields: EntryFields; photoIds: string[] }): Promise<JournalEntry>;
  remove(id: string): Promise<void>;
  subscribe(listener: () => void): () => void;
}

interface Row {
  id: string;
  day: string;
  type_id: string;
  fields: string;
  created_at: number;
  updated_at: number;
}

function validate(type: EntryTypeDefinition, fields: EntryFields, photoCount: number): EntryFields {
  const raw: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) raw[k] = String(v ?? "");
  const { fields: normalized, errors, empty } = normalizeFields(type, raw, photoCount);
  if (Object.keys(errors).length > 0 || empty) {
    throw new EntryInvalidError(`Entry is not valid for "${type.id}".`);
  }
  return { ...fields, ...normalized };
}

async function insertPhotos(tx: Db, entryId: string, photoIds: string[]) {
  for (let i = 0; i < photoIds.length; i++) {
    await tx.run("INSERT INTO journal_entry_photos (entry_id, media_id, position) VALUES (?, ?, ?)", [
      entryId,
      photoIds[i],
      i,
    ]);
  }
}

export function createJournalService(
  ctx: PluginContext,
  lookupType: (id: string) => EntryTypeDefinition | undefined,
  opts: { now?(): number; randomId?(): string } = {},
): JournalService {
  const now = opts.now ?? Date.now;
  const randomId = opts.randomId ?? (() => Crypto.randomUUID());
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const l of [...listeners]) l();
  };

  async function load(db: Db, rows: Row[]): Promise<JournalEntry[]> {
    const out: JournalEntry[] = [];
    for (const r of rows) {
      const photos = await db.all<{ media_id: string }>(
        "SELECT media_id FROM journal_entry_photos WHERE entry_id = ? ORDER BY position",
        [r.id],
      );
      out.push({
        id: r.id,
        day: r.day,
        typeId: r.type_id,
        fields: JSON.parse(r.fields) as EntryFields,
        photoIds: photos.map((p) => p.media_id),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      });
    }
    return out;
  }

  async function get(id: string): Promise<JournalEntry | null> {
    const row = await ctx.db.first<Row>("SELECT * FROM journal_entries WHERE id = ?", [id]);
    return row ? (await load(ctx.db, [row]))[0] : null;
  }

  function typeOf(typeId: string): EntryTypeDefinition {
    const type = lookupType(typeId);
    if (!type) throw new EntryInvalidError(`Unknown entry type "${typeId}".`);
    return type;
  }

  return {
    async listDay(day) {
      const rows = await ctx.db.all<Row>(
        "SELECT * FROM journal_entries WHERE day = ? ORDER BY created_at, rowid",
        [day],
      );
      return load(ctx.db, rows);
    },
    get,
    async create(input) {
      const type = typeOf(input.typeId);
      const fields = validate(type, input.fields, input.photoIds.length);
      const id = randomId();
      const ts = now();
      await ctx.db.transaction(async (tx) => {
        await tx.run(
          "INSERT INTO journal_entries (id, day, type_id, fields, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
          [id, input.day, input.typeId, JSON.stringify(fields), ts, ts],
        );
        await insertPhotos(tx, id, input.photoIds);
        await ctx.media.commit(tx, input.photoIds);
      });
      notify();
      await ctx.bus.emit("journal.entryCreated", { entryId: id, typeId: input.typeId, day: input.day });
      return { id, day: input.day, typeId: input.typeId, fields, photoIds: [...input.photoIds], createdAt: ts, updatedAt: ts };
    },
    async update(id, change) {
      const old = await get(id);
      if (!old) throw new EntryInvalidError(`Entry "${id}" not found.`);
      const fields = validate(typeOf(old.typeId), { ...old.fields, ...change.fields }, change.photoIds.length);
      const removed = old.photoIds.filter((p) => !change.photoIds.includes(p));
      const ts = now();
      await ctx.db.transaction(async (tx) => {
        await tx.run("UPDATE journal_entries SET fields = ?, updated_at = ? WHERE id = ?", [
          JSON.stringify(fields),
          ts,
          id,
        ]);
        await tx.run("DELETE FROM journal_entry_photos WHERE entry_id = ?", [id]);
        await insertPhotos(tx, id, change.photoIds);
        await ctx.media.commit(tx, change.photoIds);
      });
      if (removed.length > 0) await ctx.media.remove(removed);
      notify();
      return { ...old, fields, photoIds: [...change.photoIds], updatedAt: ts };
    },
    async remove(id) {
      const old = await get(id);
      if (!old) throw new EntryInvalidError(`Entry "${id}" not found.`);
      await ctx.db.transaction(async (tx) => {
        await tx.run("DELETE FROM journal_entry_photos WHERE entry_id = ?", [id]);
        await tx.run("DELETE FROM journal_entries WHERE id = ?", [id]);
      });
      if (old.photoIds.length > 0) await ctx.media.remove(old.photoIds);
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const services = new WeakMap<PluginContext, JournalService>();

/** One service per context, so every screen shares the same subscribers. */
export function getJournalService(
  ctx: PluginContext,
  lookupType: (id: string) => EntryTypeDefinition | undefined,
): JournalService {
  let s = services.get(ctx);
  if (!s) services.set(ctx, (s = createJournalService(ctx, lookupType)));
  return s;
}
