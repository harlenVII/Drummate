---
name: prior-practice-hours
description: Allow users to input total drum practice hours accumulated before using Drummate, shown as part of lifetime Total Practice Time in Stats.
metadata:
  type: project
---

# Prior Practice Hours

## Overview

Users can record how many hours they practiced drums before they started using Drummate. This offset is added to the in-app total so the Stats report reflects a true lifetime practice time.

**Scope:** Only `Total Practice Time` in the Stats Overview is affected. Streaks, records, average daily time, and goal progress are unchanged.

---

## Data Storage

| Location | Key / Field | Type | Default |
|---|---|---|---|
| `localStorage` | `drummate_prior_hours` | integer | `0` |
| Firestore | `users/{uid}.priorPracticeHours` | number | absent (treated as `0`) |

Follows the exact same localStorage-cache-plus-Firestore-sync pattern as `timezone` / `timezoneService.js`.

---

## Service Layer

**New file: `src/services/priorPracticeService.js`**

```js
const KEY = 'drummate_prior_hours';

export function getPriorHours() {
  return Number(localStorage.getItem(KEY)) || 0;
}

export async function setPriorHours(hours, backend, userId) {
  const value = Math.floor(Math.max(0, hours));
  localStorage.setItem(KEY, String(value));
  await backend.setUserSetting(userId, 'priorPracticeHours', value);
}

export async function initPriorHours(backend, userId) {
  const settings = await backend.getUserSettings(userId);
  if (settings?.priorPracticeHours != null) {
    localStorage.setItem(KEY, String(settings.priorPracticeHours));
  }
}
```

- `getPriorHours()` — synchronous; used in `StatsReport` at render time
- `setPriorHours(hours, backend, userId)` — floors to a non-negative integer, writes localStorage immediately, then syncs to Firestore
- `initPriorHours(backend, userId)` — called once during app init; remote value wins (reconcile-on-load)

Uses the existing `backend.getUserSettings` / `backend.setUserSetting` generic API — **no new methods needed in `firebaseBackend.js`**.

---

## Backend (`firebaseBackend.js`)

No changes required. `getUserSettings(userId)` and `setUserSetting(userId, key, value)` already exist and handle the `users/{uid}` doc with `{ merge: true }` — the same pair used by `timezoneService`.

---

## App Init (`App.jsx`)

`initPriorHours` joins the first parallel batch in `init()` alongside `initTimezone`:

```js
await Promise.all([
  initTimezone(backend, userId),
  initPriorHours(backend, userId),  // new
  pullAll(...),
  pullAllNotes(...),
  pullAllPractices(...),
]);
```

---

## Settings Panel (`SettingsPanel.jsx`)

New row in the **Reports** section, after "Group by Category":

| Field | Value |
|---|---|
| Label | `t('settings.priorPractice')` |
| Subtitle | `t('settings.priorPracticeHint')` |
| Control | `<input type="number" min="0" step="1">` showing current `getPriorHours()` |

On blur, calls `setPriorHours(newValue, firebaseBackend, userId)`. `SettingsPanel` already imports `firebaseBackend` directly and receives `userId` as a prop — no new prop threading needed.

The input uses local component state (initialized from `getPriorHours()`) so edits are responsive; sync fires on blur.

---

## Stats Report (`StatsReport.jsx`)

The `useEffect` that computes stats adds the offset at the display boundary (not inside `computeStats`):

```js
const computed = computeStats(allLogs, items);
setStats({ ...computed, totalTime: computed.totalTime + getPriorHours() * 3600 });
```

The **Total Practice Time** row already supports an optional `sub` field. When `priorHours > 0`, the sub-line reads:

```
incl. 500 hrs before Drummate
```

No changes to `computeStats` itself — it remains pure over Dexie logs.

---

## i18n Keys

Three new keys added to both `en` and `zh` in `LanguageContext.jsx`:

| Key | English | Chinese |
|---|---|---|
| `settings.priorPractice` | `"Prior Practice"` | `"之前练习时长"` |
| `settings.priorPracticeHint` | `"Hours you practiced before Drummate"` | `"在使用 Drummate 前的练习小时数"` |
| `stats.priorIncluded` | `"incl. {hours} hrs before Drummate"` | `"含 Drummate 前 {hours} 小时"` |

---

## CLAUDE.md Update

Add `drummate_prior_hours` to the localStorage UI preferences table:

| `drummate_prior_hours` | integer string | `'0'` | prior practice hours offset |

---

## Out of Scope

- No effect on Total Practice Days, streaks, records, average, or goal progress
- No validation beyond `min="0"` on the input (fractional values floor to integer via `Math.floor` or native number coercion)
- No migration needed — absent localStorage key and absent Firestore field both default to `0` gracefully
