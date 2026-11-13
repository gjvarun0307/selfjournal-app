import { useLocalSearchParams } from "expo-router";

import { dayKey } from "@/plugins/journal/days";
import { EntryEditorScreen, type EditorMode } from "@/plugins/journal/screens/entry-editor-screen";

/** `?id=` edits a saved entry; `?day=&typeId=` starts a new one. */
export default function EditEntryRoute() {
  const { id, day, typeId } = useLocalSearchParams<{ id?: string; day?: string; typeId?: string }>();
  const mode: EditorMode = id ? { kind: "edit", id } : { kind: "new", day: day ?? dayKey(new Date()), typeId: typeId ?? "" };
  return <EntryEditorScreen mode={mode} />;
}
