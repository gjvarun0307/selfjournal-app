import type { PluginDefinition } from "@/core/plugins/types";

import { gamificationPlugin } from "./gamification";
import { habitsPlugin } from "./habits";
import { journalPlugin } from "./journal";
import { lifestatsPlugin } from "./lifestats";
import { recoveryPlugin } from "./recovery";

/** Every plugin the app ships with, in display order. */
export const ALL_PLUGINS: PluginDefinition[] = [
  journalPlugin,
  habitsPlugin,
  recoveryPlugin,
  gamificationPlugin,
  lifestatsPlugin,
];
