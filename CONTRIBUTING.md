# Contributing

SelfJournal is local-only and plugin-based. Features live in plugins under `src/plugins/<id>/`. Read `CLAUDE.md` for the project rules (Android first, no network, no telemetry, theme tokens only).

## Setup
`npm install`, `npm test`, `npx tsc --noEmit`, then `npx expo run:android` for a dev build. Install Expo packages with `npx expo install <pkg>`.

## Adding a plugin
1. Create `src/plugins/<id>/index.ts` exporting a `PluginDefinition` (`id`, `name`, `description`, `icon`, optional `migrations`, `tab`, `activate`). Tab routes are fixed files, so a plugin that needs a new tab also needs a small core edit: append the route to `TAB_ROUTES` in `src/core/plugins/tab-routes.ts` and add `src/app/(tabs)/<route>.tsx` (a test enforces that every route has a file).
2. Add it to `ALL_PLUGINS` in `src/plugins/index.ts`.
3. Put its tables in `migrations` with ids `<id>:NNN` (e.g. `notes:001`). Migrations always run, even when the plugin is turned off; turning a plugin off keeps its data. Never edit an applied migration.
4. Declare events by augmenting `AppEvents` with `declare module "@/core/events/types"`.
5. `activate(ctx)` receives `ctx = { pluginId, db, bus, settings, media }`. `ctx.settings` is private to the plugin (keys are stored under `plugin.<id>.`). Subscribe with `ctx.bus.on(...)`: the host drops every subscription automatically when the plugin is turned off, and a plugin that is off cannot subscribe or emit. A returned cleanup is only for other resources (timers, listeners); you don't need one for bus subscriptions.
6. Never import another plugin. Talk to other plugins only through `EventBus`.
7. Inside `db.transaction(async tx => …)` use only `tx`, never the outer `db`. Never emit or await events inside `db.transaction`; emit after it commits (another plugin's handler using `ctx.db` would deadlock).
8. Colours, spacing, radii and fonts come from `src/theme/tokens.ts`. Add colocated `*.test.ts(x)` tests.

## Contributing entry types
A plugin can add journal entry types with `PluginDefinition.entryTypes`; Journal lists them without importing your plugin.
- `id` must be `<pluginId>.<name>` (e.g. `habits.win`). The host rejects other prefixes, duplicate ids, duplicate field keys, and a `titleField` that isn't a `text` field.
- `fields`: `{ key, label, kind, required?, placeholder? }` where `kind` is `text`, `longText`, `number` or `rating`. Keep validation copy calm.
- `photos: true` shows the photo picker. `titleField` names the `text` field used as the card title.
- `card: { variant: "cover" | "note", tint }`: `cover` shows the first photo big, `note` is text-only; `tint` is one of `sky`, `sage`, `peach`, `lilac`, `sand`, `mint`.
- `templateId` is the canvas template id (used by the future Canvas view); pick a stable short string.
- Entries of a type still list, open and delete if your plugin is later turned off.

## Plugin screens and routes
Put screens in `src/plugins/<id>/screens/` (with colocated tests). Add a thin route file in `src/app/` that only imports and renders the screen, and register it in `src/app/_layout.tsx`. After adding a route, start Metro once so `typedRoutes` regenerates `.expo/types/router.d.ts`. Don't use RN `<Modal>` or `Alert` for confirmations (they render above the lock overlay); use inline views.

## Using `ctx.media`
`ctx.media` is the shared encrypted photo store.
1. `const rec = await ctx.media.importImage(uri)` downscales, encrypts and stores the image and deletes the picker's temp file. It stays `pending` until committed.
2. Inside your own transaction, with `tx`: `await ctx.media.commit(tx, [rec.id])` and write the row that references `rec.id`.
3. After the commit, call `ctx.media.remove(ids)` for photos you dropped or deleted. If the user abandons the screen, remove the imported ids; anything left pending is removed by the boot sweep on a launch at least 24 h later.
4. Show photos with `<MediaImage>` from `@/core/media/media-image`. Never write decrypted bytes to disk. A missing photo rejects with `MediaUnavailableError`; show a calm placeholder.

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
    bus.on("notes.saved", async ({ id }) => {
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
