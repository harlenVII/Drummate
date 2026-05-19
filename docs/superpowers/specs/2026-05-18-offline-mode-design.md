# Offline Mode — Design Spec

**Date:** 2026-05-18
**Status:** Draft (awaiting plan)

## Goal

Give the user explicit, session-scoped control over network sync. When the app is stuck on its blocking sync overlay (slow network, captive portal, Firestore unreachable), the user can dismiss the overlay by entering "offline mode" — all reads serve from Dexie, all writes queue into `syncQueue`, and no Firestore call is attempted for the rest of the session. The user returns to online mode either by tapping "Go online" (banner or settings) or by refreshing the page.

## Motivation

Two problems prompted this:

1. **Sync screen can hang indefinitely.** With no usable network, `firebaseBackend.pullAll` calls `getDocs(...)` which — without persistent local cache enabled — can either hang on the watch stream or resolve to an empty cached snapshot. The user is locked out of the app with no escape.
2. **Worse, the empty-cached-snapshot path is destructive.** `pullAll`'s reconciliation loop (and the matching loops in `pullAllNotes` / `pullAllPractices`) treat any locally-synced item missing from `remoteUids` as "deleted on another device" and hard-delete it from Dexie. An offline refresh on this codebase wiped a user's entire practice item list. The fix to `pullAll` is a prerequisite for offline mode — without it, clicking "Enter offline mode" mid-pull can't reliably save the user from the destructive loop.

Beyond crisis recovery, offline mode is also useful for **deliberate offline practice**: the user knows they're on a plane / in a basement / on bad hotel Wi-Fi and wants the app to stop poking the network on every action.

## Decisions (confirmed via brainstorming)

1. **Local writes in offline mode go through `syncQueue` (not local-only).** Each mutation enqueues a discrete action that `flushSyncQueue` later replays in order against Firestore. This preserves user *intent* across the offline session — a rename done offline survives even if another device modified the same item, because the rename action replays after `pullAll` adopts cloud truth on reconnect. Local-only state-push would silently lose intent-only changes.
2. **The "Enter offline mode" button is visible immediately when the sync overlay renders.** No delay, no failure detection. The user always has an explicit escape.
3. **Persistent top banner while in offline mode.** Contents: `⚡ Offline mode · N pending changes · Go online`. The pending-changes text opens an inspection modal; "Go online" re-runs the sync flow.
4. **"Go online" re-shows the full sync overlay.** Symmetric with app startup. If sync stalls again, the same "Enter offline mode" button is right there. No silent-background-sync path.
5. **The offline flag is in-memory React state only.** Refreshing the page always returns to "attempt online" mode. No `localStorage` / `sessionStorage` persistence.
6. **No auto-detection.** Offline mode is entered and exited only by explicit user action — never inferred from `navigator.onLine`, network errors, or timeouts.
7. **The pending-changes UI is read-only.** Count + list view. No per-row deletion (rejected to prevent inconsistent Firestore state — e.g. deleting a queued rename while keeping the dependent items).
8. **Pending-change payloads are enriched with display hints at queue time.** The offline-mode push path snapshots `displayName`, `previousName`, etc. into the payload so the modal can render human-readable summaries even after the underlying local row is hard-deleted. The catch-block fallback path (used when `navigator.onLine` lies) keeps minimal payloads; those rows fall back to generic text like "Renamed an item."
9. **Real-time subscription is not started in offline mode.** `subscribeToChanges` only wires up after a successful `init()`. Going online re-runs `init()` and starts the subscription.
10. **The `pullAll` / `pullAllNotes` / `pullAllPractices` deletion-reconciliation bug is fixed in the same change** via a `snap.metadata.fromCache` guard. Required for offline mode's escape button to be safe against in-flight pulls.

## Architecture

### New: `src/services/offlineService.js`

Module-level offline-flag holder, mirroring the pattern of `timezoneService.js`.

- `isOffline: boolean` — module-level variable, initialized to `false`.
- `getOfflineMode(): boolean` — synchronous getter. Called from `firebaseBackend.js` push methods.
- `setOfflineMode(value: boolean): void` — sets the module variable. No persistence, no side effects beyond the local module state.
- No initialization function; no Firestore read. Refresh = `false`.

### Updated: `src/services/backends/firebaseBackend.js`

**Pull functions** (`pullAll`, `pullAllNotes`, `pullAllPractices`):

At the top of each, immediately after the `await getDocs(...)`, add:

```js
if (snap.metadata.fromCache) {
  return;
}
```

This is the data-loss fix. When the SDK could not reach the server, the snapshot is flagged `fromCache: true` and the function bails before either the per-doc upsert loop or the deletion-reconciliation loop runs. No behavior change on a successful online fetch.

For `pullAll` specifically, both snapshots — `itemsSnap` and `logsSnap` — get the check. If either is from cache, the function returns without reconciling.

**Push functions** (each function that currently calls Firestore: `pushItem`, `pushLog`, `pushNote`, `pushDeleteItem`, `pushRenameItem`, `pushReorder`, `pushArchiveItem`, `pushTrashItem`, `pushSetCategory`, `mergeItems`, `deleteNoteRemote`, `pushPractice`, `pushDeletePractice`, `pushReorderPractices`):

At the top, after argument validation, add:

```js
if (getOfflineMode()) {
  await queueSync('<action_name>', { /* enriched payload */ });
  return;
}
```

The enriched payload includes:
- `uid` (always present, same as today)
- `displayName`, `previousName`, `itemName`, `date`, `duration` etc. — whatever fields the `PendingChangesModal` formatter needs to render a human-readable summary. Snapshotted from the local row at queue time.

The existing `try/catch { if (!navigator.onLine) queueSync(...) }` blocks remain unchanged — they are the belt-and-suspenders fallback for the rare case where `navigator.onLine === true` but Firestore actually failed.

`flushSyncQueue` ignores unknown payload fields, so the enrichment is forward-compatible. It does not need to change.

**`subscribeToChanges`:** no change inside the backend. The caller (`App.jsx`) decides whether to subscribe.

### Updated: `src/App.jsx`

New state: `const [offlineMode, _setOfflineMode] = useState(false)`.

A wrapped setter mirrors the value into `offlineService`:

```js
const setOfflineMode = useCallback((value) => {
  offlineService.setOfflineMode(value);
  _setOfflineMode(value);
}, []);
```

`init()` flow becomes:

```js
const init = async () => {
  setIsSyncing(true);
  try {
    await initTimezone(firebaseBackend, user.id);
    if (offlineService.getOfflineMode()) {
      await loadData();
      if (!cancelled) setIsSyncing(false);
      return;
    }
    await firebaseBackend.pullAll(user.id);
    await firebaseBackend.pullAllNotes(user.id);
    await firebaseBackend.pullAllPractices(user.id);
    await loadData();
    if (!cancelled) setIsSyncing(false);
    await firebaseBackend.flushSyncQueue(user.id);
    await firebaseBackend.pushAllLocal(user.id);
  } catch (err) {
    console.error('Sync init failed:', err);
    if (!cancelled) setIsSyncing(false);
  }
  if (!cancelled && !offlineService.getOfflineMode()) {
    unsubscribe = firebaseBackend.subscribeToChanges(loadData);
  }
};
```

A new handler `handleEnterOfflineMode` is passed to the sync overlay:

```js
const handleEnterOfflineMode = useCallback(() => {
  setOfflineMode(true);
  setIsSyncing(false);
}, [setOfflineMode]);
```

A new handler `handleGoOnline` is passed to the banner and settings:

```js
const handleGoOnline = useCallback(() => {
  setOfflineMode(false);
  // Re-trigger init() — the existing init effect re-runs when its
  // dependencies change. Cleanest implementation: bump a `syncTrigger`
  // state that init's useEffect depends on.
  setSyncTrigger((n) => n + 1);
}, [setOfflineMode]);
```

The `init` effect's dependency array includes `syncTrigger` so flipping it re-runs the full flow. An in-flight subscription is torn down by the effect's cleanup function before the new `init()` starts.

### New: `src/components/OfflineBanner.jsx`

Thin bar rendered at the very top of the app shell (above the tab nav) whenever `offlineMode === true`.

```jsx
<div className="bg-amber-500 text-white text-sm px-3 py-1.5 flex items-center justify-between gap-2">
  <div className="flex items-center gap-2">
    <span>⚡ {t('offline.modeLabel')}</span>
    <button onClick={onShowPending} className="underline">
      {pendingCount === 0
        ? t('offline.noPendingChanges')
        : t('offline.pendingChanges', { count: pendingCount })}
    </button>
  </div>
  <button onClick={onGoOnline} className="underline font-medium">
    {t('offline.goOnline')}
  </button>
</div>
```

The `pendingCount` is sourced via Dexie's reactivity:

```js
const pendingCount = useLiveQuery(() => db.syncQueue.count(), [], 0);
```

`useLiveQuery` is `dexie-react-hooks`'s hook. If the project doesn't already depend on `dexie-react-hooks`, add it. Otherwise the same effect is achievable with a plain `useEffect` subscribing to `Dexie.liveQuery(...).subscribe(...)`.

Props: `{ pendingCount, onShowPending, onGoOnline }`. The banner does not own state — App.jsx owns the modal open state.

### New: `src/components/PendingChangesModal.jsx`

Modal following the existing pattern (`NoteEditModal.jsx`, `GoalSetupModal.jsx`, `ReportGeneratorModal.jsx`).

- Header: `{t('offline.pendingChangesTitle')}` ("Pending changes").
- Body: scrollable `<ul>`. Each row is `db.syncQueue` entry passed through `formatPendingAction(entry, t)` from a new helper at `src/utils/pendingActionFormatter.js`.
- Empty state: `{t('offline.noPendingChangesEmpty')}` ("No pending changes — nothing to sync.").
- Footer: single "Close" button.
- Dismissed by: Escape key, Close button, backdrop click (matches existing modal conventions except `NoteEditModal` which intentionally disables backdrop dismiss).

The entries are fetched with `useLiveQuery(() => db.syncQueue.orderBy('id').toArray(), [], [])` so the list stays current if the user adds more queued mutations while the modal is open.

### New: `src/utils/pendingActionFormatter.js`

Pure function `formatPendingAction(entry, t): string` that maps an action + payload to a localized string. The mapping:

| Action | Format | Payload fields used |
|---|---|---|
| `create_item` | `t('offline.action.createItem', { name })` → "Created practice item: *Snare Drum*" | `name` |
| `create_log` | `t('offline.action.createLog', { duration, name, date })` → "Logged 12 min on *Hi-hat* (May 17)" | `itemName`, `duration`, `date` |
| `rename_item` | `t('offline.action.renameItem', { from, to })` → "Renamed *Snare* → *Snare Drum*" | `previousName`, `newName` |
| `delete_item` | `t('offline.action.deleteItem', { name })` → "Deleted practice item: *Snare*" | `displayName` |
| `reorder` | `t('offline.action.reorder', { count })` → "Reordered 5 items" | `items.length` |
| `archive_item` | `t('offline.action.archive', { name })` / `unarchive` | `displayName`, `archived` |
| `trash_item` | `t('offline.action.trash', { name })` / `restore` | `displayName`, `trashed` |
| `set_category` | `t('offline.action.setCategory', { name, category })` → "Moved *Snare* to Songs" | `displayName`, `category` |
| `merge_items` | `t('offline.action.merge', { from, to })` → "Merged *Snare* → *Snare Drum*" | `previousName` (source), `targetName` |
| `push_note` | `t('offline.action.pushNote', { name, date })` → "Saved note for *Kick* (May 17)" | `itemName`, `date` |
| `delete_note` | `t('offline.action.deleteNote')` → "Deleted note" | (none) |
| `push_practice` | `t('offline.action.pushPractice', { name })` → "Saved metronome practice: *Slow build*" | `name` |
| `delete_practice` | `t('offline.action.deletePractice')` → "Deleted metronome practice" | (none) |
| `reorder_practices` | `t('offline.action.reorderPractices', { count })` → "Reordered 3 metronome practices" | `practices.length` |

Missing-field fallback: each format function checks for the expected payload key; if absent, returns a generic string like `t('offline.action.genericRename')` ("Renamed an item"). This covers legacy queue entries written before the enrichment landed and entries from the catch-block fallback path.

### Updated: `src/components/SettingsPanel.jsx`

New section in the settings list (placement: near the bottom, below existing sync-related rows if any, otherwise after Language and Time Unit):

- Row 1: "Offline mode" with a toggle. Bound to `offlineMode` state. Flipping it on calls `setOfflineMode(true)` and dismisses the settings panel; flipping it off calls `handleGoOnline` (which closes the panel and re-shows the sync overlay).
- Row 2 (sub-row, visible only when `offlineMode === true`): "Pending changes: N" — tappable, opens `PendingChangesModal`. Same data and same modal as the banner's link.

### Updated: sync overlay component

Wherever `isSyncing` currently renders its overlay (a check of the codebase will pin this down — likely a section of `App.jsx` or a small dedicated component), add an "Enter offline mode" button below the spinner. Visible immediately on render. Tapping it calls `handleEnterOfflineMode`.

### Updated: `src/contexts/LanguageContext.jsx`

New translation keys under an `offline.*` namespace (English + Chinese):

- `offline.modeLabel`
- `offline.goOnline`
- `offline.enterOfflineMode`
- `offline.noPendingChanges`
- `offline.pendingChanges` (with `{count}` interpolation)
- `offline.pendingChangesTitle`
- `offline.noPendingChangesEmpty`
- `offline.action.*` (one key per action listed in the formatter table)

## Data flow

### Entering offline mode from the sync overlay

1. Sync overlay renders because `isSyncing === true`.
2. User taps "Enter offline mode".
3. `handleEnterOfflineMode` runs: `setOfflineMode(true)` (mirrors to `offlineService`), `setIsSyncing(false)`.
4. The in-flight `pullAll` / `pullAllNotes` / `pullAllPractices` may still be awaiting `getDocs`. When they resolve, the `snap.metadata.fromCache` guard makes them no-ops (because the SDK couldn't reach the server — that's why the user was stuck). No destruction.
5. App shell re-renders with the offline banner pinned at the top.
6. User can interact normally — practice timer, metronome, reports, notes — all read from Dexie.

### Local mutation in offline mode

1. User adds a log via `addLog(itemId, duration)` (or any other mutation flow).
2. The mutation writes to Dexie as today.
3. App.jsx's existing post-mutation flow calls `firebaseBackend.pushLog(localLog, user.id)`.
4. `pushLog` checks `getOfflineMode() === true`, calls `queueSync('create_log', { uid, itemUid, itemName, date, duration })`, and returns.
5. The banner's `useLiveQuery` ticks; `pendingCount` updates from 11 → 12.
6. If the `PendingChangesModal` is open, its `useLiveQuery` also ticks and the new row appears at the bottom.

### Going back online

1. User taps "Go online" (banner or settings).
2. `handleGoOnline` runs: `setOfflineMode(false)`, then `setSyncTrigger(n => n + 1)`.
3. The `init` effect re-fires due to the dependency change. Cleanup tears down any prior subscription (none in this case — wasn't started in offline mode).
4. `init()` runs the full sequence: `initTimezone` → `pullAll` → `pullAllNotes` → `pullAllPractices` → `loadData` → `flushSyncQueue` → `pushAllLocal` → `subscribeToChanges`.
5. `flushSyncQueue` drains every queued action in insertion order. Replay semantics handle the "rename + remote logs added meanwhile" scenario described in the brainstorming.
6. The sync overlay is dismissed once `isSyncing` flips false (inside the try block, after `loadData`).
7. The banner unmounts.
8. If the user is still effectively offline, `init()` errors out and the sync overlay catches via the existing `try/catch`. The user can tap "Enter offline mode" again.

### Refresh while in offline mode

1. User refreshes the page.
2. React state resets. `offlineMode` initializes to `false`.
3. `offlineService.isOffline` resets to `false` (module reloads).
4. `init()` runs the full online sequence as on any fresh load.

## Error handling

- **`pullAll` hits a server error mid-pull (not offline, just a 500):** the existing `try/catch` in App.jsx catches and logs. `isSyncing` is set to `false`. The user lands in the app with whatever Dexie has. No banner — they're not in offline mode. Behavior unchanged from today.
- **`pullAll` returns `fromCache: true`:** the new guard makes it a no-op. `loadData` runs against existing Dexie content. The user lands in the app with their existing data. No banner — they're not in offline mode. They may notice that recent cloud changes from other devices aren't visible until they refresh online. (Trade-off accepted: refusing to reconcile is better than destroying.)
- **`getDocs` throws (rare — e.g. corrupt SDK state):** the existing `try/catch` catches and logs.
- **`flushSyncQueue` entry fails during go-online:** today's behavior preserved — `flushSyncQueue` `break`s out of the loop on first error, leaving subsequent entries queued for the next attempt. The banner will show stale entries if the user is back online but a specific replay keeps failing. Acceptable for v1.
- **User mutates in offline mode and the mutation flow itself throws (Dexie error, not Firestore):** unrelated to offline mode. Existing error paths apply.

## Testing checklist

- [ ] `npm run build` succeeds.
- [ ] Offline refresh (DevTools "Offline" + reload): app renders, banner appears, practice items still present (data-loss bug fixed).
- [ ] Tap "Enter offline mode" mid-sync (DevTools "Slow 3G" + reload): banner appears, items still present, in-flight `pullAll` does not delete anything.
- [ ] Create a practice item in offline mode: appears in Practice tab, banner count = 1, modal lists "Created practice item: …".
- [ ] Add a log in offline mode: appears in Today, banner count = 2, modal lists "Logged N min on …".
- [ ] Rename + archive an item in offline mode: banner count = 4, modal lists both actions in order.
- [ ] Tap "Go online" (still offline at network level): sync overlay re-appears, "Enter offline mode" button visible, can re-enter offline mode.
- [ ] Tap "Go online" (now actually online): sync overlay appears briefly, queue drains, items / logs / renames present in Firestore console, banner gone, real-time subscription active (modify on another device → live update).
- [ ] Refresh page while in offline mode (now actually online): full sync runs, no banner.
- [ ] All offline-mode UI text appears in both English and Chinese.
- [ ] Settings panel toggle mirrors banner state in both directions.

## Out of scope

- Auto-detection of offline state via `navigator.onLine` or `window.addEventListener('online', …)`.
- Persistence of offline mode across refreshes (`localStorage` / `sessionStorage`).
- Per-row delete or edit of queued actions in `PendingChangesModal`.
- Conflict resolution UI beyond the replay-in-order semantics already implemented by `flushSyncQueue`.
- A timeout that auto-shows the "Enter offline mode" button only when sync is slow — button is unconditionally visible on the overlay.
- A "queue is paused" mode — if `offlineMode === true`, all writes queue, no exceptions.
- Surfacing of the queue contents anywhere other than the banner badge + modal (e.g. no badge on the settings tab icon, no notification when queue grows past N).
