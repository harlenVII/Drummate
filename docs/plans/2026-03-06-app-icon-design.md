# App Icon Design: Abstract Rhythm

## Concept

A flat, minimal icon depicting beat sequencer bars — directly referencing Drummate's signature sequencer feature. Multi-color palette on a dark background for vibrancy and home-screen visibility.

## Specification

### Canvas

- **Shape:** Rounded square (standard app icon, ~22% corner radius)
- **Background:** Solid dark navy `#1a1a2e`

### Main Element: Beat Bars

5 vertical pill-shaped bars, centered horizontally, aligned to a common baseline:

| Bar | Color         | Hex       | Relative Height |
|-----|---------------|-----------|-----------------|
| 1   | Coral         | `#FF6B6B` | 40%             |
| 2   | Teal          | `#4ECDC4` | 60%             |
| 3   | Amber         | `#FFD93D` | 75%             |
| 4   | Purple        | `#A855F7` | 50%             |
| 5   | Blue          | `#60A5FA` | 35%             |

- Equal width, consistent spacing
- Rounded tops (pill shape)
- Bars occupy ~60% of icon width

### Accent: Beat Dots

- Small filled circles above each bar, matching bar color
- Diameter: ~8% of icon width
- Small gap between dot and bar top

## Files to Generate

| File                          | Size    | Purpose                        |
|-------------------------------|---------|--------------------------------|
| `public/icons/icon-512x512.png` | 512x512 | PWA manifest, high-res       |
| `public/icons/icon-192x192.png` | 192x192 | PWA manifest                 |
| `public/icons/icon-180x180.png` | 180x180 | Apple touch icon             |
| `public/favicon.svg`            | vector  | Browser tab favicon          |

## References to Update

- `index.html` — change favicon from `vite.svg` to `favicon.svg`, update apple-touch-icon path
- `vite.config.js` — PWA manifest icon entries (if applicable)
- Delete `public/vite.svg` (no longer needed)

## Style Keywords

Flat, minimal, geometric, multi-color, dark background, sequencer-inspired
