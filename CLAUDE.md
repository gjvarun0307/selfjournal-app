# SelfJournal

Local-only, encrypted, plugin-based self-help/journal app. Expo SDK 58, Expo Router, TypeScript, Jest (jest-expo). Android first, open source.
Spec: `docs/superpowers/specs/2026-11-11-selfjournal-app-design.md` · Roadmap: `docs/superpowers/plans/2026-11-12-roadmap.md` · Plans: `docs/superpowers/plans/`.
Plans run task-by-task with `superpowers:subagent-driven-development`; progress = checked boxes in the plan + `git log`.

## Commands
- `npm test` (jest) · `npx tsc --noEmit` · `npx expo lint` · `npx expo run:android` (dev build; needs a device/emulator).
- `android/` and `ios/` are generated (CNG), not committed. After changing native config/plugins: `npx expo prebuild --clean`.
- Install Expo packages with `npx expo install <pkg>`; non-Expo dev-only with `npm i -D`.
- Expo APIs change per SDK: read docs for the `expo` major in `package.json` (https://docs.expo.dev/versions/v58.0.0/, https://docs.expo.dev/llms.txt). Never answer from memory.
- Load the relevant installed expo skills (expo-overview, expo-router, expo-ui, expo-native-ui, expo-design-system, expo-animation) before UI/Expo work. Don't install new skills without asking the user.

## Folder map (`@/` = `src/`)
- `src/app/` Expo Router routes only (`(tabs)/`, `settings/` incl. `settings/reminders`, `journal/` (`new`, `edit`, `[id]`), `onboarding.tsx`, `_layout.tsx`); thin, they render `src/screens/*` or `src/plugins/<id>/screens/*`.
- `src/screens/` screens: `lock/` (LockGate, `useAppLock`, PIN pad), `onboarding/`, `settings/`.
- `src/core/db/` `types.ts` (`Db`), `serialized-db.ts` (FIFO + transactions), `migrations.ts`, `core-migrations.ts`, `expo-db.ts` (SQLCipher), `test-db.ts` (better-sqlite3 for tests).
- `src/core/security/` `db-key.ts` (key in SecureStore), `pin.ts` (PBKDF2 hash, grace period), `app-lock-store.ts`.
- `src/core/entry-types/` `types.ts` (`EntryTypeDefinition`, field kinds), `validate.ts` (type-id/field checks, `normalizeFields`). Plugins contribute types via `PluginDefinition.entryTypes`.
- `src/core/media/` encrypted photo store: `media-store.ts` (import/commit/load/remove/sweep), `expo-media.ts` (AES-GCM, files in `files/media/<id>.full|.thumb`), `test-media.ts`, `use-media-uri.ts`, `media-image.tsx` (`<MediaImage>`).
- `src/core/events/` `bus.ts` (`EventBus`), `types.ts` (`AppEvents`, augmented per plugin).
- `src/core/plugins/` `types.ts` (`PluginDefinition`, `PluginContext`, `PluginTab`), `host.ts` (migrations + activation), `tabs.ts`, `use-enabled-ids.ts`.
- `src/core/settings/app-settings.ts` key/value settings in the DB. `src/core/app-provider.tsx` boots services; hooks `useHost`, `useBus`, `useAppSettings`, `useEnabledPlugins`.
- `src/plugins/<id>/index.ts` one plugin each; its screens in `src/plugins/<id>/screens/`; `src/plugins/index.ts` exports `ALL_PLUGINS`.
- `src/theme/` `tokens.ts` (single source of colours/spacing/radii/fonts), `use-theme.ts`.
- Tests colocated: `foo.ts` -> `foo.test.ts(x)`.

## Global constraints
- Android first; iOS not a release target; **no web**. Don't add `.web.tsx` variants.
- Local-only data. No backend, no accounts, no analytics, no telemetry. **No network calls in this plan.**
- **No `expo-updates` / EAS Update.** (Ignore the old template advice on EAS cloud builds/`eas update`/bun.)
- Install Expo packages with `npx expo install <pkg>`. Non-Expo dev-only packages with `npm i -D`.
- Native folders (`android/`, `ios/`) are generated (CNG) and **not committed**.
- Android Auto Backup must be off: `android:allowBackup="false"`.
- Database encrypted with SQLCipher; key generated on first launch, stored via `expo-secure-store`, **never derived from the PIN**.
- Notifications (later plans) use generic text and never name a habit or behaviour.
- No streaks that reset, no shaming copy, no red alarm styling anywhere.
- Colours, spacing, radii and fonts come from `src/theme/tokens.ts`. No hard-coded colour literals in components.
- Plugins never import another plugin's internals. They communicate only via `EventBus` and their `PluginDefinition`.
- Plugin ids: `journal`, `habits`, `recovery`, `gamification`, `lifestats`. All enabled on first launch.
- Turning a plugin off keeps its data. Its migrations still run, and only its activation stops.
- File names kebab-case; tests colocated as `*.test.ts(x)` beside the file.

## Gotchas
- Inside `db.transaction(async tx => …)` use ONLY `tx`. Calling the outer `db` inside the callback deadlocks (the transaction holds the queue).
- Never emit or await events inside `db.transaction`; emit after it commits. A handler in another plugin that uses `ctx.db` would wait on the transaction's queue while the transaction waits on the handler: deadlock.
- Any RN `<Modal>` or `Alert` renders above the app-lock overlay. Screens that open one must close it when the app locks (`locked` from `useAppLock()`).
- With app lock on, FLAG_SECURE (expo-screen-capture) blocks screenshots and Recents thumbnails. To check locked states on a device use `uiautomator dump`, not screencap.
- Check DB encryption on device: `adb exec-out run-as app.selfjournal head -c 16 files/SQLite/selfjournal.db | xxd` must NOT start with "SQLite format 3". (The quoted `adb shell … sh -c '…'` form silently prints nothing.)
- Decrypted media only ever exists as in-memory `data:` URIs shown through `<MediaImage>` (expo-image `cachePolicy="none"`). Never write decrypted bytes to disk. Picker/manipulator temp files are deleted right after import.
- `typedRoutes` needs Metro to regenerate `.expo/types/router.d.ts` after you add a route file; `tsc` fails on `router.push("/new/route")` until Metro has run once (or the route file exists and Metro restarted).
- Migration ids are `<owner>:NNN` (`core:001`, `habits:001`). Never edit an applied migration; add a new one.

## Adding a plugin
See `CONTRIBUTING.md`.
