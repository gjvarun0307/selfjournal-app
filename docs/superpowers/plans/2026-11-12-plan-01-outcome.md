# Plan 1 (Foundation): outcome and handoff

*Completed 2026-11-12 on branch `design/first-release` (not merged, not pushed).*

**Status:** all 9 tasks done, each task-reviewed. A final whole-branch review plus one fix wave came back clean. 69 tests pass and `tsc` is clean. On-device checks on the Android emulator:
- tabs hide and the setting survives relaunch;
- the DB file is encrypted;
- the lock flows work;
- unlock takes ~220 ms;
- a missing key shows the calm error screen and leaves the data untouched.

## Decisions made during the build (check these)

Decisions that change behaviour or the plan:

| # | Decision | Why | If wrong |
|---|---|---|---|
| R10 | `Db.transaction(fn: (tx: Db) => …)`. All DB calls are serialized, and inside a transaction only `tx` may be used. | Stops one plugin's rollback from undoing another plugin's concurrent writes. | Small refactor. Later plans must use `tx`. |
| R11 | The app refuses to run if SQLCipher isn't active (`EncryptionUnavailableError`). | The spec requires encrypted storage. A silent plaintext fallback is never allowed. | None. |
| R17 | PIN hashing uses PBKDF2 with **2,000** iterations, not 100,000. The count is stored per hash (`lock.pinIterations`) so it can be raised later. | 100k took ~12.7 s per unlock in pure JS. The hash only lives inside the encrypted DB, whose key is in the Android Keystore. | Weaker offline brute-force, but only for someone who has already broken SQLCipher and the Keystore. A native PBKDF2 library can raise the count later. |
| **R18** | **While a PIN is set, Android FLAG_SECURE is on: the Recents thumbnail is blank and screenshots are blocked.** A privacy cover shows when the app is backgrounded. Nothing changes without a PIN. | The spec promises privacy if someone picks up the phone. | Users with a PIN can't screenshot journal pages. **Needs your OK.** It could become its own toggle. |
| R19 | Salt, hash and iteration count are written in one transaction. | A crash mid-change can't strand the user. | None. |
| R4 | The Plugins screen uses RN `Switch`/`FlatList`, not `@expo/ui`. | Reliable Jest tests. | Swap in a later design pass. |
| R14 | Expo Router JS `Tabs` (with `href: null` for hidden tabs), Ionicons, and an `AppProvider` that boots once per process. | Hiding tabs works, and the encrypted connection is never re-keyed. | Small UI swap. |
| R13 | `setEnabled(unknown id)` throws. Toggles are serialized. A plugin whose `activate()` throws stays enabled but inactive. | The brief didn't say. | Small behaviour change. |
| R20 | Hidden tabs redirect to the first visible tab. A failed COMMIT rolls back. "Never emit events inside a transaction" is documented. Test packages moved to devDependencies. | From the final review. | None. |

Housekeeping rulings (R1–R3, R5–R9, R12, R15, R16) only affected build mechanics or docs. They're reflected in the code and in CLAUDE.md.

## Must do at the start of Plan 2 (from the final review)

Settle the plugin context API **before** real plugins depend on it:
- give each plugin a settings object with its own key prefix, so plugins can't overwrite `lock.*` or each other's keys;
- have the host own bus subscriptions per plugin and remove them on disable;
- document the story for adding a tab. `PluginTab.route` is currently a closed union, and each tab needs a file in `src/app/(tabs)/`.

## Deferred minor findings (fix when touching that code)

- **App lock:**
  - `shouldLock` uses the wall clock; also lock when `now < backgroundedAt`.
  - The `withSystemPrompt` counter can stick; reset it in `unlock()`.
  - A partial failure in `forgotPinReset` can leave the app locked with no PIN.
  - No double-tap guard on the biometric and Forgot PIN buttons.
  - Biometrics can be enabled without a successful biometric check, and the default security level is weak; consider `'strong'`.
  - Changing or removing the PIN doesn't ask for the current PIN.
  - No test for `newPinSalt`.
- **Design tokens:** hard-coded sizes, radii and `"transparent"` in `pin-pad.tsx` / `calm-button.tsx`; tokenize them in a design pass.
- **Branding:** `app.json` still uses the template splash and icon colours (`#208AEF`, `#E6F4FE`) and Expo's icons.
- **Plugin host:**
  - A throwing listener rejects `setEnabled` after the change was persisted.
  - `start()` isn't queued.
  - `ME_TAB` is a shared mutable object.
  - Missing tests: `activate` throwing during `setEnabled`, a throwing cleanup, and the queue surviving a rejected call.
- **Database:**
  - The connection isn't closed if `PRAGMA foreign_keys` fails (`expo-db.ts`).
  - The db-key test should assert the injected key; add a test for an empty-string stored key.
- **Tests:**
  - The unsubscribe-during-emit test is weak.
  - `EventHandler<any>` is used internally.
  - `host.test.ts` has a vacuous assertion.
  - No component test for the `<Redirect>` wiring in `(tabs)/_layout.tsx`.
- **Template leftovers:**
  - `example` in `.gitignore`.
  - Unused packages: `@expo/ui`, `expo-glass-effect`, `expo-symbols`, …
  - `.vscode/settings.json`.
  - 3 moderate npm audit findings.
- **Docs:**
  - CLAUDE.md's verbatim "No network calls in this plan" reads oddly, since Plan 8 adds an update check.
  - The README status line will go stale.
