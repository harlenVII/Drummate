# Drop PocketBase Support — Design Spec

**Date:** 2026-05-07  
**Status:** Approved

## Goal

Remove all PocketBase support from Drummate. Firebase becomes the sole backend — imported directly with no abstraction layer.

## Approach

Full hard delete (Option A). Every abstraction that existed to support backend switching is removed. Firebase backend is imported directly where needed. No seam is preserved for future backends.

## Files to Delete

| File | Reason |
|------|--------|
| `src/services/pocketbase.js` | PocketBase SDK initialisation |
| `src/services/backends/pocketbaseBackend.js` | PocketBase backend implementation |
| `src/services/backends/backendInterface.js` | Backend contract with no remaining implementations |
| `src/services/sync.js` | 100% PocketBase sync logic; Firebase has equivalent in `firebaseBackend.js` |
| `src/contexts/BackendContext.jsx` | Backend switching layer; `useBackend()` hook |

## Files to Modify

### `src/main.jsx`
- Remove `BackendProvider` import and wrapper element
- Provider hierarchy becomes: `LanguageProvider → AuthProvider → App`

### `src/contexts/AuthContext.jsx`
- Remove `import { useBackend } from './BackendContext'`
- Remove `const { backend, backendLoading } = useBackend()`
- Import `firebaseBackend` directly: `import firebaseBackend from '../services/backends/firebaseBackend'`
- Remove `const loading = backendLoading` and remove `loading` from the context value — Firebase is a static import with no async loading phase
- Use `firebaseBackend` directly in place of `backend` throughout

### `src/App.jsx`
- Remove `import { useBackend } from './contexts/BackendContext'`
- Remove `const { backend } = useBackend()`
- Import `firebaseBackend` directly: `import firebaseBackend from './services/backends/firebaseBackend'`
- Replace all `backend.` usages with `firebaseBackend.`
- Remove the stale `// Sync with PocketBase on sign-in` comment
- Remove `loading` from `useAuth()` destructure (line 46)
- Remove the `if (loading)` early-return spinner block (line 1147) — the Firebase SDK loading phase no longer exists

### `src/components/AuthScreen.jsx`
- Remove `import { BACKEND_TYPES } from '../services/backends/backendInterface'`
- Remove the backend-switcher UI block (label + PocketBase/Firebase toggle buttons)
- Sign-in/sign-up form is otherwise unchanged

### `src/contexts/LanguageContext.jsx`
- Remove `backend: { label, pocketbase, firebase }` object from both `en` and `zh` translation maps

### `package.json`
- Remove `pocketbase` dependency
- Run `npm install` to update lockfile

### `CLAUDE.md`
- Remove PocketBase backend references from architecture docs and gotchas

## Out of Scope

- No changes to the Firebase backend implementation (`firebaseBackend.js`)
- No changes to the database layer (`database.js`)
- No changes to sync behaviour — Firebase sync is already fully implemented

## Verification

After changes:
- `npm run build` succeeds with no PocketBase imports
- Auth screen shows no backend switcher
- Sign-in → sync works end-to-end (Firebase only)
- No `console.warn` stubs remain in the codebase
