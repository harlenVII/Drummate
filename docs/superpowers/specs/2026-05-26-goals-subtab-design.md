# Goals Subtab & Multi-Goal History — Design

**Date:** 2026-05-26
**Status:** Approved (pending implementation)

## Summary

The current practice-goal feature stores a single anonymous goal in `localStorage['drummate_goal']` and surfaces it inside the **Stats** subtab via `GoalCard`. This design promotes goals to a first-class subtab under **Report** with these new capabilities:

1. A dedicated **Goals** subtab listing all goals, split into **Current** (active or upcoming, not archived) and **History** (archived or past-end).
2. **Multiple active goals** allowed concurrently.
3. **Optional name/label** per goal.
4. **History persistence** across the device's lifetime, with edit and permanent-delete actions.
5. **Cross-device sync** via Firestore (new Dexie table mirroring the items/notes sync model).
6. **User-selected pin** — exactly one goal can be pinned at a time; the Practice tab banner shows the pinned goal.

## Data model

### Dexie schema bump → v15

```
goals: '++id, &uid, startDate, endDate, archived, pinned'
```

Plus non-indexed `syncedOnce` field. `goals` is a brand-new table, so no `upgrade()` callback is required for existing rows.

### Record shape

```js
{
  id,               // local Dexie autoincrement
  uid,              // string, crypto.randomUUID() — stable cross-device identity
  name,             // string, may be '' (optional)
  startDate,        // 'YYYY-MM-DD'
  endDate,          // 'YYYY-MM-DD'
  targetHours,      // number > 0
  archived,         // boolean — true ⇒ history
  archivedAt,       // epoch ms, set when archived flips to true; null otherwise
  pinned,           // boolean — at most one record may be pinned
  createdAt,        // epoch ms, set on insert
  syncedOnce,       // boolean — set true after a successful pull/push for this record
}
```

### Computed status (never stored)

For any goal:

```
practicedSeconds = Σ log.duration for logs where startDate ≤ log.date ≤ endDate
practicedHours   = practicedSeconds / 3600
progressPercent  = min(100, practicedHours / targetHours * 100)
met              = practicedHours ≥ targetHours
```

Because status is derived, editing `targetHours` or the date range on a history goal automatically recomputes completion — no separate `status` field to keep in sync.

### Invariants

- **Single pin invariant:** at most one row has `pinned: true`. Enforced in `setGoalPinned(uid)` via a single Dexie transaction that unpins the previous pinned row and pins the new one.
- **Date order invariant:** `startDate < endDate` (validated in the setup modal — same as today).
- **Pin can target any goal** (active, upcoming, or archived). The banner renders the pinned goal regardless of state.

## Lifecycle: active → history

A goal is shown in **Current** when `!archived && endDate >= today`. Otherwise it is shown in **History**.

Two paths move a goal into History:

1. **Auto-archive on expiry.** On app load (after `pushAllLocal*`) and on entering the Goals subtab, run `autoArchiveExpiredGoals()`: for every goal with `!archived && endDate < today`, set `archived = true` and `archivedAt = Date.now()`, then push each update. Idempotent — a second pass finds nothing to flip.
2. **Manual "Archive now"** on an active goal (the user gives up early). Same flip, plus a confirm dialog.

**Un-archiving via Edit:** if the user opens an archived goal in the setup modal and saves with `endDate >= today`, the save sets `archived = false` and `archivedAt = null` — the goal returns to Current. Otherwise the `archived` flag is left untouched. This rule lives in `updateGoal` / the modal's save handler so it is consistent for both Edit-from-Current and Edit-from-History entry points.

**UI source-of-truth for History:** the section filter is `archived || endDate < today`, NOT just `archived`. This means a goal with `archived: false && endDate < today` renders in History even before `autoArchiveExpiredGoals` has run. The two states (filter says history vs. flag says archived) converge naturally on the next app load.

History actions:

- **Edit** — opens the same setup modal with all fields editable (`name`, `startDate`, `endDate`, `targetHours`). Saving recomputes status automatically because nothing about status is persisted.
- **Delete (permanent)** — confirm + hard-delete locally and remotely. No soft-delete / trash bin for goals.

## Sync semantics (mirrors items / notes)

### Firestore layout

`users/{userId}/goals/{uid}` — doc id is the goal's `uid` field.

### New `firebaseBackend.js` methods

- `pullAllGoals()` — `getDocs`, then:
  - **Bail if `snap.metadata.fromCache`** (offline-safety; without this, an offline boot deletes every locally-synced goal).
  - For each remote doc: upsert by `uid` into local Dexie; set `syncedOnce: true` on the local row.
  - For local goals not present in the remote snapshot: hard-delete the local row only if `syncedOnce: true` (an unsynced local row is in-flight, not deletable).
- `pushAllLocalGoals()` — query `db.goals.where('syncedOnce').equals(false)` (or filter `false` after fetch since boolean indexes can be quirky — same approach already used elsewhere). For each: `setDoc(uid, payload)`; on success flip `syncedOnce: true` locally.
- `pushGoal(goal)` — single `setDoc`. When offline, enqueue `push_goal` with enriched payload (full record) and short-circuit.
- `deleteGoalRemote(uid)` — single `deleteDoc`. When offline, enqueue `delete_goal_permanent` with `{ uid }` and short-circuit.
- `subscribeToChangesGoals()` — `onSnapshot` live listener. Handle `'added'` and `'modified'` with **the same reconciliation** (Firestore's initial snapshot reports our own writes as `'added'`). Handle `'removed'` by hard-deleting locally.

### Offline queue actions (`syncQueue`)

- `push_goal` — payload = full goal record. `flushSyncQueue` calls `setDoc` from the payload directly (no local re-read; local has already been pull-overwritten). After cloud push, re-assert payload values to local Dexie (mirrors existing field-update actions like `rename_item`).
- `delete_goal_permanent` — payload = `{ uid }`. `flushSyncQueue` calls `deleteDoc(uid)` and ensures local row is removed.

### App init order

Updated `init()` in `App.jsx`:

```
[initTimezone, pullAll, pullAllNotes, pullAllPractices, pullAllGoals]  ← parallel
  → migrateLegacyGoal()        ← new, one-shot; only inserts if Dexie has zero goals
                                  AND localStorage['drummate_goal'] exists
  → flushSyncQueue
  → pushAllLocal (items, notes, practices, goals)
  → autoArchiveExpiredGoals()  ← new; pushes per-row archive flips
  → loadData
  → setIsSyncing(false)
  → subscribeToChanges (+ subscribeToChangesGoals)
```

Rationale for ordering:

- Pulls go first (existing rule: device adopts remote truth before pushing).
- Migration runs **after** `pullAllGoals` so a second device that already pulled the user's goals from cloud does not re-create a duplicate from its own stale localStorage. The check is "Dexie goals table empty AND localStorage has legacy goal".
- `autoArchiveExpiredGoals` runs **after** `pushAllLocal*` so its writes use the normal push path without racing pull reconciliation.
- `subscribeToChangesGoals` registers AFTER `loadData` (same rule as other listeners; avoids stale-state flicker).

## Migration

One-shot, idempotent:

```js
async function migrateLegacyGoal() {
  const existing = await db.goals.count();
  if (existing > 0) {
    localStorage.removeItem('drummate_goal');  // safe cleanup; cloud is authoritative
    return;
  }
  const raw = localStorage.getItem('drummate_goal');
  if (!raw) return;
  let legacy;
  try { legacy = JSON.parse(raw); } catch { return; }
  if (!legacy?.startDate || !legacy?.endDate || !legacy?.targetHours) return;
  await db.goals.add({
    uid: crypto.randomUUID(),
    name: '',
    startDate: legacy.startDate,
    endDate: legacy.endDate,
    targetHours: legacy.targetHours,
    archived: false,
    archivedAt: null,
    pinned: true,         // sole goal becomes the pinned one
    createdAt: Date.now(),
    syncedOnce: false,    // will be pushed on the next pushAllLocalGoals
  });
  localStorage.removeItem('drummate_goal');
}
```

## Components

### New: `src/components/GoalsPage.jsx`

Props: `{ items, timeUnit, compactMode }`.

- Subscribes to `db.goals` via `Dexie.liveQuery` and `db.practiceLogs` via the same pattern used elsewhere, so it re-renders on local mutations and remote sync events.
- Computes per-goal status (`practicedSeconds`, `progressPercent`, `met`) in a memoized helper.
- Renders two sections:
  - **Current** — `!archived && endDate >= today`, sorted by pinned-first, then by `endDate` asc. Includes an "+ New goal" button at the top.
  - **History** — `archived || endDate < today`, sorted by `endDate` desc.
- Empty states for each section (e.g., "No active goals — set one to start tracking").

### Refactored: `src/components/GoalCard.jsx`

- Now prop-driven and stateless w.r.t. localStorage. Props: `{ goal, practicedSeconds, onEdit, onPin, onArchive, onDelete, variant, compactMode }` where `variant ∈ 'current' | 'history'`.
- Renders pin icon (`📌` filled if pinned, `📍` outline if not). Clicking unpinned → calls `onPin(goal.uid)` which routes through `setGoalPinned`.
- "Archive now" button visible only on `variant === 'current' && !goal.archived && today >= goal.startDate`. (Hidden on upcoming-not-started goals to avoid the weird "archive a future goal" affordance.)
- "Delete" available on all variants, with confirm.
- Tightens padding/gaps/radii when `compactMode` is true, following the same idiom as other report components.

### Refactored: `src/components/GoalSetupModal.jsx`

- Adds an optional `name` text input at the top (placeholder: `t('goal.namePlaceholder')`).
- On save, writes to Dexie (`addGoal` or `updateGoal`) and calls `pushGoal`. No longer touches `localStorage['drummate_goal']`.
- Same modal handles edit on archived goals — same fields, same validation; status recomputes automatically.

### Refactored: `src/components/GoalBanner.jsx`

- Subscribes to `db.goals` via `liveQuery` filtered to `pinned: true` (returns 0 or 1 record).
- If 0 pinned: returns `null` (silent). If 1 pinned: renders the same progress UI as today, sourcing fields from the Dexie record instead of localStorage.
- The existing `refreshKey` prop becomes unnecessary (liveQuery handles refresh) — can be removed or left as a no-op for callers.
- Respects `compactMode` (already does today; no regression).

### Stripped: `src/components/StatsReport.jsx`

- Remove `import GoalCard` and the `<GoalCard />` render. Stats subtab no longer surfaces the goal.

### Wired: `src/App.jsx`

- `'goals'` added to the report subpage array: `['daily', 'weekly', 'monthly', 'yearly', 'stats', 'goals']`. Tab/Shift-Tab cycling extends automatically.
- New conditional render: `{reportSubpage === 'goals' && <GoalsPage items={items.filter(i => !i.trashed)} timeUnit={timeUnit} compactMode={compactMode} />}`.
- `←`/`→` arrow shortcuts: Goals subtab has no date navigation; arrow keys become no-ops there (same as Stats today).
- Calls to `migrateLegacyGoal`, `pullAllGoals`, `pushAllLocalGoals`, `autoArchiveExpiredGoals`, and `subscribeToChangesGoals` wired into `init()` per the order above.

## Database helpers (new in `src/services/database.js`)

```js
getAllGoals()                          // returns all rows
getActiveGoals(today)                  // !archived && endDate >= today
getArchivedGoals(today)                // archived || endDate < today
getPinnedGoal()                        // single row or null
getGoalByUid(uid)
addGoal(record)                        // sets createdAt, archived:false, archivedAt:null, syncedOnce:false
updateGoal(uid, patch)                 // does NOT touch syncedOnce — caller decides
setGoalPinned(uid)                     // single transaction: unpin all others, pin this
archiveGoal(uid)                       // sets archived:true, archivedAt=now, syncedOnce:false
deleteGoalLocal(uid)                   // hard-delete
autoArchiveExpiredGoals(today)         // returns array of flipped goals (for caller to push)
```

## i18n keys

Existing `goal.*` namespace already covers `goal.title`, `goal.met`, `goal.missed`, `goal.daysLeft`, etc.

New keys (added to both `en` and `zh`):

- `reportSubpages.goals` — "Goals" / "目标"
- `goal.namePlaceholder` — placeholder text for the name input
- `goal.optionalName` — label for the name input
- `goal.archiveNow` — button text on active goals
- `goal.archiveConfirm` — confirm-dialog body for manual archive
- `goal.deleteConfirm` — confirm-dialog body for permanent delete
- `goal.pin` / `goal.unpin` / `goal.pinned` — tooltips/labels
- `goal.history` / `goal.current` — section headers
- `goal.empty.current` / `goal.empty.history` — empty-state copy
- `goal.statusMet` / `goal.statusMissed` — short status badge text for history rows

## Testing

New test files in `tests/`:

- **`goalStatus.test.js`** — pure helper `computeGoalStatus(goal, logs)` returning `{ practicedSeconds, progressPercent, met }`.
  - met/missed boundary
  - logs outside `[startDate, endDate]` ignored
  - editing `targetHours` upward causes a previously-met goal to flip to missed
- **`goalsMigration.test.js`** — `migrateLegacyGoal`
  - legacy present + Dexie empty → migrate + pin + remove localStorage
  - Dexie non-empty → skip migration, remove localStorage
  - no legacy + Dexie empty → no-op
- **`goalsAutoArchive.test.js`** — `autoArchiveExpiredGoals(today)`
  - flips only `!archived && endDate < today`
  - idempotent on re-run
  - `archivedAt` stamped exactly once
- **`goalsPinning.test.js`** — `setGoalPinned(uid)` unpins all other rows in one transaction; calling on already-pinned goal is a no-op.

Existing smoke test extended to load the Goals subtab without throwing.

## Gotchas honored (CLAUDE.md patterns)

1. **`fromCache` bail in `pullAllGoals`** — non-negotiable; this is the offline-safety line.
2. **`syncedOnce: false` filter in `pushAllLocalGoals`** — prevents clobbering `flushSyncQueue` replays.
3. **Subscribe listener treats `added` and `modified` identically** — Firestore reports our own writes as `'added'` on initial snapshot.
4. **Offline-queue enriched payloads** — `push_goal` carries full record; `flushSyncQueue` writes from payload, not from pull-overwritten local.
5. **Date pickers** — reuse `react-datepicker` with existing `toPickerDate`/`fromPickerDate` helpers and `popperProps={{ strategy: 'fixed' }}`.
6. **Compact mode** — thread `compactMode` prop through `GoalsPage` → `GoalCard`, tighten `p-4` → `p-3`, `gap-3` → `gap-2`, `rounded-lg` → `rounded-md`.
7. **All user-facing text via `t()`** — no hardcoded English/Chinese strings.
8. **Practice item identity is `uid`, not `id`** — same applies to goals; backend operations always pass `goal.uid`.

## Out of scope

- Goal templates / recurring goals.
- Multi-goal aggregation on the Practice banner (we show one pinned goal).
- Per-item goals (current model remains total-hours across all practice items).
- Notifications / nudges when goal endDate approaches.
- Soft-delete / trash bin for goals (delete is permanent; history is the "soft" state).
