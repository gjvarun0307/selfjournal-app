import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";

import { dayKey, type DayKey } from "./days";

/** The current local day. Re-read when the app returns to the foreground and when the screen gains focus. */
export function useToday(): DayKey {
  const [today, setToday] = useState<DayKey>(() => dayKey(new Date()));
  const refresh = useCallback(() => setToday(dayKey(new Date())), []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  useFocusEffect(refresh);
  return today;
}
