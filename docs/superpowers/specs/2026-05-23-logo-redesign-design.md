# Logo Redesign — Drum-mate "Rockstar" Mascot

## Background

The current Drummate logo is a five-bar chart (coral / teal / amber / purple / blue) with floating dots above each bar, on a `#1a1a2e` navy field. It reads as "practice stats + metronome dots" but doesn't communicate "drum" directly and lacks a recognizable silhouette at favicon size.

The redesign keeps the existing brand color (`#1a1a2e` navy) and introduces a mascot: a friendly drum character with raised drumstick "arms" and sunglasses — leaning into the literal "Drum-mate" name (drum + companion). Bold, illustrative subject; restrained mono+accent execution.

## Final Design

**Concept:** A snare drum (front view) with two drumstick "arms" raised above it, wearing sunglasses with a smirk. The drum body is the face/torso; the sticks are arms; the sunglasses + smirk give it the "cool, confident practice partner" personality.

**Palette (3 colors only):**
- `#1a1a2e` — background navy, also used for facial features
- `#F5F1E8` — warm cream, used for drum body and drumsticks
- (no accent color in V1 — kept intentionally restrained for "cool" feel)

**Composition (512×512 viewBox):**
- Rounded-square background: full bleed, `rx=112`
- Two drumsticks rise from behind the drum at the top, tilted ±22° outward like raised arms
- Drum body: rounded rectangle, 296×240, `rx=40`, centered horizontally
- Eight tuning rod dots (4 top, 4 bottom) sit just inside the drum's top/bottom edges
- Sunglasses: two filled rectangles connected by a thin bridge bar — eyes/expression
- Smirk: subtle curved smile below the sunglasses

**Why this version (V1) over alternates:**
- V2 (with amber blush) felt slightly too cute for the rockstar attitude
- V3 (wider sticks + open grin) lost the cool/confident vibe in favor of celebratory
- V1 reads cleanly at 16px because the silhouette (drum body + two angled sticks + dark sunglasses block) is unambiguous even when fine details drop out

## Deliverables

Four existing files are replaced in-place; one new file is added for the Android maskable icon. The PWA manifest is defined inline in `vite.config.js` (`VitePWA` plugin) — it currently re-uses `icon-512x512.png` for both the regular and the `purpose: 'maskable'` entry, but a maskable icon needs content padded into the inner ~80% safe zone or Android will crop the raised drumstick tips. A separate file lets the regular icon stay full-bleed.

| File | Format | Size | Notes |
|---|---|---|---|
| `public/favicon.svg` | SVG | 512×512 viewBox | Browser favicon. Source of truth for the artwork. |
| `public/icons/icon-180x180.png` | PNG | 180×180 | Apple touch icon (iOS home screen). iOS applies its own rounded mask, so the rounded-square background is fine. |
| `public/icons/icon-192x192.png` | PNG | 192×192 | Android home screen / PWA. |
| `public/icons/icon-512x512.png` | PNG | 512×512 | PWA splash + high-res `any` icon. |
| `public/icons/icon-maskable-512x512.png` | PNG | 512×512 | **NEW.** Same artwork scaled to ~75% and centered on a full-bleed `#1a1a2e` square, so Android's safe-zone crop doesn't clip the drumstick tips. |

PNGs are exported from the SVG.

The third entry in `vite.config.js` `icons[]` (the `purpose: 'maskable'` one) is updated to point at `icon-maskable-512x512.png` instead of `icon-512x512.png`.

## Final SVG source

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

## Out of scope

- Brand wordmark / typography (no name lockup planned)
- Animated logo / Lottie variants
- Light-mode variant (current dark navy works on both light and dark browser chrome at favicon size)
- Marketing assets (social cards, splash imagery beyond the 512×512 PWA splash)
- Theme color in `<meta name="theme-color">` stays `#1a1a2e` — no change

## Testing checklist

- [ ] `public/favicon.svg` renders correctly in browser tab at 16px and 32px
- [ ] `public/icons/icon-180x180.png` looks right when added to iOS home screen (iOS rounds corners automatically)
- [ ] `public/icons/icon-192x192.png` and `icon-512x512.png` look right when added to Android home screen
- [ ] Maskable icon previewed with Chrome DevTools → Application → Manifest shows the drum + sticks fully visible under all mask shapes (circle, squircle, rounded square)
- [ ] PWA install on desktop Chrome shows the new icon in the app launcher
- [ ] `npm run build` succeeds and `dist/` contains all five updated assets
