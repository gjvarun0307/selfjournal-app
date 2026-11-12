import type { Db } from "@/core/db/types";
import type { Migration } from "@/core/db/migrations";
import type { EventBus } from "@/core/events/bus";
import type { AppSettings } from "@/core/settings/app-settings";

export interface PluginContext {
  db: Db;
  bus: EventBus;
  settings: AppSettings;
}

export interface PluginTab {
  route: "index" | "habits" | "recovery" | "me";
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
  /** Subscribe to events here; return a cleanup that undoes the subscriptions. */
  activate?(ctx: PluginContext): (() => void) | void;
}
