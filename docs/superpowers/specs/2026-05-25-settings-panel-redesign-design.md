# Settings Panel Redesign

**Date:** 2026-05-25  
**Feature:** Restructure `SettingsPanel.jsx` into labeled sections with tighter visual rhythm

## Overview

The current settings panel ([src/components/SettingsPanel.jsx](../../src/components/SettingsPanel.jsx)) renders all options as a flat list with `gap-6` (24px) between every row. With ten controls in the same visual register, nothing is grouped, every row competes for attention, and the panel reads as "list of unrelated things." Offline mode sits in its own bordered slab at the bottom, and Sign Out is an outlined red button that visually outranks the actual settings above it.

This redesign keeps every existing capability — same controls, same props, same behavior — and reshapes the layout into four labeled sections with a calmer visual hierarchy.

## Approach

A single-component refactor of `SettingsPanel.jsx`. No prop changes, no new dependencies, no behavior changes. The work is layout, grouping, and styling only.

## Scope

**One file changes:** [src/components/SettingsPanel.jsx](../../src/components/SettingsPanel.jsx).

No changes to:
- Translation strings (`LanguageContext.jsx`) — all existing `t()` keys still used.
- Props from `App.jsx` — every prop passed today is still consumed.
- `timezoneService.js`, `firebaseBackend.js`, or any service.
- Other components.

## Layout structure

The panel keeps its existing chrome — right-side slide-in drawer, 288px wide, backdrop, slide animation, header with title + close button. Inside the drawer the body is reorganized as:

```
┌──────────────────────────────┐
│  Settings              ×     │  ← header (unchanged)
├──────────────────────────────┤
│  [avatar]  Name              │  ← profile (visual refresh)
│            email             │
├──────────────────────────────┤
│  DISPLAY                     │  ← section label
│  Language        [EN | 中文] │
│  Theme          [Light|Dark] │
│  Time Unit       [min | hr]  │
│                              │
│  REPORTS                     │
│  Timezone       Seattle ▾    │
│  Group by Category   [○━━ ]  │
│                              │
│  AI & VOICE                  │
│  AI Coach            [━━●]   │
│  Natural Voice       [○━━ ]  │
│    AI-powered voice          │  ← subtitle (conditional)
│  Hands-Free          [○━━ ]  │
│                              │
│  SYNC                        │
│  Offline mode        [○━━ ]  │
│    Queue edits, sync later   │  ← subtitle (conditional)
│  3 pending changes →         │  ← link (when offline)
├──────────────────────────────┤
│        Sign Out              │  ← text link
└──────────────────────────────┘
```

## Section assignment

Every existing control maps to exactly one section. No control is added or removed.

| Section | Controls |
|---------|---------|
| **Display** | Language, Theme, Time Unit |
| **Reports** | Timezone, Group by Category |
| **AI & Voice** | AI Coach, Natural Voice, Hands-Free |
| **Sync** | Offline mode, pending-changes link (when offline) |

Section order is fixed and matches the table above. Section labels use new `t()` keys: `settings.section.display`, `settings.section.reports`, `settings.section.aiVoice`, `settings.section.sync`. English values: `"Display"`, `"Reports"`, `"AI & Voice"`, `"Sync"`. Chinese values: `"显示"`, `"报告"`, `"AI 与语音"`, `"同步"`.

## Visual specification

### Section labels

Small uppercase muted labels rendered as `<h3>` for semantic grouping:

```
text-xs font-bold tracking-wider uppercase
text-gray-400 dark:text-slate-500
px-5 pt-5 pb-2
```

The first section label has reduced top padding (`pt-3`) since the profile section provides natural separation above it.

### Profile

Stays at the same position but the avatar gets a soft gradient and the layout uses tighter spacing:

```jsx
<div className="px-5 py-4 flex items-center gap-3">
  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500
                  flex items-center justify-center text-white text-base font-semibold shrink-0">
    {initial}
  </div>
  <div className="min-w-0">
    {user?.name && <p className="text-sm font-semibold text-gray-800 dark:text-slate-100 truncate">{user.name}</p>}
    <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{user?.email}</p>
  </div>
</div>
```

No border below the profile. The first section label provides separation via its top padding.

### Row rhythm

All setting rows use a unified shape:

```
flex items-center justify-between
px-5 py-2.5     ← was py-3, in a flex-col gap-6 container
min-h-[40px]
```

Rows within a section have no separators — the section label is the only divider. Rows in adjacent sections never touch directly because section labels carry their own top padding.

### Row label and subtitle

Labels stay at `text-sm font-medium`. When a row needs descriptive text (Natural Voice, Offline), a one-line subtitle appears underneath:

```jsx
<div className="min-w-0">
  <p className="text-sm font-medium text-gray-700 dark:text-slate-200">{label}</p>
  {subtitle && <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{subtitle}</p>}
</div>
```

Subtitle text is content-driven (see "Helper text policy" below).

### Pill groups (Language / Theme / Time Unit)

Existing pill-group styling is kept but spacing inside the panel becomes consistent. Use `text-xs` (current `text-sm`) on the pill text so the segmented control reads as a compact control, not as competing copy. Time Unit pill text changes from `"minutes" / "hours"` to translated abbreviated forms `t('timeUnitMin')` / `t('timeUnitHr')` — values `"min" / "hr"` (EN), `"分" / "时"` (ZH). New `t()` keys.

### Toggles

Toggle dimensions stay (`w-11 h-6`). Color stays (`bg-indigo-600` on, `bg-gray-300 dark:bg-slate-600` off, `bg-amber-500` for offline mode on). The amber-colored offline-mode toggle is preserved because the orange tone signals "this is an unusual state" — that semantic is intentional and survives the redesign.

### Timezone

The native `<select>` is kept (no custom picker — too much new surface area for this redesign). It is restyled to read as a quiet trigger rather than a bordered input:

```
appearance-none bg-transparent border-none
text-sm text-gray-700 dark:text-slate-300
pr-4 cursor-pointer
```

A `▾` chevron is rendered as a sibling span (since `appearance-none` removes the native arrow). The full city label is still shown (e.g., `"Seattle (UTC-8)"`); the value is still controlled by `currentTz` and `handleTimezoneChange`. Right-aligning the select within the row makes it visually consistent with toggles and pill groups.

### Sign Out

Replace the outlined red button with a centered text link inside a top-bordered footer:

```jsx
<div className="px-5 py-4 border-t border-gray-100 dark:border-slate-800 text-center">
  <button onClick={signOut}
    className="text-sm font-medium text-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors">
    {t('auth.signOut')}
  </button>
</div>
```

This demotes Sign Out so it stops competing with actual settings for visual weight, while keeping it discoverable.

## Helper text policy

The current panel shows up to four lines of helper text per AI/Voice row (description, status, download progress, error). The redesign keeps all that information but follows a stricter policy so the layout stays calm:

1. **Description subtitle** (one-liner shown at rest) — for rows whose purpose isn't obvious from the label alone:
   - **Natural Voice**: subtitle = `t('naturalVoice.description')`
   - **Offline mode**: subtitle = `t('offline.settingsHint')`
   - **Hands-Free**: subtitle = `t('handsFree.description')`
   - **AI Coach**: subtitle = `t('aiCoach.description')` — only shown when AI Coach is off (matches current behavior — once enabled, the description is redundant)
   
   Subtitle is rendered as `text-xs text-gray-400 dark:text-slate-500 mt-0.5`. One line; truncate with `line-clamp-1` if a future translation overflows.

2. **State messages** — downloading progress, success confirmations, errors — appear **inline below the row** (full-width, beneath both label and toggle) only while the state is active. Same conditional logic as today, same translation keys; only the visual container changes. State messages are rendered with the same classes already in use (`text-xs text-blue-500`, `text-xs text-green-600`, `text-xs text-red-500`), padded `px-5 pb-2` to align with rows.

3. **Disabled-reason messages** (e.g., Natural Voice `requires` / `unsupportedLang`) replace the description subtitle while active — same row, same slot, different content. This matches today's behavior.

4. **The Natural Voice "size" hint** (`naturalVoice.size`) is dropped from idle state — it currently renders as a second helper line. Keep it only inside the downloading state (concat with `naturalVoice.downloading` if needed; not strictly required since percentage already conveys size context). One line removed total.

## Offline section

The bottom offline-mode slab is dissolved into a regular row in the new `SYNC` section. Same toggle, same amber-on color, same behavior. The pending-changes counter (`onShowPending` link) appears as a small right-aligned link below the offline row, only when `offlineMode && pendingCount > 0`:

```jsx
{offlineMode && (
  <button onClick={onShowPending}
    className="block w-full px-5 pb-2 text-right text-xs text-blue-600 dark:text-indigo-400 hover:underline">
    {t('offline.settingsPendingRow', { count: pendingCount })} →
  </button>
)}
```

The existing `liveQuery(() => db.syncQueue.count())` subscription is unchanged.

## Translation keys

**New keys** (add to both `en` and `zh` in `LanguageContext.jsx`):

| Key | EN | ZH |
|-----|----|----|
| `settings.section.display` | Display | 显示 |
| `settings.section.reports` | Reports | 报告 |
| `settings.section.aiVoice` | AI & Voice | AI 与语音 |
| `settings.section.sync` | Sync | 同步 |
| `timeUnitMin` | min | 分 |
| `timeUnitHr` | hr | 时 |

**Existing keys reused as-is:** `settings`, `language`, `theme`, `themeLight`, `themeDark`, `timeUnit`, `timezone`, `groupByCategory`, `aiCoach.title`, `aiCoach.description`, `naturalVoice.*`, `handsFree.*`, `offline.settingsRow`, `offline.settingsHint`, `offline.settingsPendingRow`, `auth.signOut`.

The full `timeUnit` keys (`minutes`/`hours`) are still used in reports. The new `timeUnitMin`/`timeUnitHr` keys are panel-local.

## Out of scope

The following are explicitly **not** changed in this redesign:

- Behavior of any toggle or pill — every onClick/onChange handler is unchanged.
- Prop signature of `SettingsPanel` — adding/removing props is out of scope.
- The timezone picker control — kept as a native `<select>`, only restyled.
- The set of timezones in `TIMEZONE_OPTIONS`.
- Backdrop, slide animation, panel width, panel z-index.
- Translation of helper text strings — only new section/abbreviation keys are added.

## Testing checklist

After implementation:

- [ ] `npm run build` succeeds, `npm run lint` clean.
- [ ] Panel opens/closes with the same animation, backdrop click still closes.
- [ ] All four sections render with their labels.
- [ ] Every existing toggle and pill group still flips state and persists across reload (sample one per section).
- [ ] Timezone selection still writes to `users/{uid}.timezone` and `localStorage['drummate_timezone']` (verified via DevTools storage).
- [ ] Natural Voice downloading state shows progress bar inline; success/error states render correctly.
- [ ] Hands-Free error/listening/processing states render inline.
- [ ] Switching language toggles section labels and `min`/`hr` abbreviations.
- [ ] Light and dark themes both look correct.
- [ ] Mobile width (390px screen) — panel doesn't overflow, text doesn't wrap awkwardly.
- [ ] Offline mode toggles correctly; pending-changes link appears when offline + queue > 0.
- [ ] Sign Out still signs the user out.
