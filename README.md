# VelkTrade duplicate item popup fix

Direct full-file patch.

## Files included

```txt
frontend/src/components/UnifiedItemExperience.jsx
frontend/src/styles-unified-mosaic-overrides.css
```

`backend/velktrade-compat-routes.js` is included too if it was present in the source patch.

## Fixes

- Prevents the old/off-side item popup from appearing together with the centered popup.
- Adds a centered-popup marker so CSS can hide stale legacy popup layers.
- Uses a singleton handler token so only the newest `UnifiedItemExperience` instance handles item clicks.
- Stops the original click event immediately after the unified item card is detected, preventing older item-popup click handlers from also opening.
- Keeps the centered item popup as the only interactive item modal.

## Apply

Extract into your repo root and overwrite files.

Then:

```bash
cd frontend
npm run build
npm run deploy
```

Commit:

```bash
cd ..
git add frontend/src/components/UnifiedItemExperience.jsx frontend/src/styles-unified-mosaic-overrides.css
git commit -m "Fix duplicate item popup opening"
git push
```

Since GitHub is connected now, future patches can be applied directly to the repository once you ask me to patch the repo/branch.
