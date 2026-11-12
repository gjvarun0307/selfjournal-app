import type { AppEvents, EventHandler } from "./types";

export interface EventBusOptions {
  onError?: (err: unknown, type: string) => void;
}

export class EventBus {
  private handlers = new Map<string, Set<EventHandler<any>>>();
  private onError: (err: unknown, type: string) => void;

  constructor(opts: EventBusOptions = {}) {
    this.onError = opts.onError ?? ((err, type) => console.error(`[EventBus] handler for "${type}" failed`, err));
  }

  on<K extends keyof AppEvents>(type: K, handler: EventHandler<K>): () => void {
    const key = type as string;
    let set = this.handlers.get(key);
    if (!set) {
      set = new Set();
      this.handlers.set(key, set);
    }
    // Wrap so the same function subscribed twice yields independent subscriptions.
    const entry: EventHandler<any> = (p) => handler(p);
    set.add(entry);
    return () => {
      set.delete(entry);
    };
  }

  async emit<K extends keyof AppEvents>(type: K, payload: AppEvents[K]): Promise<void> {
    const snapshot = [...(this.handlers.get(type as string) ?? [])];
    await Promise.all(
      snapshot.map(async (h) => {
        try {
          await h(payload);
        } catch (err) {
          try {
            this.onError(err, type as string);
          } catch {
            // onError itself must never break emit
          }
        }
      }),
    );
  }
}
