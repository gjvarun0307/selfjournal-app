# Plan 2: Journal (data + Cards) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working journal. Pick a day, add entries of 8 built-in types with fields and photos, see them as themed cards, open, edit and delete them. Photos are stored encrypted, and one gentle daily reminder fires. First, settle the plugin context API that every later plugin builds on.

**Architecture:** Entry types are a core concept (`src/core/entry-types/`) that any plugin can contribute via `PluginDefinition.entryTypes`, so Habits and Recovery declare their types without importing Journal. Media is a core service (`src/core/media/`): images are downscaled, encrypted per file with native AES-256-GCM (expo-crypto), written to app-private storage, and shown only as in-memory data URIs. Journal owns its tables, a `JournalService` (repo + events) and its screens under `src/plugins/journal/`. Each plugin gets its own `PluginContext` from the host: settings scoped under its prefix, and bus subscriptions the host tracks and drops on disable.

**Tech Stack:** Existing Plan 1 stack, plus `expo-image-picker`, `expo-image-manipulator` and `expo-notifications` (via `npx expo install`). Also used: `expo-crypto` AES (`aesEncryptAsync`/`aesDecryptAsync`, already installed), `expo-image` (installed), and `@expo/ui/jetpack-compose` `TimePickerDialog` (installed).

**Spec:** `docs/superpowers/specs/2026-11-11-selfjournal-app-design.md` (§4.1, §4.3, §6.1, §6.2 cards half, §6.5, §11.1 media, §11.4) · Plan 1 outcome: `docs/superpowers/plans/2026-11-12-plan-01-outcome.md`

## Decisions in this plan (check these)

| # | Decision | Alternative |
|---|---|---|
| P1 | Photos are downscaled on import (full: 2048 px long edge, JPEG 0.85; thumb: 512 px, JPEG 0.8). Each file is encrypted with AES-256-GCM. The media key is a random 32-byte key stored **inside the encrypted DB** (`app_settings` key `media.key`), so a Plan 8 backup carries it. Originals are not kept. | Keep originals (bigger, slower to decrypt). |
| P2 | Photos are picked from the gallery only, through the Android photo picker, which needs no storage permission. No camera in this plan. | Add "Take photo" (needs the CAMERA permission). |
| P3 | Daily reminder: on by default at **20:00**, text "Time to check in.", one repeating `DAILY` trigger. It fires even on days you've already written. Permission is asked once, the first time the Journal tab opens. | Skip days that already have an entry (needs per-day one-off triggers). |
| P4 | Entries can be added to today and any past day, not future days. An entry's day never changes. | Allow moving an entry to another day. |
| P5 | No Cards⇄Canvas toggle until Plan 7; no "View as canvas frame" button yet. `templateId` is stored on each entry type for Plan 7. | n/a |
| P6 | A plugin's screens live in `src/plugins/<id>/screens/`. Route files in `src/app/` stay thin and import them. | `src/screens/<id>/`. |

## Global Constraints

- Android first; iOS not a release target; **no web**. Don't add `.web.tsx` variants.
- Local-only data. No backend, no accounts, no analytics, no telemetry. **No network calls in this plan.**
- **No `expo-updates` / EAS Update.**
- Install Expo packages with `npx expo install <pkg>`. Non-Expo dev-only packages with `npm i -D`. After adding packages with config plugins: `npx expo prebuild --clean`.
- Native folders (`android/`, `ios/`) are generated (CNG) and **not committed**.
- Database encrypted with SQLCipher. **Media encrypted at rest. Decrypted image bytes never touch disk:** display via in-memory `data:` URIs with `expo-image` `cachePolicy="none"`. Temp files from the picker or manipulator are deleted right after import.
- Notifications use generic text and never name a habit or behaviour. Reminder copy is exactly title `SelfJournal`, body `Time to check in.`
- No streaks that reset, no shaming copy, no red alarm styling anywhere. Validation messages are calm and use `textMuted`/`caution`, never red.
- Colours, spacing, radii and fonts come from `src/theme/tokens.ts`. No hard-coded colour literals in components.
- Plugins never import another plugin's internals. They communicate only via `EventBus` and their `PluginDefinition`.
- Inside `db.transaction(async tx => …)` use only `tx`. Never emit events inside a transaction; emit after it commits.
- Journal screens use **no RN `<Modal>` or `Alert`**: confirmations are inline views, so they sit under the lock overlay. The only dialog is the reminder `TimePickerDialog`, which must close when `useAppLock().locked` turns true.
- Commit messages are plain conventional commits with **no trailers** (no `Claude-Session:`, no `Co-Authored-By:`).
- File names kebab-case; tests colocated as `*.test.ts(x)` beside the file.

## Review Focus

1. **Photo import interrupted** (user backs out of the editor, app killed mid-import, picker cancelled). No plaintext copy stays in the cache, imported-but-unsaved media is removed (on leave) or swept (on next boot), and no entry ever points at a missing media row. Tests in Task 3 (sweep, failed write) and Task 6 (leave discards).
2. **Day boundaries.** `shiftDay` must be correct across DST changes (use calendar fields, not `± 86_400_000`). An app left open past midnight must show the new "Today" when it returns to the foreground. Tests in Task 4 (`shiftDay` across 2026-03-29 and 2026-10-25) and Task 5 (`useToday` on `AppState` active).
3. **A photo can't be decrypted or its file is gone.** The card or detail view shows a calm placeholder and the rest of the entry still renders. No crash, no red. Tests in Task 3 (`load` rejects with `MediaUnavailableError`) and Task 5 (card shows placeholder).
4. **An entry whose type's plugin is off, or whose type no longer exists.** It still lists, opens and can be deleted. An unknown type shows a generic card and has no Edit button. Fields the current form doesn't know are preserved on edit. Tests in Task 2 (`entryType` finds disabled plugins' types), Task 5 (fallback card), Task 6 (unknown keys survive edit) and Task 7 (no Edit for unknown type).
5. **The app locks while the editor, a delete confirm or the time picker is open.** Nothing renders above the lock overlay and typed text is still there after unlock. Tests in Task 6 (editor has no Modal; draft survives a `locked` toggle) and Task 8 (time picker closes when `locked`).

---

## File Structure

```
src/
  app/
    _layout.tsx                         # + journal/new, journal/edit, journal/[id], settings/reminders screens
    (tabs)/index.tsx                    # renders JournalDayScreen
    journal/new.tsx  journal/edit.tsx  journal/[id].tsx
    settings/index.tsx                  # + Reminders row (when journal on)
    settings/reminders.tsx
  core/
    test-services.ts                    # createTestServices() for tests (db, bus, settings, media fake)
    plugins/types.ts                    # PluginContext/PluginBus/PluginDefinition.entryTypes
    plugins/tab-routes.ts               # TAB_ROUTES, TabRoute
    plugins/host.ts                     # contextFor(), entryTypes(), entryType(), fixes
    settings/app-settings.ts            # + scopedSettings()
    entry-types/types.ts  entry-types/validate.ts
    media/types.ts  media/media-store.ts  media/expo-media.ts  media/test-media.ts
    media/use-media-uri.ts  media/media-image.tsx
    db/core-migrations.ts               # + core:002 media
    app-provider.tsx                    # + media service, useMedia(), usePluginContext()
  plugins/
    journal/index.ts  journal/entry-types.ts  journal/days.ts  journal/journal-service.ts
    journal/reminder.ts  journal/notifier.ts  journal/pick-images.ts  journal/use-journal.ts
    journal/screens/{day-screen,entry-card,type-picker-screen,entry-editor-screen,field-input,
                     rating,photo-editor,entry-detail-screen,inline-confirm,reminder-settings-screen}.tsx
    habits/entry-types.ts  recovery/entry-types.ts
  theme/tokens.ts                       # + tints
```

---

### Task 1: Plugin context API (scoped settings, host-owned subscriptions, tab routes)

**Files:**
- Create: `src/core/plugins/tab-routes.ts`, `src/core/plugins/tab-routes.test.ts`, `src/core/test-services.ts`
- Modify: `src/core/plugins/types.ts`, `src/core/plugins/host.ts`, `src/core/plugins/host.test.ts`, `src/core/plugins/tabs.ts`, `src/core/settings/app-settings.ts`, `src/core/settings/app-settings.test.ts`, `src/core/app-provider.tsx`, tests that construct `PluginHost` (`plugins.test.tsx`, `app-provider.test.tsx`), `CONTRIBUTING.md` (§ Adding a plugin)

**Interfaces:**
- Produces:
  - `scopedSettings(settings: AppSettings, prefix: string): AppSettings`. Every key is stored as `prefix + key`. An empty key throws.
  - `interface PluginBus { on<K extends keyof AppEvents>(type: K, handler: EventHandler<K>): () => void; emit<K extends keyof AppEvents>(type: K, payload: AppEvents[K]): Promise<void>; }`
  - `interface CoreServices { db: Db; bus: EventBus; settings: AppSettings; }` (Task 3 adds `media`)
  - `interface PluginContext { pluginId: string; db: Db; bus: PluginBus; settings: AppSettings /* scoped "plugin.<id>." */; }` (Task 3 adds `media`)
  - `new PluginHost(defs, services: CoreServices, opts?)` (was `ctx`); `host.contextFor(id: string): PluginContext`. The returned object is the same on every call for an id; an unknown id throws.
  - `TAB_ROUTES = ["index", "habits", "recovery", "me"] as const`, `type TabRoute`, and `PluginTab.route: TabRoute`.
  - `createTestServices(): CoreServices`. It uses `createTestDb()` and an `EventBus` with `onError: jest.fn()`.
  - `usePluginContext(id: string): PluginContext` from `app-provider.tsx`.

- [ ] **Step 1: Write the failing tests**

`app-settings.test.ts`:
```ts
it("scopedSettings prefixes keys and cannot see other keys", async () => {
  const base = createAppSettings(createTestDb()); // after core migrations
  await base.set("lock.pinHash", "secret");
  const s = scopedSettings(base, "plugin.journal.");
  await s.setMany({ "reminder.time": "20:00" });
  expect(await base.get("plugin.journal.reminder.time")).toBe("20:00");
  expect(await s.get("lock.pinHash")).toBeNull();
  await expect(s.set("", "x")).rejects.toThrow();
});
```
`host.test.ts`, new cases:
- `"contextFor gives each plugin scoped settings"`: `contextFor("a").settings.set("k","1")` stores `plugin.a.k`. `contextFor("a") === contextFor("a")`. `contextFor("zzz")` throws.
- `"host drops a plugin's subscriptions on disable without a cleanup"`: `activate(ctx) { ctx.bus.on("test.ping", h) }` with no return value. After `setEnabled("a", false)`, `bus.emit("test.ping",{n:1})` → `h` not called. Re-enable → one emit = exactly one call.
- `"a disabled plugin's context neither subscribes nor emits"`: while "a" is off, `contextFor("a").bus.on(...)` returns a function and the handler never fires. `contextFor("a").bus.emit(...)` resolves and delivers nothing.
- `"a throwing change listener does not reject setEnabled"`: `host.subscribe(() => { throw new Error("x") })`. `setEnabled` resolves, and `onError` is called.
- `"start() is serialized with setEnabled"`: `const p = host.start(); const q = host.setEnabled("a", false); await Promise.all([p,q])` → `isEnabled("a") === false`, and `activate` was called once and cleaned up once.
- `"visibleTabs returns a fresh Me tab"`: mutating the returned Me tab doesn't change the next call's result.

`tab-routes.test.ts`:
```ts
it("every tab route has a file in src/app/(tabs)", () => {
  for (const r of TAB_ROUTES)
    expect(fs.existsSync(path.join(__dirname, "../../app/(tabs)", `${r}.tsx`))).toBe(true);
});
```

- [ ] **Step 2: Run them to see them fail.** Run: `npx jest src/core` (expected: FAIL; `scopedSettings`, `contextFor` and `TAB_ROUTES` aren't defined).

- [ ] **Step 3: Implement.**
  - `scopedSettings` in `app-settings.ts`.
  - Types in `types.ts`.
  - `tab-routes.ts`.
  - Host: build one `PluginContext` per plugin in the constructor. Its `bus.on` checks `isEnabled(id)`: when off it returns a no-op; when on it subscribes via the real `EventBus` and records the unsubscribe in `subscriptions: Map<id, Set<() => void>>`. Its `bus.emit` returns early when the plugin is off. `deactivate` runs the plugin's cleanup, then every recorded unsubscribe. `activate` receives `contextFor(id)`. `start()` goes through the same queue as `setEnabled`. Listener calls are wrapped in try/catch → `onError(err, id)`.
  - `visibleTabs` returns `{ ...ME_TAB }`.
  - Update `AppProvider.bootServices` to pass `{ db, bus, settings }`, and add `usePluginContext`.
  - Update every `new PluginHost(...)` in tests to use `createTestServices()`.

- [ ] **Step 4: Run all tests and the typecheck.** Run: `npm test && npx tsc --noEmit` (expected: all pass).

- [ ] **Step 5: Update CONTRIBUTING.md § Adding a plugin.** Document:
  - `ctx = { pluginId, db, bus, settings }`;
  - settings are private to the plugin;
  - subscriptions are dropped automatically on disable, and the cleanup is only for other resources;
  - adding a tab = append to `TAB_ROUTES` + add `src/app/(tabs)/<route>.tsx` (the test enforces it).

  Update the example to match.

- [ ] **Step 6: Commit**
```bash
git add -A src CONTRIBUTING.md
git commit -m "feat(core): per-plugin context with scoped settings and host-owned subscriptions"
```

---

### Task 2: Entry-type registry and the 8 built-in types

**Files:**
- Create: `src/core/entry-types/types.ts`, `src/core/entry-types/validate.ts`, `src/core/entry-types/validate.test.ts`, `src/plugins/journal/entry-types.ts`, `src/plugins/habits/entry-types.ts`, `src/plugins/recovery/entry-types.ts`
- Modify: `src/core/plugins/types.ts` (`entryTypes?`), `src/core/plugins/host.ts`, `src/core/plugins/host.test.ts`, the three plugin `index.ts` files, `src/plugins/index.test.ts`

**Interfaces:**
- Consumes: `PluginHost` from Task 1.
- Produces (`src/core/entry-types/types.ts`):
```ts
export type EntryFieldKind = "text" | "longText" | "number" | "rating";
export interface EntryField { key: string; label: string; kind: EntryFieldKind; required?: boolean; placeholder?: string; }
export type CardVariant = "cover" | "note";
export type CardTint = "sky" | "sage" | "peach" | "lilac" | "sand" | "mint";
export interface EntryTypeDefinition {
  id: string;            // "<pluginId>.<name>"
  name: string; description: string;
  icon: string;          // Ionicons base name; "-outline" is appended where needed
  fields: EntryField[];
  photos: boolean;
  titleField?: string;   // key of a "text" field used as the card title
  card: { variant: CardVariant; tint: CardTint };
  templateId: string;    // canvas template id, used in Plan 7
}
export type EntryFieldValue = string | number | null;
export type EntryFields = Record<string, EntryFieldValue>;
```
  - `validateEntryTypes(pluginId: string, types: EntryTypeDefinition[]): void`. It throws when: an id lacks the `pluginId.` prefix, an id is duplicated, a field key is duplicated, or `titleField` isn't a `text` field of that type.
  - `normalizeFields(type, raw: Record<string, string>, photoCount: number): { fields: EntryFields; errors: Record<string, string>; empty: boolean }`. Text is trimmed and `""` → `null`. `number` is parsed (comma or dot decimal, ≥ 0). `rating` must be an integer 1–5; anything else becomes `null` with no error, since ratings only come from taps. Stored values are passed in as `String(v ?? "")`. Error copy:
    - required and empty → `"This one's needed to save."`
    - bad number → `"Use a number, like 2.5."`

    `empty` = no non-null field and `photoCount === 0`.
  - `host.entryTypes(): EntryTypeDefinition[]` returns the types of enabled plugins, in plugin order. `host.entryType(id): EntryTypeDefinition | undefined` searches every plugin, enabled or not. Duplicate type ids across plugins throw in the constructor.
  - `PluginDefinition.entryTypes?: EntryTypeDefinition[]`

- [ ] **Step 1: Write the failing tests.** `validate.test.ts`:
  - a prefix mismatch, a duplicate field key and a bad `titleField` each throw;
  - `normalizeFields`: `"  Hades "` → `"Hades"`; `"2,5"` → `2.5`; `"-1"` and `"abc"` give the number error; a required empty field gives the required error; all-blank with 0 photos → `empty: true`; all-blank with 1 photo → `empty: false`.

  `host.test.ts`:
  - `entryTypes()` excludes types of a disabled plugin;
  - `entryType()` still finds them;
  - two plugins sharing a type id throws.

  `plugins/index.test.ts`:
```ts
expect(ALL_PLUGINS.flatMap(p => p.entryTypes ?? []).map(t => t.id)).toEqual([
  "journal.day", "journal.game", "journal.cooked", "journal.outing", "journal.feelings",
  "habits.win", "recovery.note", "recovery.slip",
]);
```
- [ ] **Step 2: Run them to see them fail.** Run: `npx jest src/core/entry-types src/core/plugins src/plugins` (expected: FAIL).
- [ ] **Step 3: Implement.** Write the validation functions and the host methods; the host calls `validateEntryTypes` per plugin. Then define the built-in types exactly as below (`templateId` = the part after the dot):

| id | name | icon | fields (key: kind, label) | photos | title | card |
|---|---|---|---|---|---|---|
| journal.day | How was the day | sunny | text: longText "How was the day?" | yes | – | note / sage |
| journal.game | Game cleared | game-controller | game: text "Game" (required); hours: number "Hours played"; rating: rating "Rating"; remember: longText "What I want to remember" | yes | game | cover / lilac |
| journal.cooked | Cooked something | restaurant | dish: text "Dish" (required); rating: rating "Rating"; notes: longText "Notes" | yes | dish | cover / peach |
| journal.outing | Outing / place | map | place: text "Place" (required); notes: longText "Notes" | yes | place | cover / sky |
| journal.feelings | Feelings | heart | text: longText "What's on your mind?" | yes | – | note / sand |
| habits.win | Habit win | checkmark-circle | habit: text "Habit"; note: longText "Note" | yes | habit | note / mint |
| recovery.note | Recovery note | document-text | about: text "Where from" (placeholder "Therapy, a meeting, my sponsor…"); text: longText "What came up" | no | about | note / sand |
| recovery.slip | Slip reflection | leaf | happened: longText "What happened"; feel: longText "How I feel" | no | – | note / lilac |

Descriptions are one kind sentence each. `recovery.slip`: "Only if it helps. You can leave any of it blank."
- [ ] **Step 4: Run all tests and the typecheck.** Run: `npm test && npx tsc --noEmit` (expected: pass).
- [ ] **Step 5: Commit** `git commit -m "feat: entry-type registry and the eight built-in entry types"`

---

### Task 3: Encrypted media store

**Files:**
- Create: `src/core/media/types.ts`, `media-store.ts`, `media-store.test.ts`, `expo-media.ts`, `test-media.ts`, `use-media-uri.ts`, `media-image.tsx`, `media-image.test.tsx`
- Modify: `src/core/db/core-migrations.ts` (add `core:002`), `src/core/plugins/types.ts` + `host.ts` (`media` in `CoreServices` and `PluginContext`), `src/core/test-services.ts`, `src/core/app-provider.tsx`
- Install: `npx expo install expo-image-manipulator`

**Interfaces:**
- Consumes: `CoreServices`, `createTestServices` (Task 1).
- Produces (`src/core/media/types.ts`):
```ts
export interface MediaRecord { id: string; mime: "image/jpeg"; width: number; height: number; }
export type MediaSize = "full" | "thumb";
export class MediaUnavailableError extends Error {}
export interface MediaStore {
  /** Downscales, encrypts and stores an image, then deletes `sourceUri` (only if it is under the cache dir). Stays `pending` until committed. */
  importImage(sourceUri: string): Promise<MediaRecord>;
  /** Call inside the owner's transaction with its `tx`: marks pending media as kept. */
  commit(tx: Db, ids: string[]): Promise<void>;
  info(id: string): Promise<MediaRecord | null>;
  /** `data:image/jpeg;base64,…` of the decrypted image. Rejects with MediaUnavailableError. */
  load(id: string, size: MediaSize): Promise<string>;
  /** Deletes rows, then files. Unknown ids are ignored. */
  remove(ids: string[]): Promise<void>;
  /** Removes pending rows older than 24 h (and their files) and files with no row. */
  sweep(): Promise<void>;
}
export interface MediaCipher { encrypt(plain: Uint8Array): Promise<Uint8Array>; decryptToBase64(sealed: Uint8Array): Promise<string>; }
export interface MediaFiles { write(name: string, bytes: Uint8Array): Promise<void>; read(name: string): Promise<Uint8Array>; remove(name: string): Promise<void>; list(): Promise<string[]>; }
export interface ImagePrep { prepare(uri: string, maxEdge: number, compress: number): Promise<{ bytes: Uint8Array; width: number; height: number }>; discard(uri: string): Promise<void>; }
```
  - `createMediaStore(deps: { db: Db; settings: AppSettings; files: MediaFiles; cipherFor(keyHex: string): Promise<MediaCipher>; prep: ImagePrep; randomId(): string; randomHex(): string; now?(): number }): MediaStore`
  - `expo-media.ts`:
    - `expoMediaFiles()` (dir `Paths.document/media/`, file names `<id>.full` and `<id>.thumb`, `Directory.create` idempotent);
    - `expoCipherFor(keyHex)` (`AESEncryptionKey.import(hex,"hex")`; encrypt → `sealed.combined()`; decrypt → `AESSealedData.fromCombined(bytes)` then `aesDecryptAsync(..., { output: "base64" })`);
    - `expoImagePrep` (`ImageManipulator.manipulate(uri, { maxWidth: maxEdge, maxHeight: maxEdge })` → `renderAsync()` → `saveAsync({ format: JPEG, compress })` → read bytes → delete the saved temp file; `discard` deletes only `file://` URIs under `Paths.cache`).
  - `test-media.ts`:
    - `createTestMedia(db, settings)`, built from in-memory `MediaFiles`;
    - a Node `crypto` AES-256-GCM cipher using the same layout (12-byte IV | ciphertext | 16-byte tag);
    - an `ImagePrep` fake that returns fixed JPEG-like bytes (`FF D8 FF …`) and records discards.

    `createTestServices()` now includes `media`.
  - `useMediaUri(id: string, size: MediaSize): { status: "loading" } | { status: "ready"; uri: string } | { status: "missing" }`
  - `<MediaImage id size style? />` uses `expo-image` with `cachePolicy="none"`. When missing it shows a calm placeholder: an `image-outline` icon on `surfaceAlt`, labelled "This photo can't be shown right now".
  - `useMedia(): MediaStore` from `app-provider.tsx`; `PluginContext.media`.
  - Migration `core:002`: `CREATE TABLE media (id TEXT PRIMARY KEY, mime TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, pending INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);`
  - The media key lives in core `app_settings` under `media.key`. It is created lazily, once: the promise is memoized, the key is written with `INSERT … ON CONFLICT DO NOTHING`, then re-read. It is unreachable from plugin-scoped settings.

- [ ] **Step 1: Write the failing tests** in `media-store.test.ts`, using `createTestServices()` after `runMigrations(CORE_MIGRATIONS)`:
  - `"stores encrypted bytes, never the JPEG"`: after `importImage`, every stored file's bytes ≠ the prepared bytes and don't start with `FF D8 FF`. `load(id,"full")` starts with `data:image/jpeg;base64,` and decodes to the prepared bytes.
  - `"deletes the picked source file"`: `prep.discard` was called with the source URI.
  - `"one key, even with concurrent imports"`: `Promise.all` of 3 imports → exactly one `media.key` row, and all 3 load.
  - `"a failed file write leaves no row"`: `files.write` rejects on `.thumb` → `importImage` rejects, `SELECT count(*) FROM media` = 0, and no `.full` file is left.
  - `"sweep removes stale pending media and orphan files, keeps committed"`: one committed, one pending at now−25 h, one pending at now−1 h, plus an orphan file `x.full` → after `sweep()`, the committed and 1 h-old media remain, and the other row and its files plus `x.full` are gone.
  - `"load of a missing file rejects with MediaUnavailableError"`.

  `media-image.test.tsx`: a missing id renders the placeholder label.
- [ ] **Step 2: Run them to see them fail.** Run: `npx jest src/core/media` (expected: FAIL).
- [ ] **Step 3: Implement** `media-store.ts`. Import order: prep full → prep thumb → encrypt both → write both files → insert the row (`pending = 1`). On any failure, remove the files already written and rethrow. `discard(source)` runs in `finally`. Keep an in-memory LRU of loaded data URIs (60 thumbs, 4 fulls), cleared on `remove`. Then write `expo-media.ts`, `test-media.ts`, the hook and the component. Wire boot as `media = createMediaStore({...expo deps})` and pass it into `PluginHost`. After `host.start()`, run `media.sweep().catch(e => console.warn(...))`; sweep failures must not block boot.
- [ ] **Step 4: Run all tests and the typecheck.** Run: `npm test && npx tsc --noEmit` (expected: pass).
- [ ] **Step 5: Commit** `git commit -m "feat(core): encrypted media store with AES-GCM and pending-media sweep"`

---

### Task 4: Journal data: days, entries, service, `journal.entryCreated`

**Files:**
- Create: `src/plugins/journal/days.ts`, `days.test.ts`, `journal-service.ts`, `journal-service.test.ts`, `use-journal.ts`
- Modify: `src/plugins/journal/index.ts` (migration and event declaration)

**Interfaces:**
- Consumes: `PluginContext` with `media` (Tasks 1 and 3); `normalizeFields` and `EntryFields` (Task 2); `host.entryType` (Task 2).
- Produces:
  - `days.ts`:
    - `type DayKey = string` (`"YYYY-MM-DD"`, local time);
    - `dayKey(d: Date): DayKey`;
    - `shiftDay(day: DayKey, n: number): DayKey` (via `new Date(y, m-1, d+n)`);
    - `dayLabel(day: DayKey, today: DayKey): string`. It returns `"Today"`, `"Yesterday"` or `toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })`, with `year: "numeric"` added when the year differs from today's.
  - Migration `journal:001`:
```sql
CREATE TABLE journal_entries (id TEXT PRIMARY KEY, day TEXT NOT NULL, type_id TEXT NOT NULL,
  fields TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX journal_entries_day ON journal_entries (day, created_at);
CREATE TABLE journal_entry_photos (entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (entry_id, media_id));
```
  - Event: `"journal.entryCreated": { entryId: string; typeId: string; day: DayKey }`
  - `journal-service.ts`:
```ts
export interface JournalEntry { id: string; day: DayKey; typeId: string; fields: EntryFields; photoIds: string[]; createdAt: number; updatedAt: number; }
export interface EntryInput { day: DayKey; typeId: string; fields: EntryFields; photoIds: string[]; }
export class EntryInvalidError extends Error {}
export interface JournalService {
  listDay(day: DayKey): Promise<JournalEntry[]>;           // created_at ascending
  get(id: string): Promise<JournalEntry | null>;
  create(input: EntryInput): Promise<JournalEntry>;
  update(id: string, change: { fields: EntryFields; photoIds: string[] }): Promise<JournalEntry>;
  remove(id: string): Promise<void>;
  subscribe(listener: () => void): () => void;             // any create/update/remove
}
export function createJournalService(ctx: PluginContext, lookupType: (id: string) => EntryTypeDefinition | undefined,
  opts?: { now?(): number; randomId?(): string }): JournalService;
export function getJournalService(ctx: PluginContext, lookupType: ...): JournalService; // memoized per ctx
```
  - `useJournal(): JournalService` in `use-journal.ts` = `getJournalService(usePluginContext("journal"), id => useHost().entryType(id))`. Hooks are called at the top level, not inside the arrow.

- [ ] **Step 1: Write the failing tests.**
  - `days.test.ts`:
    - `shiftDay("2026-03-28", 1) === "2026-03-29"` and `shiftDay("2026-03-29", 1) === "2026-03-30"`, with `process.env.TZ = "Europe/London"` set in the file before imports;
    - same for `2026-10-24…26`;
    - `shiftDay("2026-01-01", -1) === "2025-12-31"`;
    - `dayLabel(today, today) === "Today"`, and yesterday → `"Yesterday"`.
  - `journal-service.test.ts`, with `createTestServices()` plus a host running the real `ALL_PLUGINS`:
    - `create` stores fields and photos in order, commits media (`pending = 0`), and emits `journal.entryCreated` **after** the row is readable: the handler calls `service.get(entryId)` and gets the entry;
    - a `create` with an unknown type or with `empty` fields rejects with `EntryInvalidError`;
    - `update` merges fields (`{ legacy: "x" }` survives an update that doesn't mention it), commits new photos and removes dropped photos' media;
    - `remove` deletes the entry and its photo rows and removes its media; other entries are untouched;
    - `listDay` returns only that day's entries, in creation order;
    - a `subscribe` listener fires once per change.
- [ ] **Step 2: Run them to see them fail.** Run: `npx jest src/plugins/journal` (expected: FAIL).
- [ ] **Step 3: Implement.**
  - `create`: validate with `normalizeFields` against the type, using the `String()` of stored values. Inside `db.transaction`, insert the entry and photos and run `ctx.media.commit(tx, photoIds)`. After the commit, `ctx.bus.emit` and notify listeners.
  - `update` / `remove`: compute the removed media ids, delete the photo rows explicitly (don't rely on `ON DELETE CASCADE`; the test DB has foreign keys off), then call `ctx.media.remove(removed)` after the commit.
  - Ids come from `expo-crypto` `randomUUID()` by default.
- [ ] **Step 4: Run all tests and the typecheck.** Run: `npm test && npx tsc --noEmit` (expected: pass).
- [ ] **Step 5: Commit** `git commit -m "feat(journal): entries, days and journal.entryCreated"`

---

### Task 5: Cards view (Journal tab)

**Files:**
- Create: `src/plugins/journal/screens/day-screen.tsx`, `day-screen.test.tsx`, `entry-card.tsx`, `rating.tsx`, `src/plugins/journal/use-today.ts`, `use-today.test.ts`
- Modify: `src/app/(tabs)/index.tsx`, `src/theme/tokens.ts` (`tints`), `src/theme/tokens.test.ts`

**Interfaces:**
- Consumes: `useJournal`, `JournalEntry` and `dayLabel`/`shiftDay` (Task 4); `MediaImage` (Task 3); `host.entryType` (Task 2).
- Produces:
  - `ColorTokens.tints: Record<CardTint, string>` (soft paper tints, light and dark). The token test checks that text on each tint has contrast ≥ 4.5 and that no tint has a red hue (15° < hue < 345°).
  - `useToday(): DayKey`. It re-reads the date on `AppState` → `"active"` and on screen focus.
  - `<EntryCard entry type={EntryTypeDefinition | undefined} onPress />`:
    - **cover**: the first photo thumb (16:9) when present, the title (`titleField` value, else the type name), `<Rating value />` when a rating is set, and the first `longText` value in 2 lines;
    - **note**: a type icon + name label, the title if any, the first `longText` value in 4 lines, and up to 3 thumbs in a row;
    - **unknown type**: `sand` tint, label "Entry", and the non-empty string values.

    Accessibility label: `` `${typeName}: ${title}` ``.
  - `<Rating value onChange? />`: five `star`/`star-outline` Ionicons in `accent`. Interactive when `onChange` is given; each star's label is `"Rate N of 5"`.
  - `<JournalDayScreen />`:
    - header row: ‹ previous day, the `dayLabel`, › next day (disabled on today), and a "Today" chip when not on today;
    - the day's cards in a `FlatList`;
    - an "Add entry" button → `router.push({ pathname: "/journal/new", params: { day } })`;
    - empty-state copy: `"Nothing here yet. Add whatever's on your mind."`

    It reloads on `journal.subscribe`. When the user is on "today" and the date rolls over, it follows the new today.

- [ ] **Step 1: Write the failing tests.** `day-screen.test.tsx` uses a started host + `createTestServices()` + a mocked `expo-router` router.
  - Seeds two entries for today and one for yesterday → today shows 2 cards in order; pressing ‹ shows 1; › is disabled on today.
  - An entry with `typeId: "gone.type"` renders with the label "Entry".
  - An entry whose photo id has no media renders the placeholder label and its title.
  - The empty day shows the empty copy.
  - "Add entry" pushes `/journal/new` with the day.

  `use-today.test.ts`: with fake timers, after crossing midnight and firing an `AppState` "active" change, the hook returns the new day.
- [ ] **Step 2: Run them to see them fail.** Run: `npx jest src/plugins/journal/screens src/plugins/journal/use-today src/theme` (expected: FAIL).
- [ ] **Step 3: Implement** the components above. The tab route renders `<JournalDayScreen />`. Load the expo skills (`expo-design-system`, `expo-native-ui`) first. Use spacing and radii tokens only.
- [ ] **Step 4: Run all tests and the typecheck.** Run: `npm test && npx tsc --noEmit` (expected: pass).
- [ ] **Step 5: Commit** `git commit -m "feat(journal): day cards view"`

---

### Task 6: Create and edit entries (type picker, form, photos)

**Files:**
- Create: `src/app/journal/new.tsx`, `src/app/journal/edit.tsx`, `src/plugins/journal/screens/type-picker-screen.tsx`, `entry-editor-screen.tsx`, `entry-editor-screen.test.tsx`, `field-input.tsx`, `photo-editor.tsx`, `inline-confirm.tsx`, `src/plugins/journal/pick-images.ts`
- Modify: `src/app/_layout.tsx` (add `journal/new` "New entry", `journal/edit` "Entry", `journal/[id]` "Entry" inside the `onboarded` guard)
- Install: `npx expo install expo-image-picker`; add `"expo-image-picker"` to the `app.json` plugins with `"photosPermission": false` and `"cameraPermission": false` (check the v58 option names in the docs). Then run `npx expo prebuild --clean`.

**Interfaces:**
- Consumes: `useJournal`, `host.entryTypes()`/`entryType()`, `normalizeFields`, `ctx.media`, `Rating`, `MediaImage`.
- Produces:
  - `pickImages(limit: number): Promise<string[]>` → `launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: limit, quality: 1 })`. It returns `[]` on cancel. No `withSystemPrompt`: the 30 s lock grace period covers the picker.
  - `MAX_PHOTOS = 12`
  - `<InlineConfirm message confirmLabel cancelLabel onConfirm onCancel />`: an in-tree view (not a Modal). Calm styling, with the confirm button in `accent`.
  - `<TypePickerScreen day />`: lists `host.entryTypes()` (icon, name, description). Pressing one → `router.push({ pathname: "/journal/edit", params: { day, typeId } })`.
  - `<EntryEditorScreen mode={{ kind: "new", day, typeId } | { kind: "edit", id }} />`:
    - one `FieldInput` per field: `text` → single line; `longText` → multiline; `number` → `keyboardType="decimal-pad"`; `rating` → `<Rating onChange>`;
    - the `PhotoEditor` when `type.photos` (thumbs with a remove button, "Add photos" up to `MAX_PHOTOS`, the text "Adding photos…" while importing);
    - a Save button, disabled while saving and while `empty`;
    - errors from `normalizeFields` shown under their fields in `caution`;
    - after saving: new → `router.dismissTo("/")`, edit → `router.back()`;
    - leaving with changes (via `usePreventRemove`) shows `<InlineConfirm message="Leave without saving? What you wrote here won't be kept." confirmLabel="Leave" cancelLabel="Keep writing" />`. On Leave it calls `media.remove(idsImportedThisSession)` and then dispatches the prevented action.

    In edit mode it saves `{ ...entry.fields, ...normalized.fields }`, so unknown keys survive.

- [ ] **Step 1: Write the failing tests** in `entry-editor-screen.test.tsx`, with a mocked router and `pickImages` (jest.mock):
  - Saving a new `journal.game` with Game empty shows `"This one's needed to save."` and creates nothing. With "Hades" typed it creates exactly one entry, even when Save is pressed twice quickly.
  - "Add photos" imports the picked URIs via `media.importImage` and shows thumbs. Leaving and confirming "Leave" removes those media and creates no entry.
  - Editing an entry seeded with `fields: { game: "Hades", legacy: "keep" }` and changing the game to "Hades II" keeps `legacy`.
  - The picker list omits `habits.win` when Habits is disabled.
  - The rendered tree contains no `Modal`. After toggling the `locked` context value true then false, the typed text is unchanged.
- [ ] **Step 2: Run them to see them fail.** Run: `npx jest src/plugins/journal/screens/entry-editor` (expected: FAIL).
- [ ] **Step 3: Implement** the components and routes. `src/app/journal/edit.tsx` reads `id` or `day`+`typeId` from `useLocalSearchParams` and renders the editor; `new.tsx` renders the picker. Load the `expo-router` skill first.
- [ ] **Step 4: Run all tests and the typecheck.** Run: `npm test && npx tsc --noEmit` (expected: pass).
- [ ] **Step 5: Commit** `git commit -m "feat(journal): create and edit entries with encrypted photos"`

---

### Task 7: Entry detail view and delete

**Files:**
- Create: `src/app/journal/[id].tsx`, `src/plugins/journal/screens/entry-detail-screen.tsx`, `entry-detail-screen.test.tsx`
- Modify: `src/plugins/journal/screens/day-screen.tsx` (card press → `router.push(\`/journal/${id}\`)`)

**Interfaces:**
- Consumes: `useJournal`, `host.entryType`, `MediaImage` with `media.info` for the aspect ratio, `Rating`, `InlineConfirm`.
- Produces: `<EntryDetailScreen id />`:
  - the header title is the type name (or "Entry");
  - each non-empty field shows its label and value (rating as stars, numbers as written);
  - photos at full width with each photo's own aspect ratio;
  - an **Edit** button (hidden when the type is unknown) → `/journal/edit?id=`;
  - a **Delete** button → `<InlineConfirm message="Delete this entry? Its photos go too. This can't be undone." confirmLabel="Delete" cancelLabel="Keep it" />` → `journal.remove(id)` → `router.back()`.

  When the entry doesn't exist it shows `"This entry isn't here any more."`

- [ ] **Step 1: Write the failing tests:**
  - shows fields and labels and skips empty ones;
  - Delete → confirm removes the entry and goes back;
  - Delete → "Keep it" leaves it;
  - an unknown type shows no Edit button but can still be deleted;
  - a missing id shows the "isn't here" copy.
- [ ] **Step 2: Run them to see them fail.** Run: `npx jest src/plugins/journal/screens/entry-detail` (expected: FAIL).
- [ ] **Step 3: Implement** the screen and route; wire the card press.
- [ ] **Step 4: Run all tests and the typecheck.** Run: `npm test && npx tsc --noEmit` (expected: pass).
- [ ] **Step 5: Commit** `git commit -m "feat(journal): entry detail view with delete"`

---

### Task 8: Daily journal reminder

**Files:**
- Create: `src/plugins/journal/reminder.ts`, `reminder.test.ts`, `notifier.ts`, `src/plugins/journal/screens/reminder-settings-screen.tsx`, `reminder-settings-screen.test.tsx`, `src/app/settings/reminders.tsx`
- Modify: `src/plugins/journal/index.ts` (`activate`), `src/plugins/journal/screens/day-screen.tsx` (one-time permission ask), `src/app/settings/index.tsx` (a "Reminders" row, only when journal is enabled), `src/app/_layout.tsx` (`settings/reminders` "Reminders"), `app.json`
- Install: `npx expo install expo-notifications`; add `"expo-notifications"` to the `app.json` plugins (small icon `./assets/images/android-icon-monochrome.png`). Then run `npx expo prebuild --clean`.

**Interfaces:**
- Consumes: `PluginContext.settings` (scoped), `useAppLock()` (`locked`, `withSystemPrompt`).
- Produces (`reminder.ts`):
```ts
export const REMINDER_ID = "journal.daily-reminder";
export const REMINDER_CONTENT = { title: "SelfJournal", body: "Time to check in." } as const;
export interface ReminderSettings { enabled: boolean; hour: number; minute: number; }
export const DEFAULT_REMINDER: ReminderSettings = { enabled: true, hour: 20, minute: 0 };
export type PermissionState = "granted" | "denied" | "undetermined";
export interface Notifier {
  permission(): Promise<PermissionState>; request(): Promise<PermissionState>;
  scheduleDaily(id: string, hour: number, minute: number, content: { title: string; body: string }): Promise<void>;
  cancel(id: string): Promise<void>;
}
export function readReminder(settings: AppSettings): Promise<ReminderSettings>;  // keys "reminder.enabled" ("1"/"0"), "reminder.time" ("HH:MM"); bad values → defaults
export function writeReminder(settings: AppSettings, r: ReminderSettings): Promise<void>; // setMany
export function syncReminder(settings: AppSettings, n: Notifier): Promise<"scheduled" | "off" | "no-permission">;
export function askOnce(settings: AppSettings, n: Notifier, runPrompt: <T>(p: () => Promise<T>) => Promise<T>): Promise<void>; // key "reminder.asked"
```
  - `notifier.ts`: `expoNotifier: Notifier`. It creates the Android channel `"reminders"` (name "Reminders", default importance) before `request`/`scheduleDaily`. Triggers use `{ type: SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: "reminders" }` with `identifier: id`, so rescheduling replaces the old one. At module load it sets `setNotificationHandler` to not show banners while the app is open.
  - In journal `activate(ctx)`, `syncReminder(ctx.settings, expoNotifier)` runs with errors → `console.warn`. The cleanup returns `() => void expoNotifier.cancel(REMINDER_ID)`.
  - `<ReminderSettingsScreen notifier? />`:
    - a Switch "Daily journal reminder";
    - a "Time" row showing the locale time → `TimePickerDialog` (from `@expo/ui/jetpack-compose`, `is24Hour` per locale), closed whenever `locked`;
    - every change → `writeReminder` + `syncReminder`;
    - when permission is `denied`: the note `"Notifications are turned off for SelfJournal in your phone's settings."` and a button "Open phone settings" (`Linking.openSettings()`).

- [ ] **Step 1: Write the failing tests** in `reminder.test.ts`, with a fake `Notifier` that records calls:
  - The defaults schedule `REMINDER_ID` at 20:00 with exactly `REMINDER_CONTENT`.
  - Disabled → `cancel(REMINDER_ID)` and `"off"`.
  - Permission denied → nothing scheduled and `"no-permission"`.
  - `"07:5x"` stored → defaults are used.
  - `askOnce` requests only when `undetermined` and not asked before, runs through `runPrompt`, then syncs. A second call does nothing.
  - Disabling the journal plugin via the host cancels `REMINDER_ID`. Use `jest.mock("./notifier")`.

  `reminder-settings-screen.test.tsx`: the switch persists `reminder.enabled = "0"` under `plugin.journal.`; the time dialog unmounts when `locked` becomes true (mock `@expo/ui/jetpack-compose`).
- [ ] **Step 2: Run them to see them fail.** Run: `npx jest src/plugins/journal/reminder src/plugins/journal/screens/reminder` (expected: FAIL).
- [ ] **Step 3: Implement** the files above. The Journal day screen calls `askOnce(ctx.settings, expoNotifier, withSystemPrompt)` once on mount. Load the `expo-ui` skill first.
- [ ] **Step 4: Run all tests and the typecheck.** Run: `npm test && npx tsc --noEmit` (expected: pass).
- [ ] **Step 5: Commit** `git commit -m "feat(journal): gentle daily reminder with settings"`

---

### Task 9: Docs and on-device verification

**Files:**
- Modify: `CLAUDE.md` (folder map: `src/core/entry-types/`, `src/core/media/`, `src/plugins/<id>/screens/`; gotcha: decrypted media only as in-memory data URIs), `CONTRIBUTING.md` (contributing entry types; plugin screens + routes; using `ctx.media`), `docs/superpowers/plans/2026-11-12-roadmap.md` (Plan 2 ✅)
- Create: `docs/superpowers/plans/2026-11-12-plan-02-outcome.md` (status, rulings made during the build, deferred findings, Plan 3 prerequisites)

- [ ] **Step 1: Run the full checks.** Run: `npm test && npx tsc --noEmit && npx expo lint` (expected: all pass, 0 lint errors).
- [ ] **Step 2: Build and run on the emulator.** Run: `npx expo prebuild --clean && npx expo run:android --port 8082`. Expected: the app opens on emulator-5554.
- [ ] **Step 3: On-device checks** (record each result in the outcome doc):
  - Create a Game cleared entry with 2 photos; the card shows the cover photo; the detail view shows both photos; edit the rating; delete the entry.
  - `adb exec-out run-as app.selfjournal ls files/media` lists `.full`/`.thumb` files. `adb exec-out run-as app.selfjournal head -c 3 files/media/<id>.full | xxd` is **not** `ffd8ff`.
  - After importing, `adb exec-out run-as app.selfjournal ls cache/ImagePicker cache/ImageManipulator` shows no leftover images.
  - Back out of a new entry after adding a photo → confirm Leave → the media file count is back to where it was.
  - Previous day / next day / Today work; the add flow lands back on the Journal tab.
  - The notification permission prompt appears once; `adb shell dumpsys alarm | grep app.selfjournal` shows a scheduled alarm; turning the reminder off removes it; turning the Journal plugin off removes it.
  - Lock while in the editor (background > 30 s) → after unlock the typed text is still there.
- [ ] **Step 4: Update the docs** listed above and write the outcome doc.
- [ ] **Step 5: Commit** `git commit -m "docs: Plan 2 outcome, contributor guide for entry types and media"`
