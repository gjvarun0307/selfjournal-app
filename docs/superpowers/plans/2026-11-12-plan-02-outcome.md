# Plan 2 (Journal: data + Cards): outcome and handoff

*Completed 2026-11-12 on branch `plan-02-journal` (not merged, not pushed).*

**Status:** all 9 tasks done, plus a final fix wave (see below). After the fix wave 187 tests pass (30 suites) and `tsc` is clean. Lint is not run (see R-E). Task 9's on-device checks on the Android emulator (API 37, `Medium_Phone`): 10 pass, **1 failed** (the notification permission prompt never appeared; fixed in the fix wave, see "Must fix before merge").

## On-device results

| Check | Result | Evidence |
|---|---|---|
| Game cleared entry with 2 photos; card shows the cover photo; detail shows both; edit rating; delete | Pass | Card screenshot shows the cover photo and 5 stars. Detail shows both photos. After editing, the rating shows 3 stars. Delete asks inline ("Delete this entry? Its photos go too."), then the Journal shows "Nothing here yet." |
| Media files are encrypted | Pass | `ls files/media` lists `<id>.full` and `<id>.thumb` per photo. `head -c 3 <id>.full \| xxd` gives `bbaf fd`, not `ffd8ff`. |
| DB still encrypted | Pass | `head -c 16 files/SQLite/selfjournal.db \| xxd` gives `8c48 3311 c7f0 …`, not "SQLite format 3". |
| No leftover picker/manipulator images after import | Pass | `ls cache/ImagePicker cache/ImageManipulator` is empty for both, with 2 photos imported into the open editor. |
| Delete removes the photo files | Pass | `ls files/media` is empty after deleting the entry. |
| Back out of a new entry after adding a photo, Leave | Pass | 1 photo imported (2 files in `files/media`). After Back then Leave, `files/media` is empty and the cache dirs are empty. Leave returns to the type picker, not the Journal tab. |
| Previous day / next day / Today | Pass | "Yesterday", "Tue, Nov 10", "Mon, Nov 9", back up to Tue, then Today returns to "Today". |
| Add flow lands back on the Journal tab | Pass | Saving a new "How was the day" entry shows the Journal day with the new card. |
| Notification permission prompt appears once | **Fail** | No prompt ever appeared. `dumpsys package` shows `POST_NOTIFICATIONS granted=false`, with no user-set flag. The Reminders screen shows "Notifications are turned off for SelfJournal in your phone's settings." No alarm was scheduled. Cause: see below. |
| Alarm scheduled; off removes it; plugin off removes it | Pass, with a workaround | I granted the permission with `adb shell pm grant`. Reminder toggled off then on: `dumpsys alarm` shows 0 entries, then `RTC_WAKEUP … origWhen=2026-11-12 20:00:00 … app.selfjournal`. Journal plugin off: 0 entries; back on: 1 entry. |
| Lock while in the editor (background more than 30 s) | Pass | Typed "Draft stays", Home, waited 35 s and 50 s, reopened with `monkey`. The PIN pad was showing ("Enter your PIN to open your journal."). After entering 2468 the editor field still held "Draft stays". |

**Cause of the failed prompt:** `askOnce` only requests when `permission()` returns `"undetermined"`. On Android 13+, expo-notifications' `getPermissionsAsync` returns `denied` whenever `areNotificationsEnabled()` is false, and that check comes before the `undetermined` branch (`NotificationPermissionsModule.kt`, `getPermissionsWithPromiseImplApi33`). A fresh install has notifications disabled, so the status is `denied`, never `undetermined`, and `askOnce` returns without asking. The guard needs to key on `canAskAgain` (or just call `request()` once), not on `undetermined`. I did not change app code.

## Merged manifest permissions (debug APK, `aapt dump permissions`)

- App-level, from `AndroidManifest.xml` after prebuild: `INTERNET`, `READ_EXTERNAL_STORAGE` (max SDK 32), `WRITE_EXTERNAL_STORAGE` (max SDK 32), `SYSTEM_ALERT_WINDOW`, `USE_BIOMETRIC`, `USE_FINGERPRINT`, `VIBRATE`. `CAMERA` and `RECORD_AUDIO` are explicitly removed (`tools:node="remove"`).
- Added by merged libraries: `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `READ_MEDIA_IMAGES` (max SDK 33, from expo-screen-capture), `DETECT_SCREEN_CAPTURE`, `ACCESS_NETWORK_STATE`, `CHANGE_WIFI_MULTICAST_STATE`, `ACCESS_LOCAL_NETWORK`, plus launcher badge permissions.
- `READ_MEDIA_IMAGES` and `READ_EXTERNAL_STORAGE` are present (both limited to old SDKs) and the plan expected neither. The photo picker itself needs no permission at runtime. **Fix wave:** both are now in `android.blockedPermissions` (see below).
- **Finding:** `com.google.android.c2dm.permission.RECEIVE` and about 28 `firebase` string matches appear in the merged manifest. They come from expo-notifications (FCM push support). The app never registers for push, but the permission and Firebase components are in the APK. **Fix wave:** the `c2dm.permission.RECEIVE` permission is now blocked via `android.blockedPermissions`. The Firebase components themselves are still merged in; a later release plan decides whether to strip them.
- `INTERNET` is also present (Metro in debug builds; check the release manifest in Plan 8).

## Decisions made in the plan (approved by the user)

| # | Decision |
|---|---|
| P1 | Photos downscaled on import (full 2048 px, JPEG 0.85; thumb 512 px, JPEG 0.8), encrypted with AES-256-GCM. The media key is a random 32-byte key inside the encrypted DB (`media.key`). Originals aren't kept. |
| P2 | Photos come from the gallery only, via the Android photo picker. No camera. |
| P3 | Daily reminder on by default at 20:00, "Time to check in.", one repeating `DAILY` trigger, fires even on days already written. Permission asked once, the first time the Journal tab opens. (The ask didn't work on a fresh install until F1 in the fix wave; see above.) |
| P4 | Entries can be added to today and past days, not future days. An entry's day never changes. |
| P5 | No Cards/Canvas toggle until Plan 7. `templateId` is stored on each entry type. |
| P6 | Plugin screens live in `src/plugins/<id>/screens/`; routes in `src/app/` stay thin. |

## Decisions made during the build (check these)

| # | Decision | Why | If wrong |
|---|---|---|---|
| R-A | A stub route file was added so typed routes compile before the real screen exists. | `typedRoutes` rejects links to routes that don't exist yet. | None. |
| R-B | Card press is a no-op until Task 7. | The detail route didn't exist yet. | None. |
| R-C | `journal/[id]` was registered in Task 7. | Registered together with its screen. | None. |
| R-D | Metro regenerates `.expo/types/router.d.ts`; nothing in the plan edits it. | It's generated, not committed. Documented in CLAUDE.md. | None. |
| R-E | ESLint isn't configured, so `npx expo lint` was dropped from the checks. | Running it tries to install eslint and write a config. | "Set up ESLint" is deferred. |
| R-F | The duplicate type-id check stays as a defensive check. | It's cheap and guards plugins that reuse an id. | None. |
| R-G | `expo prebuild --clean` ran only in Task 9. | It was the first native build since expo-image-picker, expo-image-manipulator and expo-notifications were added. It built clean. | None. |
| R-H | `microphonePermission: false` added to the image-picker plugin config. | Stops `RECORD_AUDIO` being merged in. Confirmed removed in the manifest. | None. |
| R-I | The reminder fix keys on `canAskAgain` in `notifier`, not in `reminder.ts`. | Keeps `reminder.ts` and its tests intact. | One more device check. |
| R-J | Storage and media-read permissions are blocked with `blockedPermissions`. | The system photo picker needs no permission. | The picker fails on old Android (device check). |
| R-K | Only the C2DM permission is blocked; the FCM service/receiver stay until Plan 8. | Without `google-services.json`, Firebase never initializes. | The F-Droid scanner flags it later. |
| R-L / R-M | No lock-overlay code change; verify with `uiautomator dump --compressed`. | The overlay already hides the content underneath from accessibility. | A device check catches it. |
| R-N | Deep-link reachability with Journal off stays deferred. | Needs a crafted link; not a user path. | A crafted link can add a future-dated entry. |

## Must fix before merge

- Notification permission prompt never appears on a fresh install (details above). **Resolved in the fix wave (F1):** `expoNotifier` now maps `denied` with `canAskAgain` to `undetermined`, so `askOnce` asks on a fresh Android 13+ install. Covered by `notifier.test.ts`. Re-checked on the device: see "Fix wave device rechecks".

## Final fix wave (after the whole-branch review)

Commits after 152916a:

| Item | Change |
|---|---|
| F1 + F7 | `toState` uses `canAskAgain` (Android 13+ reports `denied` before the first ask). The Journal tab never asks while the app is locked, and asks once after unlock. `askOnce` idempotence is now proven by the `asked` key. |
| F2 | The manipulator's own temp JPEG is always deleted after reading. `media.sweep()` first clears `cache/ImagePicker` and `cache/ImageManipulator` (skipped while an import is running; a failure only warns). |
| F3 | `android.blockedPermissions`: `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `READ_MEDIA_IMAGES`, `c2dm.permission.RECEIVE`. |
| F6 | The Reminders screen re-reads the permission when the app returns to the foreground and schedules once it's granted. While undetermined (and the reminder is on) it shows "Allow notifications". |
| F8 | The entry detail no longer flashes "This entry isn't here any more." while deleting. |
| F9 | A failed photo cleanup after an update or delete commits is logged, still notifies, and never rejects. |
| F10 | A read-only rating is one accessible element ("4 of 5 stars"). The Time row reads "Time, <time>". |
| F12 | CONTRIBUTING.md and CLAUDE.md corrections; this document. |
| F5 | Verify only: the lock overlay sets `importantForAccessibility="no-hide-descendants"` on the content underneath. |

### Fix wave device rechecks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Fresh install: prompt once on the Journal tab, alarm after allowing | Pass | Uninstall then install; `POST_NOTIFICATIONS granted=false` with no USER_SET flag. Onboarding ("Not now") then the Journal tab shows "Allow SelfJournal to send you notifications?". After Allow: `granted=true, flags=[USER_SET…]` and `dumpsys alarm` has `RTC_WAKEUP … origWhen=2026-11-13 20:00:00 … NOTIFICATION_EVENT`. Force-stop and relaunch: no second prompt. (The dev client asks for local network access first; that's debug-only.) |
| 2 | Deny, then grant in the background: alarm appears without a restart | Pass | `pm revoke` gives the Reminders screen an "Allow notifications" button. Toggling the reminder off and on cleared the alarm and showed the system prompt; "Don't allow" gives "Notifications are turned off for SelfJournal in your phone's settings." + "Open phone settings", with 0 alarms. Home, `pm grant`, then reopen (same pid 29198): the note is gone and the 20:00 alarm is back. |
| 3 | APK has no READ/WRITE_EXTERNAL_STORAGE, READ_MEDIA_IMAGES or c2dm RECEIVE | Pass | `aapt dump permissions app-debug.apk` lists none of the four. |
| 4 | Picking photos still works | Pass | The system photo picker opens with no storage permission. 2 photos (one 12 MB, 4000x3000) imported; `files/media` has a `.full`/`.thumb` pair each, and `head -c 3 *.full` gives `4ed96c` (not `ffd8ff`). `cache/ImagePicker` and `cache/ImageManipulator` were empty right after import (F2a). The saved card shows the entry. |
| 5 | Force-stop mid-import, relaunch: temp dirs empty | Pass | 7 photos picked; force-stopped as soon as a temp file appeared: `cache/ImagePicker` held `7d66c6af-….jpeg` (12,023,388 bytes, plaintext). After relaunch both dirs are empty, and the saved entry's 4 media files are untouched. |
| 6 | Locked: `uiautomator dump --compressed` has no journal text (F5) | Pass | PIN 2468 set, entry "Zephyrlantern" / "Quokkaharbour" on the Journal tab, Home for 36 s, reopen. The compressed dump shows only the PIN pad ("Welcome back", digits, Unlock, Forgot PIN?). A plain dump still has 3 matches for the entry text (hidden views), as expected. |
| 7 | Reminder fires with "SelfJournal" / "Time to check in." | Pass | Time set to 11:05 PM via the Time row (it read "Time, 11:05 PM"), app in the background. It posted at 23:08 (inexact window): channel `reminders`, tag `journal.daily-reminder`, `vis=PRIVATE`, title "SelfJournal", body "Time to check in." in the shade. The small icon is the app's own resource and renders correctly (still the Expo template "A" artwork; replace before release). |

Rechecks were run on 2026-11-12 on emulator-5554 (API 37) with Metro on 8082, after the emulator's screen lock was cleared.

## Must do at the start of Plan 3

- **Habits needs a way to create a Habit win entry without importing Journal.** Options: an event (e.g. `habit.winRequested`) that Journal handles, or a Journal-provided API exposed through a core registry. The Habit win type is already contributed by the Habits plugin (`entryTypes`), but something still has to write the entry. Decide this first.
- Decide whether to strip the Firebase/C2DM manifest entries before the first release.

## Deferred minor findings

None of these block merge. Items the fix wave resolved are left out.

**Carried over, not minor**
- The app and notification icon are still the Expo template "A" artwork. Replace before the first release (Plan 8).
- Deep links can open journal routes while the Journal plugin is off, and the service doesn't enforce P4 (a crafted link could add an entry to a future day). This needs a crafted link and isn't a user path in Plan 2 (R-N).
- Set up ESLint (R-E). One known error: `react-hooks/globals` in `lock-gate.test.tsx`.
- Firebase/FCM components from expo-notifications are still merged into the APK (R-K). So is `com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE` from a merged library. Plan 8 decides.

**From the fix-wave re-review**
- `media.sweep()`: an import that starts after the `importing === 0` check but before `sweepTemp` finishes could lose its picker temp file. The sweep only runs at boot, so this is unlikely.
- The Reminders screen's "Allow notifications" button can show again after the user dismisses the system prompt, because `canAskAgain` stays true. This is harmless.

**Core / plugin host**
- `host.ts`: listener errors are reported through `onError` with a "failed to activate" message and the toggled plugin id.
- No test of `ctx.bus.on` unsubscribing while enabled, or of a double-off on a later disable.
- The scoped settings prefix could collide if a plugin id contained a dot (theoretical; ids are fixed).
- `src/core/test-services.ts` uses the `jest` global inside `src` (a test-only helper).

**Entry types**
- `validate.test.ts` lacks cases: required empty number, unknown raw keys ignored, `" 2,5 "` whitespace, `"0"`, `"5."`.
- `validate.ts`: `replace(",", ".")` replaces only the first comma (the regex rejects the rest anyway).

**Media**
- The stale-pending sweep's select-then-delete can race a commit; the commit then silently updates 0 rows.
- The concurrent-key test doesn't exercise `ON CONFLICT` across two stores.
- The discard traversal guard only checks a literal `/../`.
- The placeholder icon size uses the `space.xl` token.

**Journal service**
- `update`/`remove` read the old entry outside the transaction (a stale removed-photo list if interleaved).
- Duplicate `photoIds` abort the transaction (no dedupe).
- Test gaps: update with retained/reordered photos, transaction rollback, rowid tiebreak.
- `getJournalService` ignores later `lookupType` closures (undocumented).
- `days.test` sets TZ after hoisted imports (works lazily; move it to a comment or the jest config).

**Journal screens**
- A rejected `listDay` is swallowed: a blank screen with no retry. Detail delete failures are silent, and load errors are swallowed.
- Nav buttons are 40 dp and the Today chip about 33 dp, under the 48 dp touch target.
- The card's accessibility label omits the rating, with a trailing ": " when there's no title. Rating fields in the editor lack a field-name label.
- Styling literals: `font.title*0.8`, spacing tokens used as icon sizes, opacity literals, `minHeight 48`, an unchecked `IconName` cast; the theme imports a type from core.
- Editor: Leave is guarded by state, not a ref (a same-frame double tap dispatches twice). An unchanged edit saved then backed out quickly can pop an extra screen. Unmounting without the guard leaves session-imported media to the boot sweep. In new mode, an unknown or disabled `typeId` shows the edit-unavailable copy.
- The editor test doesn't prove `disablePrevention()` releases the guard on save (the router mocks ignore it). Worth a device check.
- Detail: no test for the double-tap delete guard or for photos rendering; the route param `id` may be `string[]`.
- Not tested at the screen level: day rollover, `use-today` focus/unmount, sand tint.

**Reminder**
- A rapid toggle during an in-flight sync can leave a reminder scheduled while the switch is off; `change` spreads a stale closure.
- `readReminder("10:60")` is untested; the get-then-set in `askOnce` isn't atomic; the default state flashes before load.
