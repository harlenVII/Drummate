# App.jsx Decomposition — Phase 1 Design

**Date:** 2026-06-01
**Status:** Approved (design); pending implementation plan

## Problem

`src/App.jsx` is a 2068-line god component. It owns ~50 state variables, ~30
handlers, ~15 effects, and a ~400-line render spanning 11+ distinct concerns
(practice timer, item CRUD, metronome/sequencer/multi-meter state, reports,
sync/offline, voice/wake-word, LLM encouragement, TTS, keyboard shortcuts,
navigation, UI preferences). This hurts:

- **Readability / navigation** — the file can't be held in one's head.
- **Testability** — logic can't be exercised without rendering the whole app.
- **Safe edits** — a change to one concern (e.g. voice) sits next to and risks
  breaking unrelated load-bearing logic (e.g. sync).

This is **Phase 1** of a phased effort. Phase 1 targets App.jsx only — the
actual god component. Later phases may revisit large *components*
(`PracticeItemList` 691, `SettingsPanel` 544, etc.) case-by-case, only where a
real seam exists. Those components are large but cohesive and are explicitly
out of scope here.

## Guiding Principle: Pure Move, Zero Behavior Change

Every extraction is a **mechanical relocation** of existing code into a hook or
component. No logic rewrites, no simplifications, no "while I'm here" cleanups —
particularly around `useSync`, whose comments CLAUDE.md flags as load-bearing
("these comments are load-bearing; do not 'simplify' without understanding
why"). Hook bodies should be diff-able against the original App.jsx code.

Safety net: the existing test suite (`practicePage`, `practiceEditModal`,
`authContext`, `visitorMode`, `offlineService`, `goalStatus`, etc.) plus
`npm run build` and `npm run lint`. If observable behavior changes, the
extraction was done wrong.

## Architecture: Composition, Not Context

App.jsx becomes a thin shell that calls the hooks **in dependency order** and
threads shared callbacks between them. We deliberately do **not** introduce a
global context or store — that is a behavior-affecting rewrite and conflicts
with the pure-move principle. Explicit threading keeps data flow greppable: you
can see exactly which hooks call `loadData`.

Exception: `user` is read inside hooks via the existing `useAuth()` context
rather than passed as a prop, since it is already a context and is needed by
many hooks. Same for `useLanguage()` where needed.

### Foundation data layer

The pivotal observation: a foundation data layer — `items`, `totals`,
`metronomePractices`, `notes`, `goalRefreshKey`, and the `loadData` refresh —
underpins nearly everything. This becomes `useAppData`, created first; its
`loadData` is threaded into every hook that mutates data so they can refresh.

## The Hooks (new `src/hooks/` directory)

Composition order matters — hooks lower in the list receive earlier hooks'
outputs as arguments.

| Hook | Owns | Key inbound deps |
|------|------|------------------|
| `useUiPreferences` | `timeUnit`, `groupByCategory`, `compactMode`, `theme` + their persistence effects + `setTheme` | — |
| `useMetronomeState` | all metronome/sequencer/multi-meter state, localStorage persistence effects, `engineRef`, `noSleepRef`, the engine-init effect (wires `onBeat`/`onSequenceBeat`/`onMeterSlot` → setters) | — |
| `useAppData` | `items`, `totals`, `metronomePractices`, `notes`, `goalRefreshKey`, `loadData`, `refreshNotes`, the purge-expired-trash effect, the day-change refresh effect | — |
| `usePracticeTimer` | `activeItemId`, `elapsedTime`, `focusedPracticeItemId`, `editing`, `intervalRef`/`startTimeRef`/`activeItemIdRef`, `stopTimer`, `saveAndStop`, `handleStart`, `handleStop`, `handleSetEditing`, pending-log recover + save effects | `loadData`, metronome setters/getters |
| `usePracticeItems` | item CRUD: `handleAddItem`, `handleRenameItem`, `handleDeleteItem`, `handleRestoreItem`, `handlePermanentDelete`, `handleArchiveItem`, `handleSetItemCategory`, `handleMergeItem`, `handleReorder` | `items`, `loadData`, `activeItemId`, `stopTimer`, clear-active helpers |
| `useMetronomePractices` | practice-routine CRUD (`handleAddPractice`/`Update`/`Delete`/`Reorder`), run-view state (`runningPracticeUid`, `practiceRunStepIndex`/`BarIndex`/`IsPlaying`/`Complete`), `handleStartPractice`, `handleEndPractice` | `metronomePractices`, `items`, `loadData`, `handleStart`, `saveAndStop`, `activeItemId` |
| `useReports` | `reportDate`/`reportLogs`, `weekStart`/`weekLogs`, `monthStart`/`monthLogs`, `yearStart`/`yearLogs`, `reportSubpage`, loaders (`loadReportData`/`Week`/`Month`/`Year`), `handleReportDateChange`, `handleManualTimeAdjust`, `handleMergeToYesterday`, `handleEditTime`, `handleAddTime`, `handleDayClick`, `handleWeekChange`/`Month`/`Year`, `editTimeModal` | `loadData`, `items` |
| `useNavigation` | `activeTab`, `metronomeSubpage`, `notesSubpage` + their ref-mirrors, `handleTabChange` (triggers report loads), `handleSubpageChange` (engine stop + practice-run reset) | reports loaders, metronome engine/state, practice-run reset |
| `useTts` | `kokoroEnabled`/`kokoroStatus`/`kokoroProgress`, `ttsServiceRef`, `speakText`, `stopSpeech`, `loadKokoroTts`, `handleToggleKokoro`, auto-disable + auto-load effects | language, `aiCoachEnabled`, `handsFreeMode` |
| `useLlmEncouragement` | `llmStatus`/`llmProgress`/`llmMessage`/`llmError`/`llmModalOpen`, `llmServiceRef`, `aiCoachEnabled`, `generateEncouragement`, `loadAndGenerate`, `handleLlmDownload`, `handleEncouragementPress` | `items`, `totals`, `activeItemId`, `elapsedTime`, language, `speakText` |
| `useVoiceControl` | wake-word/STT state (`handsFreeMode`, `wakeWordLoading`/`Detected`/`Error`, `listeningState`, `voiceTranscript`), `wakeWordEngineRef`/`sttServiceRef`, `dispatchVoiceCommand`, `handleToggleHandsFree`, unmount cleanup | metronome state, `items`, `activeItemId`, `handleStart`/`Stop`, `handleTabChange`/`SubpageChange`, language, `speakText`, `toggleLanguage` |
| `useSync` | `isSyncing`, `offlineMode`, `syncTrigger`, `subscriptionRef`, `pendingModalOpen`, `goOnlineToast`, the main init effect, sign-out reset effect, visitor-logoff reset effect, `handleEnterOfflineMode`, `handleGoOnline`, `setOfflineMode` | `loadData` (and the various reset setters it must call) |
| `useKeyboardShortcuts` | the global `keydown` handler effect + the ref-mirror effects it depends on | nav, timer, prefs, metronome, reports |

After extraction App.jsx is: imports + UI gate (`if (!user && !isVisitor)`) +
~13 hook calls + the JSX return. Target ~250–300 lines, mostly JSX.

### Dependency / composition ordering in App.jsx

```
useUiPreferences()        // no deps
useMetronomeState()       // no deps (owns engineRef, noSleepRef)
useAppData()              // no deps; provides loadData + data
usePracticeTimer(...)     // needs loadData, metronome setters
usePracticeItems(...)     // needs loadData, activeItemId, stopTimer
useMetronomePractices(...)// needs loadData, items, handleStart, saveAndStop
useReports(...)           // needs loadData
useNavigation(...)        // needs reports loaders, metronome engine, practice-run reset
useTts(...)               // needs language, aiCoach/handsFree flags
useLlmEncouragement(...)  // needs data + timer + speakText
useVoiceControl(...)      // needs metronome, items, timer handlers, nav, speakText
useSync(...)              // needs loadData + reset setters
useKeyboardShortcuts(...) // needs nav, timer, prefs, metronome, reports
```

Some flags cross hook boundaries (`aiCoachEnabled` lives in
`useLlmEncouragement` but is read by `useTts`; `handsFreeMode` lives in
`useVoiceControl` but is read by `useTts`). Where a forward reference is
unavoidable, App.jsx threads the value after both hooks are called, or the
shared flag is lifted to the earliest hook that needs it. The implementation
plan must resolve each such cycle explicitly; none require a logic change, only
a decision about which hook owns the state.

## JSX Split (new tab components under `src/components/`)

- **`MetronomeTab`** — the metronome subpage toggle bar + the
  Metronome/Sequencer/MultiMeter/Practice switch (~130 lines today). Receives
  metronome state, practices, run-view state, and handlers as props.
- **`ReportTab`** — the report subpage toggle bar + the
  Daily/Weekly/Monthly/Yearly/Stats/Goals switch. Receives report state,
  filtered items, and handlers as props.
- **`AppHeader`** — the title + settings-button row.
- Practice tab (`PracticeItemList`) and Notes tab (`NotesPage`) already delegate
  to a single component each — they stay inline in App.jsx's return.
- Modals (`SettingsPanel`, `PendingChangesModal`, `KeyboardShortcutsModal`,
  `EditTimeModal`) and floating widgets (`FloatingPracticeWidget`,
  `FloatingVoiceIndicator`, `EncouragementButton`/`Modal`, offline banner/toast,
  sync overlay) stay in App.jsx's return — they are thin and reference
  cross-cutting state.

## Testing

Hook extraction isolates concerns but does not by itself make
Firestore/Web-Audio-coupled code cheap to unit-test. Realistic plan:

- **New unit tests** (via `@testing-library/react` `renderHook`) for the cleanly
  isolable hooks: `useUiPreferences` (persistence round-trips), `useReports`
  (date stepping + loader wiring against a mocked db), `useMetronomeState`
  (localStorage hydrate/persist + valid-value guards).
- **Existing suite** guards the behavior-preserving moves of `useSync`,
  `usePracticeTimer`, `usePracticeItems`, `useVoiceControl`, etc. No new tests
  required for these in Phase 1; they are pure moves.
- Each extraction step ends with `npm run build`, `npm run lint`, and
  `npm run test` green.

## Out of Scope (Phase 1)

- Any logic change, bug fix, or simplification.
- Introducing a global context/store or state library.
- Breaking up large but cohesive components (`PracticeItemList`,
  `SettingsPanel`, `SequencerPage`, `MultiMeterPage`, report components). These
  are deferred to later, case-by-case phases.
- Performance work (reducing re-renders). Explicitly a non-goal per
  brainstorming.

## Verification Checklist (per CLAUDE.md)

- [ ] `npm run build` succeeds
- [ ] `npm run lint` clean
- [ ] `npm run test` green (existing + new hook tests)
- [ ] All tabs work (Practice, Metronome subpages, Report subpages incl. Goals, Notes subpages)
- [ ] DB persists after refresh
- [ ] Metronome/sequencer/multi-meter plays through tab switches
- [ ] Keyboard shortcuts (1/2/3/4, Tab, arrows, M/H/E/C/L/D/S/A, ?) all work
- [ ] Offline refresh: local data intact, banner shows, no items wiped
- [ ] Go-online round-trip + go-online-while-offline toast
- [ ] Voice / hands-free toggle still loads and dispatches (Chrome)
- [ ] AI Coach encouragement flow still loads/generates
- [ ] Practice timer auto-save survives refresh (pending-log recovery)
