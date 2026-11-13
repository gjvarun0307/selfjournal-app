import { useLocalSearchParams } from "expo-router";

import { dayKey } from "@/plugins/journal/days";
import { TypePickerScreen } from "@/plugins/journal/screens/type-picker-screen";

export default function NewEntryRoute() {
  const { day } = useLocalSearchParams<{ day?: string }>();
  return <TypePickerScreen day={day ?? dayKey(new Date())} />;
}
