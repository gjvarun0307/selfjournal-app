import type { Db } from "@/core/db/types";
import type { Migration } from "@/core/db/migrations";
import type { EventBus } from "@/core/events/bus";
import type { AppEvents, EventHandler } from "@/core/events/types";
import type { AppSettings } from "@/core/settings/app-settings";
import type { TabRoute } from "./tab-routes";

/** Event bus as a plugin sees it: the host owns the subscriptions and drops them when the plugin is turned off. */
export interface PluginBus {
  on<K extends keyof AppEvents>(type: K, handler: EventHandler<K>): () => void;
  emit<K extends keyof AppEvents>(type: K, payload: AppEvents[K]): Promise<void>;
}

/** Shared services the host is built from. */
export interface CoreServices {
  db: Db;
  bus: EventBus;
  settings: AppSettings;
}

export interface PluginContext {
  pluginId: string;
  db: Db;
  bus: PluginBus;
  /** Private to the plugin: keys are stored under `plugin.<id>.`. */
  settings: AppSettings;
}

export interface PluginTab {
  route: TabRoute;
  title: string;
  icon: string;
  order: number;
}

export interface PluginDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  migrations?: Migration[];
  tab?: PluginTab;
  /** Subscribe via `ctx.bus.on` (dropped automatically on disable). A returned cleanup is only for other resources. */
  activate?(ctx: PluginContext): (() => void) | void;
}
