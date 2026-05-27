# Visitor / Anonymous Mode

**Status:** Approved design, ready for implementation plan
**Date:** 2026-05-27

## Goal

Let users skip authentication and use Drummate with full functionality, storing all data locally in Dexie. Provide a clear upgrade path so visitors can later sign up (data migrates) or sign in (local data discarded in favor of cloud). Visitors can also log off at any time.

## Motivation

Today the app gates the entire UI behind `<AuthScreen />`. A user who wants to try Drummate must commit to creating a Firebase account up-front. Visitor mode removes that friction: the whole app already works locally (Dexie + localStorage UI prefs), so there is no functional reason to require sign-up.

## Non-goals

- **Firebase Anonymous Auth.** We do not create a phantom Firebase UID. There is no benefit beyond what `pushAllLocal*` already provides for upgrade migration.
- **Per-feature gating.** Every feature works without cloud; nothing is hidden in visitor mode.
- **Cloud backup for visitors.** Visitor data lives only in this browser's Dexie. No cross-device sync.
- **A separate "delete my data" button.** Log off (with confirmation) is the destructive exit; wipe-on-entry covers the rest.

## Architecture

A single new boolean, `isVisitor`, lives in `AuthContext` alongside `user`. Persisted to `localStorage['drummate_visitor']` as the string `'true'`. Absence or any other value means false.

The app gate in `App.jsx`:

```js
if (!user && !isVisitor) return <AuthScreen />;
```

All existing `if (user)` guards around `firebaseBackend.push*` calls in [App.jsx](../../../src/App.jsx) continue to work unchanged. In visitor mode `user === null`, so every cloud push naturally short-circuits. **No Firestore push site needs to change.**

The sync init effect already bails when `!user || !authReady`, so it does not run for visitors. The only addition is a local-only timezone init for visitors (see Timezone below).

## Components

### `AuthContext` ([src/contexts/AuthContext.jsx](../../../src/contexts/AuthContext.jsx))

New state:
- `isVisitor: boolean` — derived from `localStorage['drummate_visitor']` at init, kept in sync via a `useEffect` writeback.

New actions:
- `enterVisitorMode()` — wipes Dexie (see "Dexie wipe"), sets `isVisitor = true`, persists to localStorage.
- `exitVisitorModeForAuth(intent)` — clears `isVisitor`, clears localStorage, sets a session-scoped React state `fromVisitorIntent: 'signIn' | 'signUp' | null`. Used by Settings "Sign in" / "Sign up".
- `exitVisitorModeLogOff()` — wipes Dexie, clears `isVisitor`, leaves `fromVisitorIntent = null`.

`fromVisitorIntent` is React state (not localStorage). It naturally clears on refresh, which is correct: after a refresh the user is signed in or unsigned, and the banner is no longer relevant.

The existing `signIn` / `signUp` callbacks gain a post-success branch:
- If `fromVisitorIntent === 'signUp'`: call `firebaseBackend.pushAllLocal(newUser.id)`, `pushAllLocalLogs`, `pushAllLocalNotes`, `pushAllLocalPractices` **before** the normal sync init effect runs. These already filter `syncedOnce: false`, which matches every local visitor row.
- If `fromVisitorIntent === 'signIn'`: wipe Dexie immediately. The normal `pullAll*` in the sync init effect will populate from cloud.

The migration is awaited inside the `signUp` callback so the UI shows "signing up..." state until the local data is committed to Firestore. If the migration push throws, surface the error and **do not** clear `fromVisitorIntent` — the user is signed up but the banner stays so they can retry. (Practically, `pushAllLocal*` failures are silent in current code; we keep that behavior but log to console.)

### `AuthScreen` ([src/components/AuthScreen.jsx](../../../src/components/AuthScreen.jsx))

Additions:

1. **"Continue as guest" button** below the existing form, separated by a horizontal divider with the text "or" centered on it. Clicking opens a confirmation:
   > "Continue as guest? This will clear any existing local data on this device. Your practice data will not be backed up to the cloud."
   > Buttons: "Cancel" / "Continue as guest".

   On confirm, call `enterVisitorMode()`.

2. **Upgrade banner** at the top of the card, shown when `fromVisitorIntent !== null`:
   > "Your local practice data will be saved to your new account when you sign up."
   (Slightly different copy if `fromVisitorIntent === 'signIn'`: "Signing into an existing account will replace your local data with your account's data.")

3. **Initial form mode** respects `fromVisitorIntent`: `'signUp'` opens in sign-up mode, `'signIn'` opens in sign-in mode, `null` keeps the current default (sign-in).

### `SettingsPanel` ([src/components/SettingsPanel.jsx](../../../src/components/SettingsPanel.jsx))

When `isVisitor === true`:

- Replace the avatar initial with a "Guest" label (small text badge in the same spot).
- Hide name/email display.
- Replace the single "Sign out" button with three buttons stacked vertically:

  | Button | Action |
  |---|---|
  | **Sign in** | `exitVisitorModeForAuth('signIn')` → AuthScreen |
  | **Sign up** | `exitVisitorModeForAuth('signUp')` → AuthScreen |
  | **Log off** | Confirmation modal, then `exitVisitorModeLogOff()` → AuthScreen |

  Log off confirmation copy:
  > "Log off? Your local practice data will be deleted. To keep it, sign up instead."
  > Buttons: "Cancel" / "Log off".

When `isVisitor === false && user`, the panel renders as today (unchanged).

### `App.jsx`

Two small additions:

1. The gate `!user && !isVisitor` (instead of `!user`).
2. A new effect that runs `initTimezoneLocal()` once when `isVisitor && !user`. This sets the module-level timezone from `localStorage['drummate_timezone']` (defaulting to `America/Los_Angeles`) without touching Firestore. Reuses logic from [src/services/timezoneService.js](../../../src/services/timezoneService.js).
3. The existing `purgeExpiredTrash` effect already runs unconditionally — only the cloud push of expired items is gated by `if (user)`. No change needed; visitors get local purge for free.

### Backend ([src/services/backends/firebaseBackend.js](../../../src/services/backends/firebaseBackend.js))

No new methods. Migration on sign-up uses the existing `pushAllLocal`, `pushAllLocalLogs`, `pushAllLocalNotes`, `pushAllLocalPractices`.

### Timezone service

Add `initTimezoneLocal()` (or extend `initTimezone` to accept a `null` backend and skip the Firestore reconciliation branch). The localStorage-only read path already exists inside `initTimezone`; we expose it.

### Prior hours service ([src/services/priorPracticeService.js](../../../src/services/priorPracticeService.js))

`setPriorHours(hours, backend, userId)` writes to localStorage and then calls `backend.setUserSetting(userId, ...)`. Update it to skip the backend call when `userId` is falsy. `getPriorHours` already reads from localStorage only. `initPriorHours` is only called from the sync init effect, which already doesn't run for visitors, so no change there. The SettingsPanel "prior hours" input continues to work for visitors via localStorage only.

### Dexie wipe

Implement once in [src/services/database.js](../../../src/services/database.js) as `wipeAllLocalData()`:

```js
await db.transaction('rw', db.practiceItems, db.practiceLogs, db.notes, db.metronomePractices, db.syncQueue, async () => {
  await db.practiceItems.clear();
  await db.practiceLogs.clear();
  await db.notes.clear();
  await db.metronomePractices.clear();
  await db.syncQueue.clear();
});
```

Called from `enterVisitorMode`, `exitVisitorModeLogOff`, and the sign-in-from-visitor branch.

Not wiped: `localStorage` UI prefs (language, theme, timezone, compact mode, prior hours, goal). These are device-level preferences that the user reasonably expects to survive — they are not "practice data."

### i18n keys ([src/contexts/LanguageContext.jsx](../../../src/contexts/LanguageContext.jsx))

New keys in both `en` and `zh`:

- `auth.continueAsGuest`
- `auth.guestWipeWarning`
- `auth.guestConfirmButton`
- `auth.upgradeBannerSignUp`
- `auth.upgradeBannerSignIn`
- `auth.dividerOr`
- `settings.guestBadge`
- `settings.guestSignIn`
- `settings.guestSignUp`
- `settings.guestLogOff`
- `settings.guestLogOffConfirm`

## Data flow

### Visitor session

1. User taps **Continue as guest** on AuthScreen.
2. Confirm dialog → `enterVisitorMode()` wipes Dexie, sets `isVisitor`.
3. App renders. `initTimezoneLocal()` sets timezone from localStorage.
4. `purgeExpiredTrash(30)` runs (local-only, already implemented).
5. User practices, takes notes, etc. Every push is gated by `if (user)`, so nothing is sent to Firebase. Nothing is enqueued to `syncQueue` because the push functions short-circuit before reaching the queue.
6. `OfflineBanner` subscribes to `db.syncQueue.count()` via liveQuery; it stays at 0, so the banner is naturally hidden.
7. Refresh: `AuthContext` reads `localStorage['drummate_visitor']`, restores `isVisitor = true`, app loads directly.

### Visitor → Sign up (migration)

1. Settings → **Sign up** → `exitVisitorModeForAuth('signUp')`.
2. AuthScreen renders in sign-up mode with the upgrade banner.
3. User submits credentials. `signUp` succeeds → `firebaseBackend.signUp` returns the new user.
4. `AuthContext.signUp` callback sees `fromVisitorIntent === 'signUp'` and calls the four `pushAllLocal*` methods sequentially with `newUser.id`. These filter `syncedOnce: false`, which is every local row.
5. `setUser(newUser)`, clear `fromVisitorIntent`.
6. App re-renders past the gate. The normal sync init effect runs: pulls (now containing the just-pushed data), `pushAllLocal` (no-op, everything is `syncedOnce: true` after step 4), `subscribeToChanges`.

### Visitor → Sign in (existing account, local discarded)

1. Settings → **Sign in** → `exitVisitorModeForAuth('signIn')`.
2. AuthScreen renders in sign-in mode with the warning banner.
3. User submits credentials. `signIn` succeeds.
4. `AuthContext.signIn` callback sees `fromVisitorIntent === 'signIn'` and calls `wipeAllLocalData()` **before** `setUser(newUser)`.
5. `setUser`, clear `fromVisitorIntent`.
6. Normal sync init runs: `pullAll*` populates Dexie from cloud.

### Visitor → Log off

1. Settings → **Log off** → confirmation modal.
2. Confirm → `exitVisitorModeLogOff()`: wipes Dexie, clears `isVisitor`, leaves `fromVisitorIntent = null`.
3. App gate flips, AuthScreen renders with no banner.

## Edge cases

- **Concurrent state:** `enterVisitorMode` is only callable from AuthScreen, so `user` is guaranteed `null` at entry. `exitVisitorMode*` is only callable from Settings, where `isVisitor` is guaranteed `true`. No "both flags true" state should arise; if it ever did, the gate treats `user` as winning (renders the app, sync runs normally).
- **Refresh during an in-flight migration:** The user-facing `signUp` call awaits the migration. If the page is closed mid-flush, the next session will be signed in with `user`, and the sync init effect's `pushAllLocal*` will finish the job (those exact same methods re-run on every sync init for any `syncedOnce: false` rows).
- **Existing user signs out → clicks Continue as guest:** Sign-out today does not clear Dexie. The visitor wipe-on-entry now does. The confirmation dialog warns about this explicitly. Users who want to preserve their data should not enter visitor mode.
- **Visitor has unsaved practice timer:** The existing `beforeunload` pending-log handler writes to localStorage. After a wipe-on-entry, that pending log is still recovered into the now-empty Dexie on next load. Acceptable — the recovered log just becomes the first row in the new visitor session. The pending log key is small enough not to warrant clearing.
- **`syncQueue` already contains entries from a prior session:** Wipe-on-entry clears it. The sync init effect's `flushSyncQueue` never runs for visitors (gated by `user`).
- **Voice / encouragement / metronome:** All client-side. Work unchanged.

## Testing

### Unit tests

- `AuthContext` state transitions:
  - `enterVisitorMode` sets flag, writes localStorage, calls `wipeAllLocalData`.
  - `exitVisitorModeForAuth('signUp')` clears flag, sets `fromVisitorIntent = 'signUp'`.
  - `exitVisitorModeForAuth('signIn')` clears flag, sets `fromVisitorIntent = 'signIn'`.
  - `exitVisitorModeLogOff` clears flag, calls `wipeAllLocalData`, `fromVisitorIntent` stays null.
  - `signUp` while `fromVisitorIntent === 'signUp'` invokes `pushAllLocal*` before `setUser`.
  - `signIn` while `fromVisitorIntent === 'signIn'` invokes `wipeAllLocalData` before `setUser`.
- `wipeAllLocalData` clears all five tables atomically (verify with mocked Dexie).

### Manual checklist

Add to the existing CLAUDE.md testing checklist:

- [ ] AuthScreen shows "Continue as guest" with confirmation
- [ ] Entering visitor mode wipes prior local data
- [ ] Refresh while in visitor mode lands directly in the app (no AuthScreen)
- [ ] Visitor can practice, log, take notes, view reports, use metronome, use voice features
- [ ] `db.syncQueue` stays empty during visitor session (DevTools → IndexedDB)
- [ ] Settings shows "Guest" badge and three buttons (Sign in / Sign up / Log off)
- [ ] Visitor → Sign up migrates items, logs, notes, practices to the new Firebase account
- [ ] Visitor → Sign in to existing account wipes local and pulls cloud
- [ ] Visitor → Log off shows confirmation, wipes Dexie, returns to AuthScreen
- [ ] Upgrade banner copy differs for sign-up vs sign-in
- [ ] After Log off, refreshing AuthScreen does not show the banner
- [ ] localStorage UI prefs (language, theme, timezone) survive a wipe

## Open questions

None — all decisions resolved in brainstorming.
