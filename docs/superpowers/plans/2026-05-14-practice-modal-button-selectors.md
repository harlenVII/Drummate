# Practice Modal Button Selectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace three `<select>` dropdowns in `PracticeEditModal.jsx` with button groups for time signature, subdivision, and sound type.

**Architecture:** Single-file edit — `src/components/PracticeEditModal.jsx`. Add `SubdivisionIcon` import, replace each `<select>` with a `flex-wrap` button group using the same active/inactive pill styling already used in `Metronome.jsx`. No new state or props.

**Tech Stack:** React 19, Tailwind CSS v4, existing `SubdivisionIcon` component, existing `SUBDIVISIONS` constant.

---

### Task 1: Replace time signature `<select>` with button group

**Files:**
- Modify: `src/components/PracticeEditModal.jsx`

- [ ] **Step 1: Open the file and locate the time signature label block (lines 128–143)**

The block currently looks like:
```jsx
<label className="flex flex-col gap-1">
  <span className="text-sm font-medium text-gray-600">{t('practiceMode.timeSignature')}</span>
  <select
    value={`${form.timeSignature.beats}/${form.timeSignature.noteValue}`}
    onChange={(e) => {
      const [beats, noteValue] = e.target.value.split('/').map(Number);
      setField('timeSignature', { beats, noteValue });
    }}
    className="border border-gray-300 rounded-lg px-3 py-2"
  >
    {TIME_SIGNATURES.map((ts) => (
      <option key={`${ts.beats}/${ts.noteValue}`} value={`${ts.beats}/${ts.noteValue}`}>
        {ts.beats}/{ts.noteValue}
      </option>
    ))}
  </select>
</label>
```

- [ ] **Step 2: Replace it with a button group**

```jsx
<div className="flex flex-col gap-1">
  <span className="text-sm font-medium text-gray-600">{t('practiceMode.timeSignature')}</span>
  <div className="flex gap-2 flex-wrap">
    {TIME_SIGNATURES.map((ts) => (
      <button
        key={`${ts.beats}/${ts.noteValue}`}
        type="button"
        onClick={() => setField('timeSignature', { beats: ts.beats, noteValue: ts.noteValue })}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          form.timeSignature.beats === ts.beats && form.timeSignature.noteValue === ts.noteValue
            ? 'bg-blue-600 text-white'
            : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
        }`}
      >
        {ts.beats}/{ts.noteValue}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 3: Verify the build passes**

```bash
npm run build
```
Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/PracticeEditModal.jsx
git commit -m "feat: replace time signature select with button group in PracticeEditModal

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Replace subdivision `<select>` with icon button group

**Files:**
- Modify: `src/components/PracticeEditModal.jsx`

- [ ] **Step 1: Add `SubdivisionIcon` import at the top of the file**

The file already imports `SUBDIVISIONS` from `'../constants/subdivisions'`. Add `SubdivisionIcon` right after the existing imports:

```jsx
import SubdivisionIcon from './SubdivisionIcon';
```

- [ ] **Step 2: Locate the subdivision label block (currently around lines 146–157)**

```jsx
<label className="flex flex-col gap-1">
  <span className="text-sm font-medium text-gray-600">{t('practiceMode.subdivision')}</span>
  <select
    value={form.subdivision}
    onChange={(e) => setField('subdivision', e.target.value)}
    className="border border-gray-300 rounded-lg px-3 py-2"
  >
    {SUBDIVISIONS.filter((s) => s.pattern !== null).map((s) => (
      <option key={s.key} value={s.key}>{s.key}</option>
    ))}
  </select>
</label>
```

- [ ] **Step 3: Replace it with an icon button group**

```jsx
<div className="flex flex-col gap-1">
  <span className="text-sm font-medium text-gray-600">{t('practiceMode.subdivision')}</span>
  <div className="flex gap-2 flex-wrap">
    {SUBDIVISIONS.filter((s) => s.pattern !== null).map((s) => (
      <button
        key={s.key}
        type="button"
        onClick={() => setField('subdivision', s.key)}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          form.subdivision === s.key
            ? 'bg-blue-600 text-white'
            : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
        }`}
      >
        <SubdivisionIcon type={s.key} />
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 4: Verify the build passes**

```bash
npm run build
```
Expected: build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/PracticeEditModal.jsx
git commit -m "feat: replace subdivision select with icon button group in PracticeEditModal

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Replace sound type `<select>` with button group

**Files:**
- Modify: `src/components/PracticeEditModal.jsx`

- [ ] **Step 1: Locate the sound type label block (currently around lines 159–169)**

```jsx
<label className="flex flex-col gap-1">
  <span className="text-sm font-medium text-gray-600">{t('practiceMode.sound')}</span>
  <select
    value={form.soundType}
    onChange={(e) => setField('soundType', e.target.value)}
    className="border border-gray-300 rounded-lg px-3 py-2"
  >
    {SOUND_TYPES.map((s) => (
      <option key={s} value={s}>{s}</option>
    ))}
  </select>
</label>
```

- [ ] **Step 2: Replace it with a button group using translated labels**

```jsx
<div className="flex flex-col gap-1">
  <span className="text-sm font-medium text-gray-600">{t('practiceMode.sound')}</span>
  <div className="flex gap-2 flex-wrap">
    {SOUND_TYPES.map((s) => (
      <button
        key={s}
        type="button"
        onClick={() => setField('soundType', s)}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          form.soundType === s
            ? 'bg-blue-600 text-white'
            : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
        }`}
      >
        {t(`soundTypes.${s}`)}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 3: Verify the build passes and do a full smoke test**

```bash
npm run build
npm run dev
```

Open `http://localhost:5173`, go to the Metronome tab → Practice subpage, click "+ Add Practice". Verify:
- Time signature shows 6 pill buttons (2/4 through 7/8), tap each to confirm selection highlights
- Subdivision shows 9 icon buttons, tap each to confirm selection highlights
- Sound shows 5 translated-label buttons, tap each to confirm selection highlights
- Save a practice and confirm the saved values are correct when you re-open edit

- [ ] **Step 4: Commit**

```bash
git add src/components/PracticeEditModal.jsx
git commit -m "feat: replace sound type select with button group in PracticeEditModal

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
