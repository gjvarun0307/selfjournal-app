import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import { useHost } from "@/core/app-provider";
import { useTheme } from "@/theme/use-theme";
import { dayLabel, shiftDay, type DayKey } from "../days";
import type { JournalEntry } from "../journal-service";
import { useJournal } from "../use-journal";
import { useToday } from "../use-today";
import { EntryCard } from "./entry-card";

export const EMPTY_DAY_COPY = "Nothing here yet. Add whatever's on your mind.";

const noop = () => undefined;

export function JournalDayScreen() {
  const { colors, space, radius, font } = useTheme();
  const host = useHost();
  const journal = useJournal();
  const today = useToday();
  // null = follow today, so the screen moves on when the date rolls over.
  const [picked, setPicked] = useState<DayKey | null>(null);
  const day = picked ?? today;
  const [loaded, setLoaded] = useState<{ day: DayKey; entries: JournalEntry[] } | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => {
      journal.listDay(day).then(
        (entries) => live && setLoaded({ day, entries }),
        () => undefined,
      );
    };
    load();
    const unsubscribe = journal.subscribe(load);
    return () => {
      live = false;
      unsubscribe();
    };
  }, [journal, day]);

  const goTo = (d: DayKey) => setPicked(d >= today ? null : d);
  const onToday = day === today;
  const entries = loaded?.day === day ? loaded.entries : null;
  const target = space.xxl + space.sm;

  const navButton = (label: string, icon: "chevron-back" | "chevron-forward", onPress: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ width: target, height: target, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : 1 }}
    >
      <Ionicons name={icon} size={space.xl} color={colors.text} />
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.sm, gap: space.xs }}>
        {navButton("Previous day", "chevron-back", () => goTo(shiftDay(day, -1)))}
        <Text accessibilityRole="header" style={{ color: colors.text, fontSize: font.title, fontWeight: "600" }}>
          {dayLabel(day, today)}
        </Text>
        {navButton("Next day", "chevron-forward", () => goTo(shiftDay(day, 1)), onToday)}
        <View style={{ flex: 1 }} />
        {!onToday ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Today"
            onPress={() => setPicked(null)}
            style={{
              paddingHorizontal: space.lg,
              paddingVertical: space.sm,
              borderRadius: radius.pill,
              backgroundColor: colors.surfaceAlt,
            }}
          >
            <Text style={{ color: colors.text, fontSize: font.small }}>Today</Text>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        style={{ flex: 1 }}
        data={entries ?? []}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: space.lg, gap: space.md, flexGrow: 1 }}
        renderItem={({ item }) => <EntryCard entry={item} type={host.entryType(item.typeId)} onPress={noop} />}
        ListEmptyComponent={
          entries ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl }}>
              <Text style={{ color: colors.textMuted, fontSize: font.body, textAlign: "center" }}>{EMPTY_DAY_COPY}</Text>
            </View>
          ) : undefined
        }
      />

      <View style={{ padding: space.lg }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add entry"
          onPress={() => router.push({ pathname: "/journal/new", params: { day } })}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: space.sm,
            paddingVertical: space.md,
            borderRadius: radius.pill,
            backgroundColor: colors.accent,
          }}
        >
          <Ionicons name="add" size={space.xl} color={colors.accentText} />
          <Text style={{ color: colors.accentText, fontSize: font.body, fontWeight: "600" }}>Add entry</Text>
        </Pressable>
      </View>
    </View>
  );
}
