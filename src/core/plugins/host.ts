import { CORE_MIGRATIONS } from "@/core/db/core-migrations";
import { runMigrations } from "@/core/db/migrations";
import type { PluginContext, PluginDefinition } from "./types";

export interface PluginHostOptions {
  onError?: (err: unknown, pluginId: string) => void;
}

export class PluginHost {
  private defs = new Map<string, PluginDefinition>();
  private enabled = new Set<string>();
  private cleanups = new Map<string, () => void>();
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private onError: (err: unknown, pluginId: string) => void;

  constructor(
    defs: PluginDefinition[],
    private ctx: PluginContext,
    opts: PluginHostOptions = {},
  ) {
    for (const d of defs) {
      if (this.defs.has(d.id)) throw new Error(`Duplicate plugin id: ${d.id}`);
      this.defs.set(d.id, d);
    }
    this.onError =
      opts.onError ?? ((err, id) => console.error(`[PluginHost] plugin "${id}" failed to activate`, err));
  }

  async start(): Promise<void> {
    await runMigrations(this.ctx.db, CORE_MIGRATIONS);
    for (const d of this.defs.values()) {
      if (d.migrations?.length) await runMigrations(this.ctx.db, d.migrations);
    }
    const rows = await this.ctx.db.all<{ id: string; enabled: number }>("SELECT id, enabled FROM plugin_state");
    const stored = new Map(rows.map((r) => [r.id, r.enabled === 1]));
    for (const id of this.defs.keys()) {
      let on = stored.get(id);
      if (on === undefined) {
        on = true;
        await this.ctx.db.run("INSERT INTO plugin_state (id, enabled) VALUES (?, 1)", [id]);
      }
      if (on) {
        this.enabled.add(id);
        this.activate(id);
      }
    }
  }

  isEnabled(id: string): boolean {
    return this.enabled.has(id);
  }

  list(): PluginDefinition[] {
    return [...this.defs.values()];
  }

  enabledIds(): string[] {
    return [...this.defs.keys()].filter((id) => this.enabled.has(id));
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Calls are serialized so concurrent toggles can never double-activate. */
  setEnabled(id: string, enabled: boolean): Promise<void> {
    const run = this.queue.then(() => this.applyEnabled(id, enabled));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async applyEnabled(id: string, enabled: boolean): Promise<void> {
    if (!this.defs.has(id)) throw new Error(`Unknown plugin id: ${id}`);
    if (this.enabled.has(id) === enabled) return;
    await this.ctx.db.run(
      "INSERT INTO plugin_state (id, enabled) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled",
      [id, enabled ? 1 : 0],
    );
    if (enabled) {
      this.enabled.add(id);
      this.activate(id);
    } else {
      this.enabled.delete(id);
      this.deactivate(id);
    }
    for (const l of [...this.listeners]) l();
  }

  private activate(id: string): void {
    const def = this.defs.get(id)!;
    try {
      const cleanup = def.activate?.(this.ctx);
      if (cleanup) this.cleanups.set(id, cleanup);
    } catch (err) {
      this.onError(err, id);
    }
  }

  private deactivate(id: string): void {
    const cleanup = this.cleanups.get(id);
    this.cleanups.delete(id);
    try {
      cleanup?.();
    } catch (err) {
      this.onError(err, id);
    }
  }
}
