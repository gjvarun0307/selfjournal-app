# Plan 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A runnable Android dev build of SelfJournal with encrypted local storage, a plugin system (registry, event bus, on/off state), a tab shell that shows only enabled plugins, an app lock, design tokens, and project docs. All five plugins exist as stubs that later plans fill in.

**Architecture:** Expo Router app under `src/`. Core services live in `src/core/` (db, security, events, plugins) and are plain TypeScript behind small interfaces, so they're unit-tested in Jest without a device. SQLite access goes through a `Db` interface. Production uses `expo-sqlite` with SQLCipher; tests use `better-sqlite3` in memory. Plugins live in `src/plugins/<id>/` and talk to each other only through the typed event bus.

**Tech Stack:** Expo (latest SDK via `create-expo-app@latest`), Expo Router, TypeScript, expo-sqlite (SQLCipher), expo-secure-store, expo-crypto, expo-local-authentication, expo-file-system, expo-dev-client, @noble/hashes, Jest (jest-expo) + @testing-library/react-native, better-sqlite3 (tests only).

**Spec:** `docs/superpowers/specs/2026-11-11-selfjournal-app-design.md` · Roadmap: `docs/superpowers/plans/2026-11-12-roadmap.md`

## Global Constraints

- Android first; iOS not a release target; **no web**. Don't add `.web.tsx` variants.
- Local-only data. No backend, no accounts, no analytics, no telemetry. **No network calls in this plan.**
- **No `expo-updates` / EAS Update.**
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

## Review Focus

1. **App killed mid-migration.** A migration that throws leaves no partial schema and no `_migrations` row, and earlier migrations stay applied. Test in Task 2.
2. **Secure-store key missing while the DB file exists** (e.g. data restored without the keystore). The app must stop with an error, never generate a new key and silently start an empty DB over the user's journal. Test in Task 3.
3. **A plugin's event handler throws.** Other handlers still receive the event and the emitter doesn't crash. Test in Task 4.
4. **Plugin toggled off → on → off rapidly.** Handlers are never double-subscribed (one emit = one delivery) and data is untouched. A plugin id stored in the DB but no longer shipped is ignored. Tests in Task 5.
5. **App briefly backgrounded by the system photo picker/camera.** It must not re-lock inside the grace period, and must re-lock after it. Test in Task 8.

---

## File Structure

```
src/
  app/                              # routes only
    _layout.tsx                     # Root stack: AppProvider + LockGate
    onboarding.tsx                  # first-run "protect your journal?" offer
    (tabs)/_layout.tsx              # Tabs, hides tabs of disabled plugins
    (tabs)/index.tsx                # Journal tab (placeholder)
    (tabs)/habits.tsx               # placeholder
    (tabs)/recovery.tsx             # placeholder
    (tabs)/me.tsx                   # Me tab: links to settings; sections per plugin later
    settings/index.tsx
    settings/plugins.tsx
    settings/app-lock.tsx
  core/
    db/types.ts                     # Db interface
    db/expo-db.ts                   # expo-sqlite + SQLCipher adapter
    db/test-db.ts                   # better-sqlite3 adapter (tests only)
    db/migrations.ts                # runMigrations
    db/core-migrations.ts           # core tables
    security/db-key.ts              # getOrCreateDbKey
    security/pin.ts                 # hashPin / verifyPin / shouldLock
    security/app-lock-store.ts      # lock settings in app_settings
    events/types.ts                 # AppEvents interface (augmentable)
    events/bus.ts                   # EventBus
    plugins/types.ts                # PluginDefinition, PluginContext
    plugins/host.ts                 # PluginHost
    plugins/tabs.ts                 # visibleTabs()
    settings/app-settings.ts        # key/value store over app_settings
    app-provider.tsx                # boot sequence + React context/hooks
  plugins/
    index.ts                        # ALL_PLUGINS array
    journal/index.ts  habits/index.ts  recovery/index.ts  gamification/index.ts  lifestats/index.ts
  screens/
    lock/index.tsx                  # LockScreen + LockGate
    settings/plugins.tsx            # PluginsScreen body
    settings/app-lock.tsx           # AppLockSettings body
    placeholder.tsx                 # "Coming soon" body used by stub tabs
  theme/
    tokens.ts
    use-theme.ts
CLAUDE.md  CONTRIBUTING.md
```

---

### Task 1: Scaffold the Expo app, tests, and native config

**Files:**
- Create: everything from `create-expo-app` (merged into repo root), `src/app/` stub routes after reset
- Modify: `.gitignore`, `app.json`, `package.json`
- Test: `src/smoke.test.ts`

**Interfaces:**
- Produces: `npm test` runs Jest with `jest-expo` preset; `@/*` alias → `src/*`.

- [x] **Step 1: Generate the app in the scratchpad and merge into the repo.** The repo isn't empty, so generate elsewhere and copy:

```bash
SCRATCH=$(mktemp -d) && cd "$SCRATCH" && npx create-expo-app@latest selfjournal --template default --yes
rsync -a --exclude .git --exclude README.md --exclude .gitignore "$SCRATCH/selfjournal/" /Users/varun/Hecker/Projects/selfjournal-app/
cat "$SCRATCH/selfjournal/.gitignore" >> /Users/varun/Hecker/Projects/selfjournal-app/.gitignore
```

Then run `npm run reset-project` (answer to delete the example), and make sure routes live under `src/app/` (move `app/` → `src/app/` if the template didn't). Read `package.json` and note the Expo SDK version; read docs for **that** version only.

- [x] **Step 2: Configure `app.json`**: `name: "SelfJournal"`, `slug: "selfjournal"`, `scheme: "selfjournal"`, `android.package: "app.selfjournal"`, `android.allowBackup: false`, `platforms: ["android", "ios"]`, and the expo-sqlite plugin entry `["expo-sqlite", { "useSQLCipher": true }]`. Remove any web config. Append `/android` and `/ios` to `.gitignore` if absent.

- [x] **Step 3: Install packages.**

```bash
npx expo install expo-dev-client expo-sqlite expo-secure-store expo-crypto expo-local-authentication expo-file-system
npx expo install jest-expo jest @types/jest @testing-library/react-native -- --save-dev
npm i @noble/hashes && npm i -D better-sqlite3 @types/better-sqlite3
```

Add to `package.json`: `"jest": { "preset": "jest-expo" }` and script `"test": "jest"`.

- [x] **Step 4: Write `src/smoke.test.ts`**: `expect(1 + 1).toBe(2)`. Run `npm test` → PASS.

- [x] **Step 5: Verify native config.** Run `npx expo prebuild --platform android --clean`, then
`grep allowBackup android/app/src/main/AndroidManifest.xml` → contains `android:allowBackup="false"`. Then `npx expo run:android` (needs Android Studio + an emulator or a USB device). Expected: dev build launches showing the reset blank screen. If no Android toolchain is available, stop and tell the user; don't switch to EAS cloud builds without asking.

- [x] **Step 6: Commit** (`git status` must show no `android/`):

```bash
git add -A && git commit -m "chore: scaffold Expo app with dev client, Jest, SQLCipher config, backups off"
```

---

### Task 2: `Db` interface, test adapter, migration runner

**Files:**
- Create: `src/core/db/types.ts`, `src/core/db/test-db.ts`, `src/core/db/migrations.ts`, `src/core/db/core-migrations.ts`
- Test: `src/core/db/migrations.test.ts`

**Interfaces:**
- Produces:
  - `type SqlParam = string | number | null`
  - `interface Db { exec(sql: string): Promise<void>; run(sql: string, params?: SqlParam[]): Promise<{ changes: number; lastInsertRowId: number }>; all<T>(sql: string, params?: SqlParam[]): Promise<T[]>; first<T>(sql: string, params?: SqlParam[]): Promise<T | null>; transaction(fn: () => Promise<void>): Promise<void>; }`
  - `createTestDb(): Db` (better-sqlite3 `:memory:`; `transaction` uses `BEGIN`/`COMMIT`/`ROLLBACK`)
  - `interface Migration { id: string; up: string }`. Id format: `"<owner>:<NNN>"`, e.g. `"core:001"`, `"habits:001"`.
  - `runMigrations(db: Db, migrations: Migration[]): Promise<string[]>`. Applies in array order those not yet in `_migrations(id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`, each in its own transaction together with its `_migrations` insert. Returns the ids applied.
  - `CORE_MIGRATIONS: Migration[]`, `core:001` creates `app_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL)` and `plugin_state(id TEXT PRIMARY KEY, enabled INTEGER NOT NULL)`.

- [ ] **Step 1: Write failing tests** in `migrations.test.ts`:
  - `applies pending migrations in order and records them`: run `[a, b]` → returns `['t:001','t:002']`; tables exist; `_migrations` has 2 rows.
  - `is idempotent`: second `runMigrations` with same list → returns `[]`.
  - `rolls back a failing migration without recording it` (Review Focus 1): list `[ok, bad]`, where `bad.up` = `"CREATE TABLE half(x INT); INSERT INTO nope VALUES (1);"`. Expect rejection; `_migrations` contains only `ok`'s id; table `half` does **not** exist.
  - `CORE_MIGRATIONS create app_settings and plugin_state`.

- [ ] **Step 2: Run** `npx jest src/core/db` → FAIL (modules missing).
- [ ] **Step 3: Implement** the four files per Interfaces.
- [ ] **Step 4: Run** `npx jest src/core/db` → PASS.
- [ ] **Step 5: Commit** `feat(core): Db interface, test adapter, transactional migrations`.

---

### Task 3: Database key and encrypted open

**Files:**
- Create: `src/core/security/db-key.ts`, `src/core/db/expo-db.ts`
- Test: `src/core/security/db-key.test.ts`

**Interfaces:**
- Consumes: `Db` (Task 2)
- Produces:
  - `interface KeyStore { get(name: string): Promise<string | null>; set(name: string, value: string): Promise<void> }`
  - `secureKeyStore: KeyStore` wrapping `expo-secure-store` (`getItemAsync`/`setItemAsync`)
  - `class MissingDbKeyError extends Error`
  - `getOrCreateDbKey(opts: { store: KeyStore; dbFileExists: boolean; randomHex: () => string }): Promise<string>`. Key name `"selfjournal.db-key"`, value 64 hex chars (32 bytes).
  - `randomHex32(): string`, i.e. `bytesToHex(Crypto.getRandomBytes(32))` (production `randomHex`)
  - `DB_NAME = "selfjournal.db"`
  - `dbFileExists(): boolean` via expo-file-system `File` at expo-sqlite's `defaultDatabaseDirectory` + `DB_NAME`
  - `class DbKeyError extends Error` (wrong key / unreadable file)
  - `openEncryptedDb(hexKey: string): Promise<Db>`: `openDatabaseAsync(DB_NAME)`, then as the first statement `PRAGMA key = "x'<hex>'"`, then `SELECT count(*) FROM sqlite_master`. If that fails, throw `DbKeyError`. Also sets `PRAGMA foreign_keys = ON`. Maps `Db` methods to `execAsync` / `runAsync` / `getAllAsync` / `getFirstAsync` / `withTransactionAsync`.

- [ ] **Step 1: Write failing tests** with an in-memory fake `KeyStore`:
  - `returns the stored key when present`.
  - `creates and stores a new key when none exists and there is no DB file`: result matches `/^[0-9a-f]{64}$/` and is saved.
  - `throws MissingDbKeyError when the DB file exists but the key is gone` (Review Focus 2), and `set` is **never** called.
- [ ] **Step 2: Run** `npx jest src/core/security/db-key` → FAIL.
- [ ] **Step 3: Implement** `db-key.ts`. Production passes `randomHex32`. Then implement `expo-db.ts`. It isn't unit-tested (it's native) and gets verified on device in Task 7.
- [ ] **Step 4: Run** `npx jest src/core/security/db-key` → PASS.
- [ ] **Step 5: Commit** `feat(core): keystore-held SQLCipher key with missing-key guard`.

---

### Task 4: Typed event bus

**Files:**
- Create: `src/core/events/types.ts`, `src/core/events/bus.ts`
- Test: `src/core/events/bus.test.ts`

**Interfaces:**
- Produces:
  - `export interface AppEvents {}`. Plugins add events by declaration merging: `declare module "@/core/events/types" { interface AppEvents { "habit.completed": { habitId: string; day: string } } }`
  - `type EventHandler<K extends keyof AppEvents> = (payload: AppEvents[K]) => void | Promise<void>`
  - `class EventBus { on<K extends keyof AppEvents>(type: K, handler: EventHandler<K>): () => void; emit<K extends keyof AppEvents>(type: K, payload: AppEvents[K]): Promise<void>; }`. `emit` awaits all handlers. A handler that throws or rejects is caught and reported via the constructor option `onError: (err: unknown, type: string) => void` (default `console.error`), and never stops other handlers or rejects `emit`.

- [ ] **Step 1: Write failing tests** (augment `AppEvents` with a `"test.ping": { n: number }` event inside the test file):
  - `delivers payload to every subscriber`.
  - `unsubscribe stops delivery`.
  - `a throwing handler does not block others or reject emit` (Review Focus 3): handlers [throws, rejects, records] → `emit` resolves, the recorder got the payload, and `onError` was called twice.
- [ ] **Step 2: Run** `npx jest src/core/events` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(core): typed event bus with isolated handler failures`.

---

### Task 5: Plugin types, PluginHost, visible tabs, app settings

**Files:**
- Create: `src/core/plugins/types.ts`, `src/core/plugins/host.ts`, `src/core/plugins/tabs.ts`, `src/core/settings/app-settings.ts`
- Test: `src/core/plugins/host.test.ts`, `src/core/plugins/tabs.test.ts`, `src/core/settings/app-settings.test.ts`

**Interfaces:**
- Consumes: `Db`, `Migration`, `runMigrations`, `CORE_MIGRATIONS`, `EventBus`
- Produces:
  - `interface AppSettings { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; delete(key: string): Promise<void> }` and `createAppSettings(db: Db): AppSettings` (table `app_settings`)
  - `interface PluginContext { db: Db; bus: EventBus; settings: AppSettings }`
  - `interface PluginTab { route: "index" | "habits" | "recovery" | "me"; title: string; icon: string; order: number }`
  - `interface PluginDefinition { id: string; name: string; description: string; icon: string; migrations?: Migration[]; tab?: PluginTab; activate?(ctx: PluginContext): (() => void) | void }`. `activate` subscribes to events and returns a cleanup.
  - `class PluginHost { constructor(defs: PluginDefinition[], ctx: PluginContext); start(): Promise<void>; isEnabled(id: string): boolean; setEnabled(id: string, enabled: boolean): Promise<void>; list(): PluginDefinition[]; enabledIds(): string[]; subscribe(listener: () => void): () => void }`
    - The constructor throws on duplicate ids.
    - `start()`: runs core migrations, then every plugin's migrations (enabled or not), then loads `plugin_state`. Ids missing from it default to enabled and get written. Stored ids that no defined plugin uses are ignored. Then activates the enabled plugins.
    - `setEnabled` is a no-op if unchanged. Otherwise it persists, calls the plugin's cleanup on disable or `activate` on enable, and notifies listeners.
  - `visibleTabs(defs: PluginDefinition[], enabledIds: string[]): PluginTab[]`: tabs of enabled plugins sorted by `order`, plus the always-present `{ route: "me", title: "Me", icon: "person", order: 100 }`.

- [ ] **Step 1: Write failing tests.**
  - `app-settings.test.ts`: set/get/overwrite/delete round-trip.
  - `host.test.ts`:
    - `first start enables all plugins and persists state`.
    - `runs migrations of disabled plugins too`.
    - `disable calls cleanup; enable re-activates; data table untouched`.
    - `toggling off→on→off→on leaves exactly one subscription` (Review Focus 4): the plugin's `activate` subscribes to `test.ping`. After toggling, one `emit` → handler called once.
    - `ignores stored ids of plugins that no longer exist`: pre-insert `plugin_state('ghost', 1)` → `start()` resolves, `enabledIds()` excludes `ghost`.
    - `state persists across hosts`: disable `b`, new host on the same db → `isEnabled('b') === false`.
    - `throws on duplicate plugin ids`.
    - `notifies subscribers on change`.
  - `tabs.test.ts`: `hides tabs of disabled plugins and always includes Me last`. With journal(order 10), habits(20), recovery(30) and habits disabled → routes `["index","recovery","me"]`.
- [ ] **Step 2: Run** `npx jest src/core` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx jest src/core` → PASS.
- [ ] **Step 5: Commit** `feat(core): plugin host with persistent on/off state and tab visibility`.

---

### Task 6: Design tokens

**Files:**
- Create: `src/theme/tokens.ts`, `src/theme/use-theme.ts`
- Test: `src/theme/tokens.test.ts`

**Interfaces:**
- Produces:
  - `type ColorTokens = { background: string; surface: string; surfaceAlt: string; text: string; textMuted: string; accent: string; accentText: string; border: string; positive: string; caution: string }`. **No `danger`/red token.** Gentle `caution` (amber/soft) only, per the "no red alarms" rule.
  - `tokens = { light: ColorTokens; dark: ColorTokens; space: { xs: 4; sm: 8; md: 12; lg: 16; xl: 24; xxl: 32 }; radius: { sm: 6; md: 12; lg: 20; pill: 999 }; font: { body: number; small: number; title: number; heading: number } }`
  - `useTheme(): { colors: ColorTokens; space; radius; font; scheme: "light" | "dark" }` via `useColorScheme()`
- Colour values: builder's choice. The direction is warm and paper-ish, to match the journal.

- [ ] **Step 1: Write failing test** `light and dark define the same keys and no red-family accent`: same key sets; `caution` is not pure red. Its hue, computed from the hex, falls outside 345°–15°.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(theme): design tokens and useTheme`.

---

### Task 7: App shell: boot, plugin stubs, tabs, Settings, Plugins screen

**Files:**
- Create: `src/core/app-provider.tsx`, `src/plugins/*/index.ts`, `src/plugins/index.ts`, `src/screens/placeholder.tsx`, `src/screens/settings/plugins.tsx`, routes `src/app/_layout.tsx`, `src/app/(tabs)/_layout.tsx`, `(tabs)/index.tsx`, `(tabs)/habits.tsx`, `(tabs)/recovery.tsx`, `(tabs)/me.tsx`, `src/app/settings/index.tsx`, `src/app/settings/plugins.tsx`
- Test: `src/screens/settings/plugins.test.tsx`, `src/plugins/index.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–6
- Produces:
  - `ALL_PLUGINS: PluginDefinition[]` with stubs:

    | id | name | tab |
    |---|---|---|
    | `journal` | Journal | `{ route: "index", title: "Journal", icon: "book", order: 10 }` |
    | `habits` | Habits | `{ route: "habits", title: "Habits", icon: "checkmark-circle", order: 20 }` |
    | `recovery` | Recovery | `{ route: "recovery", title: "Recovery", icon: "leaf", order: 30 }` |
    | `gamification` | Gamification | none (shows on Me in Plan 5) |
    | `lifestats` | Life stats | none (shows on Me in Plan 6) |

    Descriptions are one line each, in the spec's tone.
  - `<AppProvider>` boot sequence: `getOrCreateDbKey({ store: secureKeyStore, dbFileExists: dbFileExists(), randomHex: randomHex32 })` → `openEncryptedDb` → `new PluginHost(ALL_PLUGINS, { db, bus, settings })` → `start()`. It renders a splash while booting. On `MissingDbKeyError`/`DbKeyError` it renders a calm full-screen message ("SelfJournal can't unlock its data on this device. Nothing has been deleted.") with **no** reset/wipe button.
  - Hooks: `useHost(): PluginHost`, `useEnabledPlugins(): string[]` (re-renders on `host.subscribe`), `useAppSettings(): AppSettings`, `useBus(): EventBus`.
  - `(tabs)/_layout.tsx` builds `<Tabs>` with every tab route declared, giving `href: null` to those not in `visibleTabs(...)`.
  - `PluginsScreen({ host }: { host: PluginHost })`: one row per plugin with name, description and a switch bound to `isEnabled` / `setEnabled`. Footer text: "Turning a plugin off hides it. Your data stays." Use `@expo/ui` Switch/List if available for this SDK (check `expo-ui` skill), else RN `Switch` + `FlatList`.
  - Me tab: links to Settings. The Settings index links to Plugins and App lock.

- [ ] **Step 1: Write failing tests.**
  - `plugins/index.test.ts`: `ALL_PLUGINS has the five ids, unique` and `journal/habits/recovery declare tabs; gamification/lifestats do not`.
  - `plugins.test.tsx` (render with a `PluginHost` built on `createTestDb()`): `lists every plugin with a switch` and `toggling a switch disables the plugin and persists it`, i.e. after pressing Habits' switch, `host.isEnabled('habits') === false` and the footer copy is present.
- [ ] **Step 2: Run** `npx jest src/plugins src/screens` → FAIL.
- [ ] **Step 3: Implement** stubs, provider, routes and screens. Placeholder tabs render `<Placeholder title="Journal" note="Coming in the next update" />`.
- [ ] **Step 4: Run** `npm test` → all PASS. Run `npx tsc --noEmit` → no errors.
- [ ] **Step 5: Verify on device.** `npx expo run:android`. Expected: tabs Journal, Habits, Recovery, Me. Settings → Plugins → turn Habits off: the Habits tab disappears. Kill and relaunch: still off, which proves the encrypted DB persisted. Turn it back on. Then `adb shell run-as app.selfjournal sh -c 'head -c 16 files/SQLite/selfjournal.db' | xxd` must **not** start with `SQLite format 3`, which proves the DB is encrypted.
- [ ] **Step 6: Commit** `feat: app shell with plugin stubs, tab visibility, Plugins screen`.

---

### Task 8: App lock

**Files:**
- Create: `src/core/security/pin.ts`, `src/core/security/app-lock-store.ts`, `src/screens/lock/index.tsx`, `src/screens/settings/app-lock.tsx`, `src/app/settings/app-lock.tsx`, `src/app/onboarding.tsx`
- Modify: `src/app/_layout.tsx` (wrap in `LockGate`; route to onboarding on first run)
- Test: `src/core/security/pin.test.ts`, `src/core/security/app-lock-store.test.ts`

**Interfaces:**
- Consumes: `AppSettings`, `useAppSettings`
- Produces:
  - `hashPin(pin: string, saltHex: string): string`, which is PBKDF2-SHA256 from `@noble/hashes` with **100_000** iterations and a 32-byte output, hex-encoded. `verifyPin(pin: string, saltHex: string, hashHex: string): boolean`, constant-time compare.
  - `isValidPin(pin: string): boolean`, which accepts 4–8 digits only.
  - `LOCK_GRACE_MS = 30_000`. `shouldLock(state: { lockEnabled: boolean; backgroundedAt: number | null }, now: number, graceMs = LOCK_GRACE_MS): boolean`. True only if the lock is enabled, the app was backgrounded, and `now - backgroundedAt >= graceMs`. Cold start counts as locked when enabled (`backgroundedAt === null` at launch → caller treats it as locked).
  - `createAppLockStore(settings: AppSettings)` → `{ getConfig(): Promise<{ lockEnabled: boolean; biometricsEnabled: boolean; hasPin: boolean }>; setPin(pin: string, saltHex: string): Promise<void>; checkPin(pin: string): Promise<boolean>; clearPin(): Promise<void>; setBiometrics(on: boolean): Promise<void>; markOnboarded(): Promise<void>; isOnboarded(): Promise<boolean> }`. Keys are `lock.pinHash`, `lock.pinSalt`, `lock.biometrics`, and `onboarding.done`. `lockEnabled === hasPin`.
  - `LockGate`: tracks `AppState`, and when `shouldLock` is true, shows `LockScreen` over the app. `LockScreen` offers a PIN pad, a biometric button when enabled (`LocalAuthentication.authenticateAsync`), and **"Forgot PIN?"**, which calls `authenticateAsync({ disableDeviceFallback: false, promptMessage: "Confirm it's you" })` with the phone's own credential. On success it clears the PIN, unlocks, and opens App lock settings to set a new one. Wrong PINs show a soft message with no counters or lockouts.
  - Onboarding (first launch only): "Protect your journal?" with **Set a PIN** / **Not now**. Both mark onboarded. Copy: "Your journal stays on this phone. A PIN keeps it private if someone else picks it up."
  - App lock settings: set/change/remove PIN, plus a biometrics toggle (shown only if `hasHardwareAsync && isEnrolledAsync`).

- [ ] **Step 1: Write failing tests.**
  - `pin.test.ts`:
    - `verifyPin accepts the right PIN and rejects a wrong one`.
    - `same PIN with different salts gives different hashes`.
    - `isValidPin accepts 4–8 digits only` (`"123"` false, `"1234"` true, `"12345678"` true, `"123456789"` false, `"12a4"` false).
    - `shouldLock is false when lock disabled`.
    - `shouldLock stays false within the grace period and true after it` (Review Focus 5): backgrounded at t=0 → `now=29_999` false, `now=30_000` true.
  - `app-lock-store.test.ts` (on `createAppSettings(createTestDb())` after core migrations): `setPin then checkPin`, `clearPin disables lock`, `onboarding flag round-trip`.
- [ ] **Step 2: Run** `npx jest src/core/security` → FAIL.
- [ ] **Step 3: Implement** `pin.ts`, the store, then the screens and gate.
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit` → PASS / no errors.
- [ ] **Step 5: Verify on device.** Fresh install → onboarding appears → set PIN 2468 → background the app for less than 30 s and return: no lock. Wait 30 s or more: locked. Wrong PIN: soft message. Right PIN: unlocks. "Forgot PIN?" → device credential → PIN cleared and App lock settings open.
- [ ] **Step 6: Commit** `feat: app lock with PIN, biometrics, device-credential reset, first-run offer`.

---

### Task 9: CLAUDE.md, CONTRIBUTING.md

**Files:**
- Create: `CLAUDE.md`, `CONTRIBUTING.md`
- Modify: `.gitignore` (add `CLAUDE.local.md`), `README.md`

- [ ] **Step 1: Write `CLAUDE.md`** (under ~80 lines), covering: what the app is (one paragraph, linking the spec and roadmap); commands (`npm test`, `npx tsc --noEmit`, `npx expo run:android`, prebuild note); folder map from this plan; the Global Constraints above verbatim; how to add a plugin (pointer to CONTRIBUTING); "install with `npx expo install`"; "read docs for the SDK version in package.json".
- [ ] **Step 2: Write `CONTRIBUTING.md`**: how to add a plugin. Create `src/plugins/<id>/index.ts` exporting a `PluginDefinition`, migrations with `<id>:NNN` ids, add it to `ALL_PLUGINS`, declare events via `AppEvents` augmentation, never import another plugin, and follow the tone rules (no streak resets, no shaming, generic notifications). Include a 15-line example plugin that listens to an event.
- [ ] **Step 3: Update `README.md`** to two or three lines: what SelfJournal is, plus links to CONTRIBUTING and the spec.
- [ ] **Step 4: Verify**: `npm test` PASS, and `git check-ignore CLAUDE.local.md` prints the path.
- [ ] **Step 5: Commit** `docs: CLAUDE.md, contributing guide for plugin authors`.
