# Manual Practice Time Adjustment — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to manually add, edit, or remove practice time for any item on any day via the Daily Report.

**Architecture:** Delta log approach — editing a total creates a new log with the duration difference (positive or negative). No schema changes. New `EditTimeModal` component opened from tappable Daily Report rows. A "+" button opens an item picker for adding logs to items not yet on that day.

**Tech Stack:** React 19, Tailwind CSS v4, Dexie.js, existing i18n system

---

### Task 1: Add i18n strings for manual time adjustment

**Files:**
- Modify: `src/contexts/LanguageContext.jsx`

**Step 1: Add English translation keys**

Add these keys to the `en` translations object (after the `close` key around line 42):

```js
editTime: 'Edit Time',
addTime: 'Add Time',
addManualTime: 'Add Practice Time',
durationMinutes: 'Duration (minutes)',
save: 'Save',
deleteTime: 'Remove All Time',
confirmDeleteTime: 'Remove all practice time for this item on this day?',
selectItem: 'Select Item',
noItemsToAdd: 'All items already have logs for this day',
archived: 'Archived',
```

**Step 2: Add Chinese translation keys**

Add matching keys to the `zh` translations object:

```js
editTime: '编辑时间',
addTime: '添加时间',
addManualTime: '添加练习时间',
durationMinutes: '时长（分钟）',
save: '保存',
deleteTime: '删除全部时间',
confirmDeleteTime: '删除该项目在这一天的所有练习时间？',
selectItem: '选择项目',
noItemsToAdd: '所有项目在这一天都已有记录',
archived: '已归档',
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 4: Commit**

```
feat: add i18n strings for manual time adjustment
```

---

### Task 2: Create EditTimeModal component

**Files:**
- Create: `src/components/EditTimeModal.jsx`

**Step 1: Create the modal component**

```jsx
import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

function EditTimeModal({ itemName, date, currentSeconds, onSave, onDelete, onClose }) {
  const { t } = useLanguage();
  const currentMinutes = Math.round(currentSeconds / 60);
  const [minutes, setMinutes] = useState(String(currentMinutes));
  const inputRef = useRef(null);

  // Focus and select input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const parsedMinutes = parseInt(minutes, 10);
  const isValid = !isNaN(parsedMinutes) && parsedMinutes >= 0;
  const isWarning = isValid && parsedMinutes > 480;
  const deltaSeconds = isValid ? (parsedMinutes * 60) - currentSeconds : 0;
  const hasChange = isValid && deltaSeconds !== 0;

  const handleSave = () => {
    if (!hasChange) return;
    onSave(deltaSeconds);
  };

  const handleDelete = () => {
    if (currentSeconds <= 0) return;
    if (!confirm(t('confirmDeleteTime'))) return;
    onDelete();
  };

  // Format date for display
  const [year, month, day] = date.split('-');
  const displayDate = `${year}/${month}/${day}`;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-lg max-w-sm w-full p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-gray-800">
          {currentSeconds > 0 ? t('editTime') : t('addTime')}
        </h2>

        <div className="text-sm text-gray-500">
          <div className="font-medium text-gray-800">{itemName}</div>
          <div>{displayDate}</div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">
            {t('durationMinutes')}
          </label>
          <input
            ref={inputRef}
            type="number"
            min="0"
            inputMode="numeric"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && hasChange) handleSave();
            }}
            className={`w-full px-3 py-2 border rounded-lg text-lg font-mono focus:outline-none focus:ring-2 ${
              !isValid
                ? 'border-red-300 focus:ring-red-500'
                : isWarning
                  ? 'border-yellow-300 focus:ring-yellow-500'
                  : 'border-gray-300 focus:ring-blue-500'
            }`}
          />
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={handleSave}
            disabled={!hasChange}
            className={`w-full px-4 py-2 rounded-lg font-medium transition-colors ${
              hasChange
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {t('save')}
          </button>

          {currentSeconds > 0 && (
            <button
              onClick={handleDelete}
              className="w-full px-4 py-2 text-red-600 border border-red-300 rounded-lg font-medium hover:bg-red-50 transition-colors"
            >
              {t('deleteTime')}
            </button>
          )}

          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-gray-500 border border-gray-300 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default EditTimeModal;
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds (component not used yet, but no syntax errors).

**Step 3: Commit**

```
feat: create EditTimeModal component for manual time adjustment
```

---

### Task 3: Make DailyReport rows tappable and wire up edit flow

**Files:**
- Modify: `src/components/DailyReport.jsx`
- Modify: `src/App.jsx`

**Step 1: Add callback props and edit state to DailyReport**

In `DailyReport.jsx`, update the function signature to accept new props:

```jsx
function DailyReport({ items, allItems, reportDate, reportLogs, onDateChange, onEditTime, onAddTime, timeUnit }) {
```

- `allItems` — all active + archived items (for the "add" picker)
- `onEditTime(itemId, itemName, currentSeconds)` — called when user taps an existing row
- `onAddTime(itemId)` — called when user selects an item from the "add" picker

Add state for the item picker:

```jsx
const [showItemPicker, setShowItemPicker] = useState(false);
```

**Step 2: Make item rows tappable**

Replace the existing item row `<div>` (around line 109) to be a button/clickable:

Change the outer div from:
```jsx
<div key={entry.id} className="bg-white rounded-lg shadow-sm p-4">
```

To:
```jsx
<div
  key={entry.id}
  className="bg-white rounded-lg shadow-sm p-4 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors"
  onClick={() => onEditTime(entry.id, entry.name, entry.duration)}
>
```

**Step 3: Add "+" button next to the date navigation**

After the date navigation `<div>` (after line 92), add an "Add Time" button in the grand total card area or near the date header. A clean approach: add it as a floating action button or as a row below the grand total card:

```jsx
{/* Add time button */}
<button
  onClick={() => setShowItemPicker(true)}
  className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 font-medium hover:border-blue-400 hover:text-blue-500 transition-colors"
>
  + {t('addManualTime')}
</button>
```

**Step 4: Add item picker modal**

After the report modal (before closing `</div>` of the component), add the item picker:

```jsx
{showItemPicker && (
  <div
    className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
    onClick={() => setShowItemPicker(false)}
  >
    <div
      className="bg-white rounded-xl shadow-lg max-w-sm w-full p-6 flex flex-col gap-2 max-h-[70vh] overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 className="text-lg font-bold text-gray-800 mb-2">{t('selectItem')}</h2>
      {availableItems.length === 0 ? (
        <p className="text-gray-400 text-center py-4">{t('noItemsToAdd')}</p>
      ) : (
        availableItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setShowItemPicker(false);
              onAddTime(item.id);
            }}
            className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-between"
          >
            <span className="font-medium text-gray-800">{item.name}</span>
            {item.archived && (
              <span className="text-xs text-gray-400 ml-2">{t('archived')}</span>
            )}
          </button>
        ))
      )}
      <button
        onClick={() => setShowItemPicker(false)}
        className="mt-2 px-4 py-2 text-gray-500 border border-gray-300 rounded-lg font-medium hover:bg-gray-200 transition-colors"
      >
        {t('cancel')}
      </button>
    </div>
  </div>
)}
```

**Step 5: Compute available items for the picker**

Add this after `breakdown` is computed (around line 36):

```jsx
// Items available for manual add (active + archived, excluding those already with logs today)
const itemIdsWithLogs = new Set(breakdown.map(e => e.id));
const availableItems = allItems
  .filter(item => !item.trashed && !itemIdsWithLogs.has(item.id))
  .sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? 1 : -1;
    return a.sortOrder - b.sortOrder;
  });
```

**Step 6: Guard aggregation with Math.max(0)**

Update the `grandTotal` computation (line 29) and the `breakdown` filter (line 35):

```jsx
grandTotal = Math.max(0, grandTotal);
```

And in the breakdown map, change to:
```jsx
.map((item) => ({ id: item.id, name: item.name, duration: Math.max(0, itemTotals[item.id] || 0) }))
```

**Step 7: Verify build**

Run: `npm run build`
Expected: Build fails because App.jsx doesn't pass the new props yet. That's OK, we'll fix in next step.

---

**Step 8: Wire up App.jsx**

In `App.jsx`, add a handler for manual time adjustments:

```jsx
const handleManualTimeAdjust = useCallback(async (itemId, deltaSeconds, date) => {
  const logId = await addLog(itemId, deltaSeconds, date);
  await loadReportData(reportDate);
  await loadData();
  if (user) {
    const log = await db.practiceLogs.get(logId);
    backend.pushLog(log, user.id).catch(console.error);
  }
}, [loadReportData, reportDate, loadData, user, backend]);
```

Add state for the edit modal in App.jsx:

```jsx
const [editTimeModal, setEditTimeModal] = useState(null); // { itemId, itemName, currentSeconds }
```

Add handlers:

```jsx
const handleEditTime = useCallback((itemId, itemName, currentSeconds) => {
  setEditTimeModal({ itemId, itemName, currentSeconds });
}, []);

const handleAddTime = useCallback((itemId) => {
  const item = items.find(i => i.id === itemId);
  if (item) {
    setEditTimeModal({ itemId, itemName: item.name, currentSeconds: 0 });
  }
}, [items]);
```

**Step 9: Update DailyReport usage in App.jsx**

Update the DailyReport component call (around line 1222) to pass new props:

```jsx
<DailyReport
  items={items.filter(i => !i.trashed)}
  allItems={items.filter(i => !i.trashed)}
  reportDate={reportDate}
  reportLogs={reportLogs}
  onDateChange={handleReportDateChange}
  onEditTime={handleEditTime}
  onAddTime={handleAddTime}
  timeUnit={timeUnit}
/>
```

**Step 10: Render EditTimeModal in App.jsx**

Import the component at the top:

```jsx
import EditTimeModal from './components/EditTimeModal';
```

Render it conditionally (near other modals):

```jsx
{editTimeModal && (
  <EditTimeModal
    itemName={editTimeModal.itemName}
    date={reportDate}
    currentSeconds={editTimeModal.currentSeconds}
    onSave={async (deltaSeconds) => {
      await handleManualTimeAdjust(editTimeModal.itemId, deltaSeconds, reportDate);
      setEditTimeModal(null);
    }}
    onDelete={async () => {
      await handleManualTimeAdjust(editTimeModal.itemId, -editTimeModal.currentSeconds, reportDate);
      setEditTimeModal(null);
    }}
    onClose={() => setEditTimeModal(null)}
  />
)}
```

**Step 11: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 12: Commit**

```
feat: wire up manual time adjustment in DailyReport with edit modal
```

---

### Task 4: Manual testing and edge case fixes

**Files:**
- Possibly: `src/components/DailyReport.jsx`, `src/components/EditTimeModal.jsx`

**Step 1: Test adding time to a new item**

1. Open Report → Daily tab
2. Click "+ Add Practice Time"
3. Select an item with no logs for that day
4. Enter 15 minutes, click Save
5. Verify the item appears in the daily report with 15 min

**Step 2: Test editing existing time**

1. Tap an item row in the Daily Report
2. Change the minutes value
3. Save — verify the total updates

**Step 3: Test deleting all time**

1. Tap an item row
2. Click "Remove All Time"
3. Confirm — verify the item disappears from the breakdown

**Step 4: Test previous day**

1. Navigate to yesterday in the Daily Report
2. Add time for an item
3. Verify it shows correctly and doesn't affect today's totals

**Step 5: Test edge cases**

- Enter 0 when current is 0 → Save should be disabled
- Enter same value as current → Save should be disabled
- Archived items appear in picker with "Archived" label
- Items already showing in daily report don't appear in picker

**Step 6: Final build check**

Run: `npm run build`
Expected: Build succeeds.

**Step 7: Commit (if any fixes needed)**

```
fix: address edge cases in manual time adjustment
```
