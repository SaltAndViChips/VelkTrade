# VelkTrade recover blank screen after login patch

## Purpose

This is a recovery hotfix.

The blank screen after login means a runtime error is happening in the authenticated React render path.

The recent high-risk changes are the top-right presence/notifications overlays and related presence effects.

## What this patch does

### 1. Removes risky logged-in overlays from `App.jsx`

This disables these render-time overlays for now:

- `PresenceNotificationsDropdown`
- `OnlinePlayersSidebar`
- `AppUpdateNotice`

The rest of the app remains usable.

### 2. Removes duplicate/risky presence state declarations

It removes duplicate declarations for:

- `pendingRoomInvite`
- `previousRoomPlayerIdsRef`
- `awayTimerRef`

### 3. Adds a top-level React error boundary

`main.jsx` now wraps `<App />` in:

```jsx
<AppErrorBoundary>
  <App />
</AppErrorBoundary>
```

If anything crashes again, the page will show a visible error panel instead of a blank white screen.

## Changed files

- `frontend/src/App.jsx`
- `frontend/src/main.jsx`
- `frontend/src/components/AppErrorBoundary.jsx`
- `frontend/src/styles.css`

## Apply

```bash
git add frontend/src/App.jsx frontend/src/main.jsx frontend/src/components/AppErrorBoundary.jsx frontend/src/styles.css
git commit -m "Recover from blank screen after login"
git push
```

Then test:

```bash
cd frontend
npm run build
npm run deploy
```

## Next step

After the app is visible again, re-add the compact online/notifications menu in a smaller isolated patch.
