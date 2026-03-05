# Trash Bin Feature Design

## Goal

Protect against accidental permanent deletion by moving deleted items to a trash bin for 30 days before auto-purging. Trashed items' logs are excluded from reports.

## Data Model

Add two fields to `practiceItems` (DB version 7):
- `trashed` (boolean, default `false`) — indexed for filtering
- `trashedAt` (ISO date string or `null`) — used for 30-day auto-purge calculation

Item states are mutually exclusive: **active** / **archived** / **trashed**.
- Trashing an archived item moves it to trash (`archived` stays as-is, `trashed: true`).
- Restoring from trash sets `trashed: false, trashedAt: null, archived: false` — item returns to active list.

## Behavior

| Action | Effect |
|--------|--------|
| Delete button (edit mode) | Sets `trashed: true, trashedAt: <now>`. Logs preserved. |
| Restore (from trash) | Sets `trashed: false, trashedAt: null, archived: false`. Returns to active list. |
| Permanent delete (from trash) | Deletes item + all logs permanently (existing `deleteItem` logic). |
| Auto-purge (on app load) | Items with `trashedAt` older than 30 days are permanently deleted. |

## Reports

Filter out items where `trashed === true` — their logs are excluded from totals and reports.

## UI

- In edit mode, the existing delete (trash can) button moves items to trash instead of permanent delete.
- A "Trash" section in the practice list (similar to archived items section):
  - Only visible in edit mode, collapsed by default
  - Restore button (undo icon)
  - Permanent delete button (with confirmation dialog)
  - Days remaining label (e.g., "23 days left")
- Trashed items shown with reduced opacity (like archived items).

## Sync

- New `pushTrashItem(name, trashed, trashedAt, userId)` function (mirrors `pushArchiveItem` pattern).
- PocketBase/Firebase collections need `trashed` (boolean) and `trashedAt` (date string) fields.
- Real-time sync handles trash/restore events from other devices.
- Auto-purge runs locally on each device independently on app load.
- Backend interface updated with `pushTrashItem` method.

## Filtering Logic

```
activeItems = items.filter(i => !i.archived && !i.trashed)
archivedItems = items.filter(i => i.archived && !i.trashed)
trashedItems = items.filter(i => i.trashed)
```

## Auto-Purge Logic

On app load (`useEffect` in App.jsx):
1. Query all items where `trashed === true`
2. For each, check if `trashedAt` is older than 30 days
3. If so, permanently delete item + logs locally
4. Push permanent delete to backend if user is signed in
