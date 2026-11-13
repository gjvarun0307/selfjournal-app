import { launchImageLibraryAsync } from "expo-image-picker";

/**
 * Opens the system photo picker for up to `limit` images and returns their uris ([] on cancel).
 * No `withSystemPrompt`: the picker returns well within the app lock's 30 s grace period.
 */
export async function pickImages(limit: number): Promise<string[]> {
  if (limit <= 0) return [];
  const result = await launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    quality: 1,
  });
  if (result.canceled) return [];
  // Some Android pickers ignore selectionLimit.
  return result.assets.map((a) => a.uri).slice(0, limit);
}
