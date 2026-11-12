// Test-only: in-memory services shaped like the ones AppProvider boots.
import { createTestDb } from "@/core/db/test-db";
import { EventBus } from "@/core/events/bus";
import type { CoreServices } from "@/core/plugins/types";
import { createAppSettings } from "@/core/settings/app-settings";

export function createTestServices(): CoreServices {
  const db = createTestDb();
  return { db, bus: new EventBus({ onError: jest.fn() }), settings: createAppSettings(db) };
}
