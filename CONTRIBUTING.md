# Contributing

SelfJournal is local-only and plugin-based. Features live in plugins under `src/plugins/<id>/`. Read `CLAUDE.md` for the project rules (Android first, no network, no telemetry, theme tokens only).

## Setup
`npm install`, `npm test`, `npx tsc --noEmit`, then `npx expo run:android` for a dev build. Install Expo packages with `npx expo install <pkg>`.

## Adding a plugin
1. Create `src/plugins/<id>/index.ts` exporting a `PluginDefinition` (`id`, `name`, `description`, `icon`, optional `migrations`, `tab`, `activate`).
2. Add it to `ALL_PLUGINS` in `src/plugins/index.ts`.
3. Put its tables in `migrations` with ids `<id>:NNN` (e.g. `notes:001`). Migrations always run, even when the plugin is turned off; turning a plugin off keeps its data. Never edit an applied migration.
4. Declare events by augmenting `AppEvents` with `declare module "@/core/events/types"`.
5. `activate(ctx)` receives `{ db, bus, settings }`. Subscribe with `ctx.bus.on(...)` and return a cleanup that unsubscribes.
6. Never import another plugin. Talk to other plugins only through `EventBus`.
7. Inside `db.transaction(async tx => …)` use only `tx`, never the outer `db`.
8. Colours, spacing, radii and fonts come from `src/theme/tokens.ts`. Add colocated `*.test.ts(x)` tests.

### Example
```ts
import type { PluginDefinition } from "@/core/plugins/types";

declare module "@/core/events/types" {
  interface AppEvents {
    "notes.saved": { id: number };
  }
}

export const notesPlugin: PluginDefinition = {
  id: "notes",
  name: "Notes",
  description: "Quick notes. Nothing here ever resets.",
  icon: "document-text",
  migrations: [{ id: "notes:001", up: "CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);" }],
  activate({ db, bus }) {
    return bus.on("notes.saved", async ({ id }) => {
      await db.run("UPDATE notes SET body = trim(body) WHERE id = ?", [id]);
    });
  },
};
```

## Tone rules
- No streaks that reset. Progress only adds up.
- No shaming or guilt copy. Missed days are neutral.
- No red or alarm styling.
- Notifications use generic text and never name a habit or behaviour.

## Pull requests
Run `npm test` and `npx tsc --noEmit` first. Keep changes small and focused; no network calls, analytics or telemetry.
