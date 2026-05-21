# Floating Practice Widget — Design

**Date:** 2026-05-20
**Status:** Approved for implementation

## Summary

Add a floating widget that appears at the top of the viewport whenever a practice item is actively running and the user is on any tab other than Practice. The widget shows the active item's name and live elapsed time, lets the user stop the timer with a single tap, and lets them jump back to the Practice tab by tapping the body of the widget. A global keyboard shortcut `s` stops the active timer from any tab.

## Motivation

Today, the only way to see or stop a running practice timer is to navigate to the Practice tab. When the user switches to Metronome, Report, or Notes while practicing, the timer becomes invisible and out of reach. That makes it easy to forget a session is in progress, and clunky to end one. A persistent floating pill solves both: visibility (you always know a session is running) and reach (one tap to stop, no tab switch required).

## Scope

### In scope

- New component `FloatingPracticeWidget.jsx`.
- Conditional render in [App.jsx](src/App.jsx) only when an item is active AND active tab is not Practice.
- Global hotkey `s` to stop the active item from any tab (blocked while focus is in `<input>` / `<textarea>`).
- i18n key for the stop button's accessible label.

### Out of scope

- New state, new database tables, or persistence beyond what already exists.
- Confirmation dialogs on stop. The hotkey and the button stop immediately, matching the existing in-list stop button.
- Pause/resume controls. The widget only stops.
- Animation libraries. Tailwind transitions only.
- Changes to the Practice tab itself or to the existing timer logic.

## Behavior

### Visibility rule

The widget is rendered when **both** conditions hold:

- `activeItemId != null`
- `activeTab !== 'practice'`

When either becomes false (timer stops, user navigates to Practice, etc.), the widget unmounts immediately.

### Display

The pill shows, left-to-right:

1. A stopwatch icon.
2. The active item's name, truncated with ellipsis at `max-w-[280px]`.
3. The live elapsed time, formatted by the existing `formatTime(seconds)` helper from `src/utils/formatTime.js` (yields `MM:SS` or `HH:MM:SS`).
4. A small circular stop button rendering a square (■) icon.

### Interactions

| Action | Result |
|---|---|
| Tap on widget body (anywhere except the stop button) | Calls `onNavigate` → `handleTabChange('practice')`. |
| Tap on stop button | Calls `onStop` → `saveAndStop()`. Event propagation is stopped so the body's navigate handler does not fire. |
| Press `s` on any tab (focus not in input/textarea) | If `activeItemIdRef.current != null`, calls `saveAndStop()`. |

### Positioning

`fixed top-4 left-1/2 -translate-x-1/2 z-50`. The Drummate header is part of the scrollable column (not a fixed app-bar), so a fixed-top pill floats above the page content regardless of scroll position. This mirrors the bottom-anchored `FloatingVoiceIndicator` pattern. No collision with the encouragement FAB (bottom-right) or the voice pill (bottom-center).

## Architecture

### New component

`src/components/FloatingPracticeWidget.jsx`

**Props**

- `itemName: string` — display name of the active practice item.
- `elapsedTime: number` — current elapsed time in seconds (re-rendered every tick by App).
- `onStop: () => void` — handler for the stop button.
- `onNavigate: () => void` — handler for tapping the widget body.

**Render**

- Returns `null` if `itemName` is falsy (defensive).
- Outer `<button type="button">` with full pill styling and `onClick={onNavigate}` — using a button (not a `div`) makes the navigate target keyboard-focusable and screen-reader-friendly.
- Inner stop `<button>` calls `e.stopPropagation()` then `onStop()` in its `onClick`.
- Stop button has `aria-label={t('practice.stopAria')}`.

### App.jsx wiring

1. Import `FloatingPracticeWidget`.
2. Render block after the existing `FloatingVoiceIndicator` mount (around [App.jsx:1863](src/App.jsx#L1863)):
   ```jsx
   {activeItemId != null && activeTab !== 'practice' && (
     <FloatingPracticeWidget
       itemName={items.find(i => i.id === activeItemId)?.name ?? ''}
       elapsedTime={elapsedTime}
       onStop={saveAndStop}
       onNavigate={() => handleTabChange('practice')}
     />
   )}
   ```
3. Extend the existing global keydown handler at [App.jsx:1432](src/App.jsx#L1432) with one new branch:
   ```js
   else if (e.code === 'KeyS') {
     if (activeItemIdRef.current != null) saveAndStop();
   }
   ```
   Placed inside the same input-blocking guard. No new effect, no new listener.

### i18n

Add a single key to [src/contexts/LanguageContext.jsx](src/contexts/LanguageContext.jsx) under the `practice` namespace:

- `en`: `"Stop practice"`
- `zh`: `"停止练习"`

Key name: `practice.stopAria`. Used only as the stop button's `aria-label`.

The CLAUDE.md keyboard-shortcuts table is updated to add the `S` row.

## Data flow

```
App.jsx state (activeItemId, elapsedTime, activeTab, items)
       │
       ├── condition check (activeItemId != null && activeTab !== 'practice')
       │
       ▼
FloatingPracticeWidget (props: itemName, elapsedTime, onStop, onNavigate)
       │
       ├── body click ──► onNavigate ──► handleTabChange('practice')
       └── stop click ──► onStop     ──► saveAndStop()
                                          │
                                          ├── addLog(activeItemId, elapsedTime)
                                          ├── stopTimer()
                                          └── loadData()  (clears activeItemId, widget unmounts)
```

The widget is purely a consumer. No state of its own.

## Error handling

There is essentially no failure surface introduced by this widget:

- If `items.find(...)?.name` returns `undefined`, the component falls back to an empty string and the defensive `return null` removes the widget entirely. This can only happen during a transient race (item deleted while timer running, etc.) and unmounting is the correct response.
- `saveAndStop()` already handles its own errors (existing behavior, untouched).
- The `s` hotkey is a no-op when no item is active, by guard.

## Testing checklist

Manual verification after implementation:

- [ ] Start a practice item, switch to Metronome — pill appears at top with name + ticking timer.
- [ ] Switch to Report and Notes — pill stays visible on both.
- [ ] Switch back to Practice — pill disappears.
- [ ] On any non-Practice tab, tap the pill body — navigates to Practice tab and pill disappears.
- [ ] On any non-Practice tab, tap the stop button — timer stops, log is saved, pill disappears, current tab unchanged.
- [ ] On Practice tab with timer running, press `s` — timer stops, log saved.
- [ ] On Metronome/Report/Notes with timer running, press `s` — timer stops, log saved, pill disappears.
- [ ] With no timer running, press `s` — nothing happens.
- [ ] Focus an input (e.g., add-item form, note editor), press `s` — letter `s` is typed; timer not stopped.
- [ ] `npm run build` succeeds.
- [ ] Mobile responsive: pill truncates long item names and doesn't overflow on narrow screens.
- [ ] Language toggle: stop button `aria-label` reflects current language.
