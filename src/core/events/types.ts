/**
 * Event registry. Plugins add events via declaration merging:
 * declare module "@/core/events/types" { interface AppEvents { "x.y": {...} } }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AppEvents {}

export type EventHandler<K extends keyof AppEvents> = (
  payload: AppEvents[K],
) => void | Promise<void>;
