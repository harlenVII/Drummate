# Visitor Sign-Up Modal — Design Spec

**Date:** 2026-05-27
**Status:** Approved

## Problem

When a visitor clicks "Create account" in Settings, the app currently calls `exitVisitorModeForAuth()` which immediately flips `isVisitor` to false and redirects to the full-screen AuthScreen. This breaks the visitor's sense of context (they feel kicked out of their session) and means refreshing during the flow loses their visitor state.

## Goal

Keep the visitor fully in the app while they sign up. The modal is purely a UI overlay — visitor state is untouched until the Firebase sign-up call succeeds.

## Behaviour

### Opening the modal
- Visitor is in the app (any tab), opens Settings, clicks "Create account"
- A sign-up modal appears as an overlay (z-[70], above the settings panel)
- Visitor state is unchanged: `localStorage['drummate_visitor']` stays set, `isVisitor` stays true
- Refreshing the page while the modal would be open lands back in the visitor session (modal is gone, app is normal)

### The modal
Layout: `fixed inset-0` overlay with `bg-black/50`. Inner card: `max-w-sm rounded-2xl` matching existing modal style.

Content (top to bottom):
1. **Migration notice** — blue info banner: *"Your local practice data will be saved to your new account when you sign up."*
2. **Title** — "Create account"
3. **Form** — name, email, password inputs (same styling as AuthScreen)
4. **Inline error** — shown below the form on API failure; modal stays open so user can retry
5. **"Create account" submit button** — disabled + spinner while submitting
6. **"Cancel" link** — closes modal, visitor session fully intact

### Success state
After the API call succeeds, the form is replaced by a success message:

> **Welcome, [name]! Your data is now synced across devices.**

After 2 seconds, the modal auto-closes and the settings panel closes. The user is now authenticated; the app transitions seamlessly.

### Failure / cancellation
- API error → inline error message, modal stays open, visitor session intact
- Cancel → modal closes, visitor session intact, settings panel stays open

## Implementation

### 1. `signUpAsVisitor(email, password, name)` — new function in `AuthContext`

Strict ordering — visitor teardown only on success:
1. `firebaseBackend.signUp(email, password, name)` → throws on failure (modal shows error, nothing changes)
2. `firebaseBackend.pushAllLocal(newUser.id)` → migrate visitor data (errors logged, not thrown)
3. `localStorage.removeItem('drummate_visitor')`
4. `setIsVisitor(false)`, `setUser(newUser)`, `setFromVisitorIntent(null)`

Exported via `AuthContext.Provider` value.

### 2. `VisitorSignUpModal` — new component (`src/components/VisitorSignUpModal.jsx`)

Props: `onClose: () => void`

Local state: `name`, `email`, `password`, `error`, `submitting` (bool), `successName` (string | null).

- On submit: calls `signUpAsVisitor`; on success sets `successName`, schedules `onClose` via `setTimeout(onClose, 2000)`
- `onClose` is called by the parent (SettingsPanel) which also closes the settings panel

### 3. `SettingsPanel` changes

- Add local state: `showSignUpModal` (bool)
- "Create account" button sets `showSignUpModal = true` (no `exitVisitorModeForAuth` call)
- Render `<VisitorSignUpModal onClose={() => { setShowSignUpModal(false); onClose(); }} />` when `showSignUpModal` is true

### 4. Cleanup

- Remove `exitVisitorModeForAuth` from `AuthContext` (no longer called anywhere)
- Remove `fromVisitorIntent` state from `AuthContext` (no longer needed)
- Remove `fromVisitorIntent` from `AuthContext.Provider` value
- Remove `fromVisitorIntent` usage from `AuthScreen` (the upgrade banner and `isSignUp` effect)
- Remove unused i18n keys: `auth.upgradeBannerSignUp`, `auth.upgradeBannerSignIn`
- Keep `settings.guestSignUp` i18n key — still used as the "Create account" button label in SettingsPanel

### 5. i18n additions

Add to both `en` and `zh` under `settings`:
- `visitorSignUpNotice` — "Your local practice data will be saved to your new account when you sign up."
- `visitorSignUpSuccess` — "Welcome, {name}! Your data is now synced across devices."

## Non-goals

- No changes to the "Log off" visitor flow
- No changes to the regular (non-visitor) sign-out flow
- No changes to the AuthScreen for non-visitor users
