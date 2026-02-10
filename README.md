# Drummate

A Progressive Web App (PWA) for drummers to track practice sessions, view reports, and use an integrated metronome.

## Features

### ✅ Practice Tracking
- ⏱️ Stopwatch timer for practice sessions
- 📝 Multiple practice items (exercises, songs, techniques)
- ✏️ Edit mode for renaming/deleting items
- 💾 Offline-first with IndexedDB storage

### ✅ Daily Reports
- 📊 View practice breakdown by date
- 📈 Time percentages per practice item
- 📅 Navigate between days (today/yesterday/custom)
- 📋 Generate and copy formatted reports

### ✅ Metronome
- 🎵 Sample-accurate timing with Web Audio API
- 🎚️ Circular dial control (30-300 BPM)
- 🎼 Time signatures: 2/4, 3/4, 4/4, 5/4, 6/8, 7/8
- 👆 Tap tempo feature
- 🔊 Accent on beat 1
- 🎯 Visual beat indicators
- 🎶 Tempo names (Grave to Prestissimo)
- 🔄 Plays in background when switching tabs

### ✅ PWA Features
- 📱 Install to home screen (iOS/Android)
- ⚡ Works offline
- 🌐 Bilingual support (English/中文)
- 🌍 Language toggle in header

## Getting Started

### Prerequisites
- Node.js >= 18
- npm >= 9

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd Drummate

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
npm run build
npm run preview
```

## Technology Stack

- **Frontend**: React 19 + Vite 7
- **Styling**: Tailwind CSS v4
- **Database**: Dexie.js (IndexedDB)
- **Audio**: Web Audio API + Web Worker
- **PWA**: vite-plugin-pwa with Workbox

## Project Structure

See [DEVELOPMENT.md](./DEVELOPMENT.md) for detailed architecture and development guide.

## Deployment

### Quick Deploy (Netlify)
```bash
npm run build
# Drag `dist` folder to https://app.netlify.com/drop
```

### CLI Deploy
```bash
# Netlify
netlify deploy --prod

# Vercel
vercel
```

## Development Guide

For detailed development instructions, architecture overview, and how to continue with new features, see [DEVELOPMENT.md](./DEVELOPMENT.md).

## Roadmap

- [x] Phase 0-2: Practice tracking with stopwatch
- [x] Phase 3: Daily reports and analytics
- [x] Phase 4: PWA configuration
- [x] Phase 5: Metronome + Bilingual support
- [ ] Phase 6: Weekly/monthly analytics
- [ ] Phase 7: Advanced metronome features
- [ ] Phase 8: On-device LLM integration

## Contributing

See [DEVELOPMENT.md](./DEVELOPMENT.md) for code style guidelines and development workflow.

## License

MIT

## Acknowledgments

Built with [Claude Code](https://claude.com/claude-code)
