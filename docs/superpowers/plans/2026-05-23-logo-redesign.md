# Logo Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing five-bar logo with the new "Drum-mate Rockstar" mascot (V1) across the SVG favicon, all PWA icon PNGs, and add a maskable Android variant.

**Architecture:** One SVG source of truth (`public/favicon.svg`). PNGs are generated from it on a one-off basis using `npx @resvg/resvg-cli` — no permanent build dependency added. A separate `public/icons/icon-maskable.svg` source produces the maskable PNG (same artwork scaled to ~75% inside Android's safe zone); keeping both SVG sources in-tree means future tweaks can regenerate every raster without redrawing.

**Tech Stack:** SVG, `@resvg/resvg-cli` (run via `npx`, no install), Vite PWA plugin (already configured in `vite.config.js`).

**Spec:** [docs/superpowers/specs/2026-05-23-logo-redesign-design.md](../specs/2026-05-23-logo-redesign-design.md)

---

## File Structure

**Modified (replaced in-place):**
- `public/favicon.svg` — SVG source of truth; also the browser favicon.
- `public/icons/icon-180x180.png` — apple touch icon (iOS home screen).
- `public/icons/icon-192x192.png` — PWA / Android home screen.
- `public/icons/icon-512x512.png` — PWA splash + high-res `any` icon.
- `vite.config.js` — one-line change: maskable icon entry points to the new file.

**Created:**
- `public/icons/icon-maskable.svg` — same artwork scaled to inner ~75% on a full-bleed navy field; source for the maskable PNG.
- `public/icons/icon-maskable-512x512.png` — generated from `icon-maskable.svg`; used by Android adaptive icon mask.

No application code (`src/`) is touched. No tests are added — this is an asset swap whose verification is visual.

---

## Task 1: Replace `public/favicon.svg` with the new artwork [model: claude-haiku-4-5-20251001]

**Files:**
- Modify: `public/favicon.svg` (full replacement)

- [ ] **Step 1: Overwrite `public/favicon.svg` with the new artwork**

Replace the entire file contents with:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <!-- Background -->
  <rect width="512" height="512" rx="112" fill="#1a1a2e"/>

  <!-- Drumstick arms (raised) — left -->
  <g transform="rotate(-22 130 120)">
    <rect x="118" y="60" width="24" height="180" rx="12" fill="#F5F1E8"/>
    <circle cx="130" cy="60" r="18" fill="#F5F1E8"/>
  </g>
  <!-- Drumstick arms (raised) — right -->
  <g transform="rotate(22 382 120)">
    <rect x="370" y="60" width="24" height="180" rx="12" fill="#F5F1E8"/>
    <circle cx="382" cy="60" r="18" fill="#F5F1E8"/>
  </g>

  <!-- Drum body -->
  <rect x="108" y="180" width="296" height="240" rx="40" fill="#F5F1E8"/>

  <!-- Tuning rod dots (top + bottom rims, 4 each) -->
  <g fill="#1a1a2e">
    <circle cx="150" cy="204" r="8"/><circle cx="210" cy="204" r="8"/>
    <circle cx="302" cy="204" r="8"/><circle cx="362" cy="204" r="8"/>
    <circle cx="150" cy="396" r="8"/><circle cx="210" cy="396" r="8"/>
    <circle cx="302" cy="396" r="8"/><circle cx="362" cy="396" r="8"/>
  </g>

  <!-- Sunglasses: two lenses + bridge -->
  <rect x="142" y="270" width="86" height="38" rx="12" fill="#1a1a2e"/>
  <rect x="284" y="270" width="86" height="38" rx="12" fill="#1a1a2e"/>
  <line x1="228" y1="288" x2="284" y2="288" stroke="#1a1a2e" stroke-width="8" stroke-linecap="round"/>

  <!-- Smirk -->
  <path d="M 226 348 Q 256 366 286 348" fill="none" stroke="#1a1a2e" stroke-width="10" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 2: Visual verify in a browser**

Run:
```bash
open public/favicon.svg
```
Expected: a rounded-square navy icon with a cream drum holding two raised drumsticks, wearing sunglasses with a smirk. No console errors, file renders.

- [ ] **Step 3: Commit**

```bash
git add public/favicon.svg
git commit -m "$(cat <<'EOF'
feat: replace favicon.svg with drum-mate rockstar mascot

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Regenerate the three standard PNG icons from favicon.svg [model: claude-haiku-4-5-20251001]

**Files:**
- Modify: `public/icons/icon-180x180.png` (overwritten by export)
- Modify: `public/icons/icon-192x192.png` (overwritten by export)
- Modify: `public/icons/icon-512x512.png` (overwritten by export)

- [ ] **Step 1: Generate all three PNGs in one shot using `npx @resvg/resvg-cli`**

`@resvg/resvg-cli` is a Rust-based SVG renderer wrapped as a one-shot npm CLI. `--yes` skips the install prompt; nothing is added to `package.json`.

Run:
```bash
npx --yes @resvg/resvg-cli public/favicon.svg --width 180 --height 180 public/icons/icon-180x180.png && \
npx --yes @resvg/resvg-cli public/favicon.svg --width 192 --height 192 public/icons/icon-192x192.png && \
npx --yes @resvg/resvg-cli public/favicon.svg --width 512 --height 512 public/icons/icon-512x512.png
```
Expected: three lines of CLI output, no errors. Each command writes one PNG.

- [ ] **Step 2: Verify all three files exist at the right sizes**

Run:
```bash
file public/icons/icon-180x180.png public/icons/icon-192x192.png public/icons/icon-512x512.png
```
Expected output (sizes shown as `WxH`):
```
public/icons/icon-180x180.png: PNG image data, 180 x 180, ...
public/icons/icon-192x192.png: PNG image data, 192 x 192, ...
public/icons/icon-512x512.png: PNG image data, 512 x 512, ...
```

- [ ] **Step 3: Visual verify the 512×512 in Preview**

Run:
```bash
open public/icons/icon-512x512.png
```
Expected: full-bleed navy rounded square (the SVG's own corner radius), cream drum + sticks + sunglasses + smirk, sharp edges, no fringe artifacts at the curves.

- [ ] **Step 4: Commit**

```bash
git add public/icons/icon-180x180.png public/icons/icon-192x192.png public/icons/icon-512x512.png
git commit -m "$(cat <<'EOF'
feat: regenerate PWA icon PNGs from new favicon.svg

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Create maskable SVG source and generate the maskable PNG [model: claude-haiku-4-5-20251001]

**Files:**
- Create: `public/icons/icon-maskable.svg`
- Create: `public/icons/icon-maskable-512x512.png`

Android adaptive icons crop the source into various shapes (circle, squircle, rounded-square). Web.dev recommends keeping critical content in the inner 80% "safe zone." This task scales the artwork to 75% (a little extra safety margin) and centers it on a full-bleed navy field so the drumstick tips never get clipped.

- [ ] **Step 1: Create `public/icons/icon-maskable.svg`**

Write the file with exactly this content. The `<g transform="translate(64 64) scale(0.75)">` wrapper scales the artwork to 75% and centers it (offset = (512 − 512×0.75) / 2 = 64).

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <!-- Full-bleed navy field (no rounded corners — Android masks the shape) -->
  <rect width="512" height="512" fill="#1a1a2e"/>

  <!-- Artwork scaled to 75% and centered into safe zone -->
  <g transform="translate(64 64) scale(0.75)">
    <!-- Background as a visible rounded-square so it still reads as a "tile" inside non-circular masks -->
    <rect width="512" height="512" rx="112" fill="#1a1a2e"/>

    <!-- Drumstick arms (raised) — left -->
    <g transform="rotate(-22 130 120)">
      <rect x="118" y="60" width="24" height="180" rx="12" fill="#F5F1E8"/>
      <circle cx="130" cy="60" r="18" fill="#F5F1E8"/>
    </g>
    <!-- Drumstick arms (raised) — right -->
    <g transform="rotate(22 382 120)">
      <rect x="370" y="60" width="24" height="180" rx="12" fill="#F5F1E8"/>
      <circle cx="382" cy="60" r="18" fill="#F5F1E8"/>
    </g>

    <!-- Drum body -->
    <rect x="108" y="180" width="296" height="240" rx="40" fill="#F5F1E8"/>

    <!-- Tuning rod dots -->
    <g fill="#1a1a2e">
      <circle cx="150" cy="204" r="8"/><circle cx="210" cy="204" r="8"/>
      <circle cx="302" cy="204" r="8"/><circle cx="362" cy="204" r="8"/>
      <circle cx="150" cy="396" r="8"/><circle cx="210" cy="396" r="8"/>
      <circle cx="302" cy="396" r="8"/><circle cx="362" cy="396" r="8"/>
    </g>

    <!-- Sunglasses -->
    <rect x="142" y="270" width="86" height="38" rx="12" fill="#1a1a2e"/>
    <rect x="284" y="270" width="86" height="38" rx="12" fill="#1a1a2e"/>
    <line x1="228" y1="288" x2="284" y2="288" stroke="#1a1a2e" stroke-width="8" stroke-linecap="round"/>

    <!-- Smirk -->
    <path d="M 226 348 Q 256 366 286 348" fill="none" stroke="#1a1a2e" stroke-width="10" stroke-linecap="round"/>
  </g>
</svg>
```

- [ ] **Step 2: Generate the maskable PNG**

Run:
```bash
npx --yes @resvg/resvg-cli public/icons/icon-maskable.svg --width 512 --height 512 public/icons/icon-maskable-512x512.png
```
Expected: one line of output, no errors. File `public/icons/icon-maskable-512x512.png` exists.

- [ ] **Step 3: Visual verify**

Run:
```bash
open public/icons/icon-maskable-512x512.png
```
Expected: navy full-bleed (no rounded corners on the outer edge — the inner rounded tile is the visible content), drum + sticks comfortably inside the inner area with margin on all sides so even a circle mask wouldn't clip them.

- [ ] **Step 4: Commit**

```bash
git add public/icons/icon-maskable.svg public/icons/icon-maskable-512x512.png
git commit -m "$(cat <<'EOF'
feat: add maskable PWA icon for Android adaptive icons

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Update vite.config.js to use the maskable file [model: claude-haiku-4-5-20251001]

**Files:**
- Modify: `vite.config.js:30-35`

Currently the `purpose: 'maskable'` entry re-uses `/icons/icon-512x512.png`. Point it at the new maskable file.

- [ ] **Step 1: Edit the icons array**

In `vite.config.js`, change the third entry of the `icons` array. Find this block:

```javascript
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
```

Replace with:

```javascript
          {
            src: '/icons/icon-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
```

- [ ] **Step 2: Run the production build to verify config still parses and assets are copied**

Run:
```bash
npm run build
```
Expected: build succeeds, no errors mentioning a missing icon file, and `dist/icons/icon-maskable-512x512.png` exists afterward.

Verify with:
```bash
ls dist/icons/
```
Expected: includes `icon-180x180.png`, `icon-192x192.png`, `icon-512x512.png`, `icon-maskable-512x512.png`.

- [ ] **Step 3: Commit**

```bash
git add vite.config.js
git commit -m "$(cat <<'EOF'
feat: point PWA maskable icon at dedicated safe-zone PNG

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: End-to-end visual verification in the dev server [model: claude-sonnet-4-6]

**Files:** None modified — verification only.

- [ ] **Step 1: Start the dev server**

Run:
```bash
npm run dev
```
Expected: server starts at `http://localhost:5173`. Leave running.

- [ ] **Step 2: Visually verify the favicon in the browser tab**

Open `http://localhost:5173` in a browser. Look at the favicon next to the page title in the browser tab.

Expected: navy rounded square with the cream drum mascot, NOT the old five-bar chart.

If the browser is still showing the old icon, hard-refresh (Cmd+Shift+R on Mac) or clear the favicon cache.

- [ ] **Step 3: Verify the PWA manifest in DevTools**

Open Chrome DevTools → Application tab → Manifest (left sidebar).

Expected:
- Icons section shows entries for 192×192 (any), 512×512 (any), and 512×512 (maskable)
- Each preview thumbnail renders the new mascot
- The 512×512 maskable preview has DevTools' built-in mask shapes (circle, square, etc.) and the drum + sticks stay fully visible inside every mask

- [ ] **Step 4: Confirm the build is clean**

Stop the dev server (Ctrl+C in the terminal where it's running) and run:
```bash
npm run build && npm run lint
```
Expected: both succeed with no errors.

- [ ] **Step 5: Report any visual issues back to the user**

If everything looks good, report success. If anything looks wrong (e.g. rendering artifacts at small sizes, maskable safe zone fails, browser cache showing stale icon), pause and ask before "fixing" — the user may want to iterate on the artwork.

---

## Self-Review

Spec coverage:
- Final design (V1) → Task 1 writes the exact SVG from the spec. ✓
- Five deliverables → Tasks 1, 2, 3 produce all five files. ✓
- `vite.config.js` update for maskable → Task 4. ✓
- Testing checklist (favicon at 16/32px, iOS/Android home screen check, maskable safe zone, PWA install, `npm run build`) → Task 5 covers favicon visual, maskable in DevTools, and `npm run build`. iOS/Android physical-device tests are user-side and out of scope for the implementation agent — they're in the spec's checklist for the user to run.

Placeholder scan: no TBDs, no "add appropriate error handling," every command has expected output, every file change has the exact code.

Type consistency: no shared types/functions — pure asset task. The SVG content in Task 3's maskable variant is the same artwork as Task 1's favicon (inner block matches exactly).
