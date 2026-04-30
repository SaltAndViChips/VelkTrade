# VelkTrade add missing App component imports patch

## Fix

Fixes this build error:

```txt
Could not resolve './components/AppUpdateNotice'
```

## Adds

- `frontend/src/components/AppUpdateNotice.jsx`
- `frontend/src/components/OnlinePlayersSidebar.jsx`

These are required by the corrected `App.jsx`.

## Apply

```bash
git add frontend/src/components/AppUpdateNotice.jsx frontend/src/components/OnlinePlayersSidebar.jsx
git commit -m "Add missing App components"
git push
```

Then test:

```bash
cd frontend
npm run build
```
