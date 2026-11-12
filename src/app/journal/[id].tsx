import { useLocalSearchParams } from "expo-router";

import { EntryDetailScreen } from "@/plugins/journal/screens/entry-detail-screen";

export default function EntryDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EntryDetailScreen id={id} />;
}
