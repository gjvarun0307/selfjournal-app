import { Stack, router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useHost } from "@/core/app-provider";
import { MediaImage } from "@/core/media/media-image";
import { useTheme } from "@/theme/use-theme";
import type { JournalEntry } from "../journal-service";
import { useJournal } from "../use-journal";
import { InlineConfirm } from "./inline-confirm";
import { Rating } from "./rating";

export const ENTRY_MISSING_COPY = "This entry isn't here any more.";
export const DELETE_COPY = "Delete this entry? Its photos go too. This can't be undone.";

function text(v: unknown): string | undefined {
  if (typeof v === "number") return String(v);
  return typeof v === "string" && v.trim() ? v : undefined;
}

export function EntryDetailScreen({ id }: { id: string }) {
  const { colors, space, radius, font } = useTheme();
  const host = useHost();
  const journal = useJournal();
  const [loaded, setLoaded] = useState<{ id: string; entry: JournalEntry | null } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const deleting = useRef(false);

  useEffect(() => {
    let live = true;
    const load = () => {
      journal.get(id).then(
        (entry) => live && setLoaded({ id, entry }),
        () => undefined,
      );
    };
    load();
    const unsubscribe = journal.subscribe(load);
    return () => {
      live = false;
      unsubscribe();
    };
  }, [journal, id]);

  const entry = loaded?.id === id ? loaded.entry : undefined;
  const type = entry ? host.entryType(entry.typeId) : undefined;
  const title = type?.name ?? "Entry";

  const onDelete = async () => {
    if (deleting.current) return;
    deleting.current = true;
    setBusy(true);
    try {
      await journal.remove(id);
      router.back();
    } catch {
      deleting.current = false;
      setBusy(false);
    }
  };

  const button = (label: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 48,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radius.pill,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ color: colors.text, fontSize: font.body, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );

  if (entry === undefined) {
    return <View style={{ flex: 1, backgroundColor: colors.background }}><Stack.Screen options={{ title: "Entry" }} /></View>;
  }
  if (entry === null) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: space.xl }}>
        <Stack.Screen options={{ title: "Entry" }} />
        <Text style={{ color: colors.textMuted, fontSize: font.body, textAlign: "center" }}>{ENTRY_MISSING_COPY}</Text>
      </View>
    );
  }

  const rows: { key: string; label?: string; kind: string; value: unknown }[] = type
    ? type.fields.map((f) => ({ key: f.key, label: f.label, kind: f.kind, value: entry.fields[f.key] }))
    : Object.entries(entry.fields).map(([key, value]) => ({ key, kind: "text", value }));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: space.lg, gap: space.lg }}
    >
      <Stack.Screen options={{ title }} />
      {rows.map((r) => {
        const isRating = r.kind === "rating";
        const rating = Number(r.value);
        const shown = isRating ? (rating > 0 ? rating : undefined) : text(r.value);
        if (shown === undefined) return null;
        return (
          <View key={r.key} style={{ gap: space.xs }}>
            {r.label ? <Text style={{ color: colors.textMuted, fontSize: font.small }}>{r.label}</Text> : null}
            {isRating ? (
              <Rating value={rating} />
            ) : (
              <Text selectable style={{ color: colors.text, fontSize: font.body, lineHeight: font.body * 1.4 }}>
                {shown}
              </Text>
            )}
          </View>
        );
      })}
      {entry.photoIds.map((photoId) => (
        <MediaImage key={photoId} id={photoId} size="full" />
      ))}
      {confirming ? (
        <InlineConfirm
          message={DELETE_COPY}
          confirmLabel="Delete"
          cancelLabel="Keep it"
          busy={busy}
          onConfirm={onDelete}
          onCancel={() => setConfirming(false)}
        />
      ) : (
        <View style={{ flexDirection: "row", gap: space.md }}>
          {type ? button("Edit", () => router.push({ pathname: "/journal/edit", params: { id } })) : null}
          {button("Delete", () => setConfirming(true))}
        </View>
      )}
    </ScrollView>
  );
}
