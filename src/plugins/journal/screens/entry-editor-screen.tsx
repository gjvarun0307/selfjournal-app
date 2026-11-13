import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useNavigation, usePreventRemove } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { useHost, usePluginContext } from "@/core/app-provider";
import type { EntryFields, EntryTypeDefinition } from "@/core/entry-types/types";
import { normalizeFields } from "@/core/entry-types/validate";
import { useTheme } from "@/theme/use-theme";
import { dayLabel, type DayKey } from "../days";
import type { JournalEntry } from "../journal-service";
import { pickImages } from "../pick-images";
import { useJournal } from "../use-journal";
import { useToday } from "../use-today";
import { FieldInput } from "./field-input";
import { InlineConfirm } from "./inline-confirm";
import { MAX_PHOTOS, PhotoEditor } from "./photo-editor";

export type EditorMode = { kind: "new"; day: DayKey; typeId: string } | { kind: "edit"; id: string };

export const LEAVE_MESSAGE = "Leave without saving? What you wrote here won't be kept.";
export const SAVE_FAILED_MESSAGE = "This couldn't be saved just now. What you wrote is still here.";
export const EDIT_UNAVAILABLE_MESSAGE = "This entry can't be opened right now. Nothing has been deleted.";

type IconName = keyof typeof Ionicons.glyphMap;
type LeaveAction = Parameters<NonNullable<Parameters<typeof usePreventRemove>[1]>>[0]["data"]["action"];

interface Draft {
  type: EntryTypeDefinition;
  day: DayKey;
  /** The stored entry when editing; its fields are the base the edit is merged onto. */
  entry: JournalEntry | null;
  initial: Record<string, string>;
  initialPhotos: string[];
}

function rawFields(type: EntryTypeDefinition, fields: EntryFields): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const f of type.fields) {
    const v = fields[f.key];
    raw[f.key] = v === null || v === undefined ? "" : String(v);
  }
  return raw;
}

type LoadState = { status: "loading" } | { status: "missing" } | { status: "ready"; draft: Draft };

export function EntryEditorScreen({ mode }: { mode: EditorMode }) {
  const host = useHost();
  const journal = useJournal();
  const newType = mode.kind === "new" ? host.entryType(mode.typeId) : undefined;
  const [loaded, setLoaded] = useState<{ id: string; state: LoadState } | null>(null);
  const editId = mode.kind === "edit" ? mode.id : null;

  useEffect(() => {
    if (editId === null) return;
    let live = true;
    journal.get(editId).then(
      (entry) => {
        if (!live) return;
        const type = entry ? host.entryType(entry.typeId) : undefined;
        setLoaded({
          id: editId,
          state:
            entry && type
              ? {
                  status: "ready",
                  draft: {
                    type,
                    day: entry.day,
                    entry,
                    initial: rawFields(type, entry.fields),
                    initialPhotos: entry.photoIds,
                  },
                }
              : { status: "missing" },
        });
      },
      () => live && setLoaded({ id: editId, state: { status: "missing" } }),
    );
    return () => {
      live = false;
    };
  }, [journal, host, editId]);

  let state: LoadState;
  if (mode.kind === "new") {
    state = newType
      ? {
          status: "ready",
          draft: { type: newType, day: mode.day, entry: null, initial: rawFields(newType, {}), initialPhotos: [] },
        }
      : { status: "missing" };
  } else {
    state = loaded?.id === mode.id ? loaded.state : { status: "loading" };
  }

  if (state.status === "loading") return <Calm loading />;
  if (state.status === "missing") return <Calm message={EDIT_UNAVAILABLE_MESSAGE} />;
  const key = mode.kind === "edit" ? `edit:${mode.id}` : `new:${mode.day}:${mode.typeId}`;
  return <EditorForm key={key} draft={state.draft} isNew={mode.kind === "new"} />;
}

function Calm({ loading, message }: { loading?: boolean; message?: string }) {
  const { colors, space, font } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, backgroundColor: colors.background }}>
      {loading ? (
        <ActivityIndicator color={colors.accent} accessibilityLabel="Opening entry" />
      ) : (
        <Text selectable style={{ color: colors.textMuted, fontSize: font.body, textAlign: "center" }}>
          {message}
        </Text>
      )}
    </View>
  );
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function EditorForm({ draft, isNew }: { draft: Draft; isNew: boolean }) {
  const { colors, space, radius, font } = useTheme();
  const journal = useJournal();
  const media = usePluginContext("journal").media;
  const navigation = useNavigation();
  const today = useToday();
  const { type } = draft;

  const [values, setValues] = useState(draft.initial);
  const [photos, setPhotos] = useState(draft.initialPhotos);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  const [leaveAction, setLeaveAction] = useState<LeaveAction | null>(null);
  const [leaving, setLeaving] = useState(false);
  // Saved or left: nothing left to protect, so the guard must let the next navigation through.
  const [done, setDone] = useState(false);

  // Refs guard against double taps landing before the next render.
  const savingRef = useRef(false);
  const importingRef = useRef(false);
  /** Set from the first "Add photos" tap until the picker and its imports are done. */
  const busyRef = useRef(false);
  /** The draft's photos as of the last change, for capacity checks inside async handlers. */
  const photosRef = useRef(draft.initialPhotos);
  const goneRef = useRef(false);
  /** Media imported in this session and not yet saved: removed if the user leaves. */
  const importedRef = useRef<string[]>([]);

  useEffect(() => {
    goneRef.current = false;
    return () => {
      goneRef.current = true;
    };
  }, []);

  const normalized = normalizeFields(type, values, photos.length);
  const errors = showErrors ? normalized.errors : {};
  const changed =
    type.fields.some((f) => (values[f.key] ?? "") !== (draft.initial[f.key] ?? "")) ||
    !sameList(photos, draft.initialPhotos);
  const hasChanges = !done && (changed || importing);

  const disablePrevention = usePreventRemove(hasChanges, ({ data }) => {
    // A save in flight finishes by navigating itself; ignore back presses meanwhile.
    if (!savingRef.current) setLeaveAction(data.action);
  });

  const setField = (key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setSaveFailed(false);
  };

  const addPhotos = async () => {
    // Busy from the first tap: the picker takes a moment to cover the screen.
    if (busyRef.current) return;
    if (MAX_PHOTOS - photosRef.current.length <= 0) return;
    busyRef.current = true;
    setPicking(true);
    setPhotoNote(null);
    let picked: string[];
    try {
      picked = await pickImages(MAX_PHOTOS - photosRef.current.length);
    } catch {
      picked = [];
      if (!goneRef.current) setPhotoNote("Photos couldn't be opened just now.");
    } finally {
      if (!goneRef.current) setPicking(false);
    }
    // Re-check the room left now the picker is closed (some pickers ignore selectionLimit).
    const uris = picked.slice(0, Math.max(0, MAX_PHOTOS - photosRef.current.length));
    if (uris.length === 0 || goneRef.current) {
      busyRef.current = false;
      return;
    }
    importingRef.current = true;
    setImporting(true);
    let failed = 0;
    for (const uri of uris) {
      try {
        const rec = await media.importImage(uri);
        if (goneRef.current) {
          // The user left mid-import: don't leave this one pending.
          media.remove([rec.id]).catch(() => undefined);
          continue;
        }
        importedRef.current.push(rec.id);
        photosRef.current = [...photosRef.current, rec.id];
        setPhotos(photosRef.current);
      } catch {
        failed++;
      }
    }
    importingRef.current = false;
    busyRef.current = false;
    if (goneRef.current) return;
    setImporting(false);
    if (failed > 0) setPhotoNote(failed === 1 ? "One photo couldn't be added." : "Some photos couldn't be added.");
  };

  const removePhoto = (id: string) => {
    photosRef.current = photosRef.current.filter((x) => x !== id);
    setPhotos(photosRef.current);
    setPhotoNote(null);
    // A photo added in this session was never saved, so it can go now. A saved one stays until the
    // edit is saved (the journal removes it then), so leaving without saving keeps it.
    if (importedRef.current.includes(id)) {
      importedRef.current = importedRef.current.filter((x) => x !== id);
      media.remove([id]).catch(() => undefined);
    }
  };

  const save = async () => {
    if (savingRef.current || done || busyRef.current) return;
    const result = normalizeFields(type, values, photos.length);
    if (result.empty) return;
    if (Object.keys(result.errors).length > 0) {
      setShowErrors(true);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveFailed(false);
    try {
      if (isNew || !draft.entry) {
        await journal.create({ day: draft.day, typeId: type.id, fields: result.fields, photoIds: photos });
      } else {
        // Keep keys this type doesn't know about (older versions, removed fields).
        await journal.update(draft.entry.id, { fields: { ...draft.entry.fields, ...result.fields }, photoIds: photos });
      }
    } catch {
      savingRef.current = false;
      setSaving(false);
      setSaveFailed(true);
      return;
    }
    importedRef.current = [];
    setDone(true);
    disablePrevention();
    if (isNew) router.dismissTo("/");
    else router.back();
  };

  const leave = async () => {
    if (!leaveAction || leaving) return;
    setLeaving(true);
    goneRef.current = true;
    const ids = importedRef.current;
    importedRef.current = [];
    if (ids.length > 0) {
      // If this fails, the pending-media sweep removes them later.
      await media.remove(ids).catch(() => undefined);
    }
    setDone(true);
    disablePrevention();
    navigation.dispatch(leaveAction);
  };

  const saveDisabled = normalized.empty || saving || importing || picking;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: space.lg, gap: space.xl }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <View
            style={{
              width: space.xxl + space.lg,
              height: space.xxl + space.lg,
              borderRadius: radius.pill,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.tints[type.card.tint],
            }}
          >
            <Ionicons name={`${type.icon}-outline` as IconName} size={space.xl} color={colors.text} />
          </View>
          <View style={{ flex: 1, gap: space.xs }}>
            <Text style={{ color: colors.text, fontSize: font.title, fontWeight: "600" }}>{type.name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: font.small }}>{dayLabel(draft.day, today)}</Text>
          </View>
        </View>

        {type.fields.map((f) => (
          <FieldInput
            key={f.key}
            field={f}
            value={values[f.key] ?? ""}
            error={errors[f.key]}
            onChange={(v) => setField(f.key, v)}
          />
        ))}

        {type.photos ? (
          <PhotoEditor
            photoIds={photos}
            importing={importing}
            picking={picking}
            note={photoNote}
            onAdd={addPhotos}
            onRemove={removePhoto}
          />
        ) : null}
      </ScrollView>

      <View style={{ padding: space.lg, gap: space.md, borderTopWidth: 1, borderTopColor: colors.border }}>
        {leaveAction ? (
          <InlineConfirm
            message={LEAVE_MESSAGE}
            confirmLabel="Leave"
            cancelLabel="Keep writing"
            busy={leaving}
            onConfirm={leave}
            onCancel={() => setLeaveAction(null)}
          />
        ) : (
          <>
            {saveFailed ? (
              <Text selectable accessibilityLiveRegion="polite" style={{ color: colors.caution, fontSize: font.small }}>
                {SAVE_FAILED_MESSAGE}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save"
              accessibilityState={{ disabled: saveDisabled, busy: saving }}
              disabled={saveDisabled}
              onPress={save}
              style={({ pressed }) => ({
                minHeight: 48,
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: space.md,
                borderRadius: radius.pill,
                backgroundColor: colors.accent,
                opacity: saveDisabled ? 0.5 : pressed ? 0.8 : 1,
              })}
            >
              {saving ? (
                <ActivityIndicator color={colors.accentText} />
              ) : (
                <Text style={{ color: colors.accentText, fontSize: font.body, fontWeight: "600" }}>Save</Text>
              )}
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
