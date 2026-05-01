# VelkTrade restore item popup + wide grid fix

Direct full-file patch. No scripts.

## Files included

```txt
frontend/src/components/UnifiedItemExperience.jsx
frontend/src/styles-unified-mosaic-overrides.css
```

## Fixes

- Restores item popup opening on click.
- Supports clicking cards in:
  - My Inventory
  - Profile inventories
  - Bazaar
  - Trade item lists
  - Admin trade logs
- Removes the brittle duplicate-popup singleton behavior that stopped clicks from opening the UI.
- Adds a single global popup layer safely.
- Forces wide desktop / 21:9 screens to show more cards horizontally by using fixed tile widths and broader grid selectors.
- Restores admin trade item preview behavior through the unified popup.
- Keeps hover zoom disabled.

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
git commit -m "Restore item popup and fix wide item grids"
git push
```
