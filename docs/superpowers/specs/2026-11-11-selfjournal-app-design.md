# SelfJournal: first release design

*Date: 2026-11-11 · Status: draft for approval*

Calls I made without the user saying so are marked **[Claude's call]** throughout. Everything else was stated or confirmed by the user.

---

## 1. Intent: what this is and why

SelfJournal is a self-help app that collects in one place the things people currently spread across several apps: journaling, building good habits, breaking bad ones, and the game-like systems that make you want to come back. It is meant for people recovering from addictions, dealing with depression, or just working on themselves.

It started as a journaling app because the user never managed to stick with journaling. Notepad failed because they forgot about it. Mood-tracker journaling apps fixed the forgetting with notifications, but journaling in them felt like filling in a form: text, maybe an emoji, no fun. Most self-help apps are also money-grubbing. SelfJournal should be:

- **Fun to come back to.** Journaling borrows from *junk journaling*, a physical hobby of collaging photos, tape, stickers and notes into pages that feel hand-made. Gamification borrows from Steam/PlayStation trophies and Persona-style social stats.
- **Kind.** No shaming, no resets to zero, no red alarms.
- **Modular.** Every feature is a plugin that can be switched on or off, and some plugins feed each other. For example, habit progress earns XP from the Gamification plugin.
- **Free and private.** No accounts, no server, no ads. All data stays on the phone.

It is **not** a treatment or therapy app and must never present itself as a replacement for professional help. It is a journal of your life and your recovery, with tools that make keeping that journal rewarding.

### Audience and distribution
- Strangers downloading it. **For now, signed APKs published as GitHub releases.** A store release (Play Store, maybe F-Droid) comes later and will be decided then.
- Open source on GitHub.
- Open source contributors add new plugins (and later, themes) through GitHub pull requests.

---

## 2. Goals, non-goals, anti-goals

**Goals for the first release**
- A plugin system with on/off switches, and plugins that can optionally feed each other.
- Five plugins: **Journal, Habits, Recovery, Gamification, Life stats**.
- Export/backup of all data to a file, and restore from it.

**Non-goals for the first release** (planned for the next release)
- Cosmetic themes that reskin the whole app (Jarvis, game themes).
- Recommended plugin bundles.
- A custom entry-type/template builder (users designing their own forms and canvas layouts).
- New plugins such as pomodoro and exercise.
- Web version (dropped), cross-device sync (dropped), accounts (none).

**Anti-goals: failure even if it technically works**
- **Streaks that reset to zero anywhere in Recovery.** Not even optional. The user's reasoning: in high spirits you'd opt in, then after a slip, in low spirits, it hurts. Habits don't use resetting streaks either **[Claude's call, following the same rule]**.
- Red alarms, big "0", or "streak lost" screens after a slip.
- Taking away XP, levels or achievements for any reason.
- Ads, subscriptions, paywalls or upsells.
- Personal data leaving the device.
- Presenting itself as professional help.
- Every journal page looking identical (templates must vary; see §6.6).

---

## 3. Constraints and stack

- **Expo (React Native), TypeScript.** Chosen by the user.
- **Android first.** iOS should mostly work through Expo but is not a release target. **No web.**
- **Local-only, encrypted data.** No backend, no accounts, no sync. Storage is encrypted at rest (user's decision; see §11.1). **[Claude's call]** SQLite with SQLCipher (`expo-sqlite` supports it) for structured data. Photos and GIFs are copied into app-private storage, so deleting a gallery photo doesn't break a journal page.
- **Offline-first.** The only network use allowed is checking GitHub's public releases for a newer version (§11.3). No personal data is ever sent anywhere.
- **No `expo-updates` / EAS Update in the first release [Claude's call].** It would contact Expo's servers and rule out F-Droid later.
- **Built-in plugins only.** All plugins ship inside the app binary. There is no downloading of third-party plugin code at runtime.
- **Style through design tokens.** **[Claude's call]** Colours, fonts, radii and spacing come from a token/theme layer, not hard-coded values, so the next release's cosmetic themes can reskin the whole app without rewriting screens.

---

## 4. Plugin system

### 4.1 What a plugin is
A plugin is a self-contained module in the codebase (for example `src/plugins/<id>/`) that registers itself with a central registry. A plugin can declare:

- **Identity:** id, name, description, icon.
- **Screens / navigation entries** it adds (only shown when enabled).
- **Journal entry types** it contributes (a form schema plus a default canvas template; see §6.5).
- **Events it emits**, e.g. `habit.completed`, `recovery.cleanDay`, `recovery.slip`, `journal.entryCreated`.
- **Events it listens to.** This is how plugins connect.
- **XP rules and achievements** it contributes to Gamification.
- **Stat sources** it offers to Life stats (actions that can be mapped to a stat).
- **Its own data tables/migrations.**

### 4.2 Connections between plugins
- Plugins connect **only through events and declared contributions**, never by importing each other's internals. If either side is switched off, the connection quietly does nothing.
- Connections in the first release:
  - Habits → Journal: "log the fruits of labour" creates a *Habit win* entry.
  - Recovery → Journal: after a slip, offer a *Slip reflection* entry; plus a *Recovery note* entry type for therapy/meeting/sponsor notes.
  - Habits, Recovery, Journal → Gamification: XP and achievements.
  - Habits, Recovery, Journal → Life stats: stat points via user mappings.
  - Gamification → Journal: unlocked achievements become stickers (§8).
- The user expects connections to get harder to manage as plugins grow, so **not every plugin needs to connect to every other**. Recommended bundles (next release) will address discoverability.

### 4.3 Switching plugins on and off
- A **Plugins** screen lists all built-in plugins with on/off switches and short descriptions.
- **[Claude's call]** Switching a plugin off hides it and stops its events but **keeps its data**. Switching it back on restores everything. Permanently deleting a plugin's data is a separate, clearly-labelled action.
- **[Claude's call]** On first launch, all five first-release plugins are on.
- Contributors add plugins via PRs. The plugin interface should be documented in the repo (a short CONTRIBUTING guide) so outsiders can build one without touching the core.

---

## 5. Navigation **[Claude's call]**

Bottom tabs, showing only tabs for enabled plugins:
**Journal** (today's page) · **Habits** · **Recovery** · **Me** (level, XP, trophy case, Life stats chart) · plus **Settings** (plugins, reminders, backup, support links) reachable from Me or a header icon.

---

## 6. Journal plugin

### 6.1 Structure
- The journal is organised by **day**.
- A day contains **entries**. Each entry has a type (e.g. *Game cleared*), the filled-in form fields, attached photos, and timestamps.
- A day also has **one canvas**: a tall, vertical "paper" page holding everything visual for that day.

### 6.2 Two views of the same day, switchable any time
A toggle at the top of the day switches between **Cards** and **Canvas**, including mid-writing. Both are views of the same data. Switching never duplicates or loses anything.

- **Cards view:** each entry is a themed card (a game card with cover art, a recipe card, a feelings card…). Tapping a card opens its **detail view**: the full filled-in form and photos, with **Edit**, **View as canvas frame**, and **Switch whole day to canvas**.
- **Canvas view:** the day's page.

Reference mockups from the session: `.superpowers/brainstorm/*/content/journal-two-views.html` and `journal-directions.html` (A = free canvas, B = memory cards).

### 6.3 The canvas
- **Scrolls vertically only. Never horizontally, no infinite board.** The width is the screen width, and the page grows downward. (The user found a 2D "chartboard" overwhelming.)
- Holds **items**: photos, text notes, washi tape, stickers, freehand doodles, GIFs. **[Claude's call]** GIFs come from local files, since there is no online GIF search in an offline app.
- Items can be moved, rotated, resized and layered.
- **[Claude's call]** Positions and sizes are stored relative to page width, so a page decorated on one phone looks right on another.

### 6.4 Frames
- Each entry has a **frame**, a rectangle on the day's canvas that marks the area belonging to that entry.
- **A frame is a window, not a container.** Stickers, doodles and GIFs can live *between* frames, belonging to the day rather than to any entry.
- Viewing one entry "as canvas frame" shows **only that rectangle of the day's canvas**, cropped. Anything crossing the frame's edge gets cut off at the edge. This is intended.
- **[Claude's call]** Moving a frame moves the items fully inside it. Items outside it or crossing its edge stay put.
- If the user has never arranged a frame, the app **auto-arranges** its contents using the entry type's template so it looks good. Once the user moves something in it, their arrangement is kept.
- **[Claude's call]** A new entry's frame is placed at the bottom of the day's canvas.

### 6.5 Entry types and templates
Each entry type has a small **form** (fields for the cards/detail view) and a **default canvas template** (how its fields and photos land in its frame). First-release built-in types:

| Type | Example fields |
|---|---|
| How was the day | free text, optional photos |
| Game cleared | game name, hours played, rating, "what I want to remember", photos |
| Cooked something | dish, rating, notes, photos |
| Outing / place | place, photos, notes |
| Feelings | free text, optional photos |
| Habit win *(from Habits)* | habit, note, photos |
| Recovery note *(from Recovery)* | e.g. what came up in therapy/meeting, free text |
| Slip reflection *(from Recovery)* | what happened, how I feel, optional |

**[Claude's call]** These field lists are starting points; the builder may refine them.

### 6.6 Avoiding sameness
**[Claude's call]** Templates add small random variation each time they're applied (tilt, tape colour, sticker choice), so two "Game cleared" frames look related but not identical. There's a setting to turn this off for people who prefer uniform pages.

### 6.7 Stickers
A sticker tray offers a built-in pack plus any **achievement stickers** the user has unlocked (§9).

### 6.8 Entry data vs canvas items **[Claude's calls, following the frame-is-a-window model]**
There are two kinds of canvas items:

- **Linked items** show an entry's own data: its text fields and its photos. They are **live views**, not copies:
  - Editing a field updates its text on the canvas. The item keeps its position, size and rotation.
  - Adding a photo to the entry adds a linked photo item into the entry's frame, at a free spot (or via auto-arrange if the frame is untouched).
  - Removing a photo from the entry removes its linked item.
  - Removing a linked item from the canvas only **hides** it from the canvas (with a way to show it again). Entry data is changed only through the form.
- **Day items** are everything added directly on the canvas: stickers, tape, doodles, GIFs, and free photos or text notes. They belong to the **day**, not to any entry, wherever they sit, even inside a frame. They never appear in the card or detail view, and the window model shows them cropped in frame views.
- **Writing directly on the canvas without creating an entry is allowed.** It creates day items.
- **Deleting an entry** removes its frame and its linked items. Day items stay where they are.
- "Untouched" for auto-arrange means none of the frame's linked items have been moved, resized or rotated by the user. Once one has, the frame's layout is kept and only new linked items get auto-placed.

---

## 7. Habits plugin (forming good habits)

- **Anything counts:** gym, piano, brushing teeth at night.
- **Create a habit:** name, icon, frequency (*every day*, *N times per week*, or *specific weekdays*), optional reminder time(s).
- **"Done" is whatever the user says.** They tap to mark a day done, with no proof or timers. Undo is allowed. **[Claude's call]** Past days can be marked or unmarked too, since forgetting to tap shouldn't cost anything.
- **Progress without streaks [Claude's call]:** "3 of 5 this week" and a calendar of filled-in days. No counter ever resets.
- **Log the fruits:** optional note/photo when marking done, which creates a *Habit win* journal entry.
- Emits `habit.completed` for Gamification and Life stats.

---

## 8. Recovery plugin (breaking harmful habits)

- Covers anything from substances to nail biting, with the same gentle design for all.
- **Create a tracked behaviour:** name, start date, and optional **wins** to track:
  - money saved (user enters cost per day),
  - time won back (hours per day),
  - total clean days.
- **Main screen leads with:** "In recovery since *Oct 19* · *23 days*", then the wins built up so far.
  - **The "in recovery since" date never resets on a slip.**
  - **There is no current streak, not even optional** (see anti-goals).
- **Logging a slip:** a calm, plain button. A slip **takes a little off the wins** but never resets them. **[Claude's call]** It removes one day's worth (one day of money saved, one day of time won back, and that day doesn't count as a clean day). No red, no alarms, no "0".
- After a slip, the app **offers** (skippable) a *Slip reflection* journal entry.
- *Recovery note* entry type for therapy, meetings, sponsor conversations.
- **"Need support?" link [Claude's call]:** a quiet link on the Recovery screen to helplines the user can set for their country (with a sensible default list). It never pops up uninvited.
- Emits `recovery.cleanDay` (once per day without a slip) and `recovery.slip`. **Slips never remove XP or achievements.**

---

## 9. Gamification plugin

- **XP** from real actions, with rules declared by each plugin: journal entry created, habit done, recovery clean day, achievement unlocked, etc. XP adds up into a **level**. **[Claude's call]** The exact XP values and level curve are the builder's to tune. Aim for an early level-up within the first day or two, then slower.
- **Achievements** in the style of Steam or PlayStation trophies:
  - tiers: bronze, silver, gold, platinum (platinum = all of one plugin's achievements);
  - some **hidden** until unlocked;
  - **contributed by each plugin** (e.g. *First page*, *Journaled every day for a week*, *30 days in recovery*, *Cooked 10 dishes*).
- **Unlocking an achievement** shows a celebratory moment and adds that achievement as a **sticker** to the sticker tray, to place on that day's canvas.
- **Trophy case** screen listing earned and locked (non-hidden) achievements.
- **Only goes up.** No XP loss, no level loss, no streak multipliers.
- **Counting rules [Claude's calls]:**
  - XP is awarded only for events that happen while Gamification is on. There's no back-pay for time it was off.
  - XP for a given action is awarded **at most once** (e.g. once per habit per day). Unmarking and re-marking a habit does not earn XP again, and unmarking never removes XP.
  - **Achievements are checked against stored history**, so a newly added achievement ("Cooked 10 dishes") unlocks immediately for someone who already qualifies, and re-enabling Gamification unlocks anything earned meanwhile.
  - Keep a permanent award log (XP grants, unlocks) so "only goes up" holds even if source data is later edited or deleted.

---

## 10. Life stats plugin (inspired by Persona's social stats; separate from Gamification)

- **3 to 6 stats, default 5.** The user may reduce the count (e.g. to 3, like Persona 3) or add up to 6. Stats can be renamed. **[Claude's call]** Default names: *Discipline, Body, Mind, Heart, Craft*, original to this app and not Persona's.
- **Each stat has a rank from 1 to 5, starting at 1**, built up over time like a new game save.
- Stats gain points from **mapped actions**: a specific habit, a recovery clean day, creating a journal entry, etc. The user decides which actions feed which stat. The app suggests defaults when a habit or behaviour is created.
- **Daily decay:** each stat loses a fixed number of points per day, so ranks reflect recent life rather than an all-time best. **Rank never drops below 1.**
- Shown as a radar chart (pentagon for 5, hexagon for 6, etc.) on the Me tab.
- **The user flagged this mapping as tricky and wants to design the details carefully during implementation.** The builder should propose concrete numbers (points per action, decay per day, rank thresholds) and a mapping UI, and check them with the user during implementation. This is a checkpoint, not a blocker: provisional numbers are fine until the user signs off.
- **[Claude's call]** Like XP, stat points come only from events while Life stats is on. Decay is applied per calendar day, catching up on the days the app wasn't opened.

---

## 11. Data, privacy, backup, updates, notifications

### 11.1 Privacy on the device (user's decision: app lock + encrypted storage + encrypted backups)
- **App lock:** optional PIN and/or fingerprint/face unlock, set in Settings and offered during first-run setup. The app re-locks when it goes to the background (short grace period, builder's call).
- **Encrypted storage:** the database is encrypted (SQLCipher). Media files are encrypted at rest too; the builder picks the method, minding canvas performance. **[Claude's call]** The encryption key is generated on first launch and kept in the Android Keystore (via `expo-secure-store`), not derived from the PIN. A forgotten PIN never destroys data, and it can be reset through the phone's own lock-screen credential.
- **Android Auto Backup is switched off [Claude's call]**, so app data is never silently copied to Google Drive.
- **Notifications use generic text** ("Time to check in"), never naming the habit or behaviour **[Claude's call]**.
- No analytics, no telemetry.

### 11.2 Export / backup
- Export everything (database + media) to a **single encrypted, password-protected file** via the system share sheet. The password is chosen at export time.
- The app warns clearly that a forgotten backup password means the backup can't be opened.
- **Restore** from such a file (password required) replaces current data after a clear confirmation.

### 11.3 Updates
- **[Claude's call]** The app checks GitHub's public releases (latest version tag) at most once a day. If a newer version exists, it shows a gentle, dismissible prompt linking to the release. The check sends nothing personal, and there's a setting to turn it off.
- When a store release happens later, store-native update prompts get added then.

### 11.4 Notifications
- Local notifications only. Habit reminders at user-chosen times.
- **[Claude's call]** One gentle daily journal reminder (on by default, time adjustable, can be turned off), since forgetting is what killed notepad journaling for the user.
- Notifications never shame ("You broke your streak!") or nag repeatedly.

---

## 11a. Build order **[Claude's call]**
The whole first release ships together as decided. Within it, build the riskiest foundations first: plugin registry/event bus and encrypted storage, then Journal **Cards** view and entry types, Habits, Recovery, Gamification, Life stats, then the **Canvas** and frames. If the canvas runs long, that's a conversation with the user, not a silent cut.

---

## 12. Left to the builder

- Visual design of the base app (within the design-token constraint), card designs per entry type, sticker art.
- Canvas implementation details: gesture library, rendering approach, doodle stroke storage, auto-arrange algorithm.
- Database schema and migrations, event bus design, plugin registry shape.
- XP values, level curve, achievement list (beyond the examples), Life stats numbers (to be confirmed with the user per §10).
- Default helpline list.
- Repo structure, testing approach, CONTRIBUTING guide for plugin authors.
