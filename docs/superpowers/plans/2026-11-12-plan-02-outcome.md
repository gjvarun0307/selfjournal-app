# Plan 2 (Journal: data + Cards): outcome and handoff

*Completed 2026-11-12 on branch `plan-02-journal` (not merged, not pushed).*

**Status:** all 9 tasks done. 169 tests pass (28 suites) and `tsc` is clean. Lint is not run (see R-E). On-device checks on the Android emulator (API 37, `Medium_Phone`): 9 pass, **1 fails** (the notification permission prompt never appears; see "Must fix before merge").

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
- Added by merged libraries: `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `READ_MEDIA_IMAGES` (max SDK 33, from expo-image-picker), `DETECT_SCREEN_CAPTURE`, `ACCESS_NETWORK_STATE`, `CHANGE_WIFI_MULTICAST_STATE`, `ACCESS_LOCAL_NETWORK`, plus launcher badge permissions.
- `READ_MEDIA_IMAGES` and `READ_EXTERNAL_STORAGE` are present (both limited to old SDKs) and the plan expected neither. The photo picker itself needs no permission at runtime.
- **Finding:** `com.google.android.c2dm.permission.RECEIVE` and about 28 `firebase` string matches appear in the merged manifest. They come from expo-notifications (FCM push support). The app never registers for push, but the permission and Firebase components are in the APK. Not removed here. A later release plan should decide whether to strip them (`tools:node="remove"` or a config plugin), given the no-network, no-telemetry promise.
- `INTERNET` is also present (Metro in debug builds; check the release manifest in Plan 8).

## Decisions made in the plan (approved by the user)

| # | Decision |
|---|---|
| P1 | Photos downscaled on import (full 2048 px, JPEG 0.85; thumb 512 px, JPEG 0.8), encrypted with AES-256-GCM. The media key is a random 32-byte key inside the encrypted DB (`media.key`). Originals aren't kept. |
| P2 | Photos come from the gallery only, via the Android photo picker. No camera. |
| P3 | Daily reminder on by default at 20:00, "Time to check in.", one repeating `DAILY` trigger, fires even on days already written. Permission asked once, the first time the Journal tab opens. (The ask doesn't work on a fresh install; see above.) |
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

## Must fix before merge

- Notification permission prompt never appears on a fresh install (details above).

## Must do at the start of Plan 3

- **Habits needs a way to create a Habit win entry without importing Journal.** Options: an event (e.g. `habit.winRequested`) that Journal handles, or a Journal-provided API exposed through a core registry. The Habit win type is already contributed by the Habits plugin (`entryTypes`), but something still has to write the entry. Decide this first.
- Decide whether to strip the Firebase/C2DM manifest entries before the first release.

## Deferred minor findings

(filled in after the final review)

Also deferred: set up ESLint (R-E). The lock overlay's accessibility tree still exposes the screen underneath (uiautomator shows both), which matters for screen readers.
