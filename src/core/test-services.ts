// Test-only: in-memory services shaped like the ones AppProvider boots.
import { createTestDb } from "@/core/db/test-db";
import { EventBus } from "@/core/events/bus";
import { createTestMedia } from "@/core/media/test-media";
import type { CoreServices } from "@/core/plugins/types";
import { createAppSettings } from "@/core/settings/app-settings";

export function createTestServices(): CoreServices {
  const db = createTestDb();
  const settings = createAppSettings(db);
  return { db, bus: new EventBus({ onError: jest.fn() }), settings, media: createTestMedia(db, settings) };
}
