# VelkTrade ultrawide scaling + top online + item id fix

Direct full-file zip. No scripts.

## Files included

```txt
frontend/src/components/Inventory.jsx
frontend/src/components/UnifiedItemExperience.jsx
frontend/src/components/Trades.jsx
frontend/src/components/Bazaar.jsx
frontend/src/styles-unified-mosaic-overrides.css
```

## Fixes

- Desktop/ultrawide layouts now use horizontal room:
  - app shell expands up to wide viewport sizes
  - item grids use `auto-fill`
  - 21:9 screens show more cards while preserving card scale
- Removes the duplicate lower inventory Online/Offline pill.
- The top Online/Offline pill now toggles online state.
- Online toggle is optimistic and silently tries compatibility backend routes.
- Item popup can resolve item IDs by:
  - DOM `data-item-id`
  - route/attribute parsing
  - React props/fiber data
  - API matching by image/title from Bazaar/inventory endpoints
  - optional `/api/items/resolve`
- The popup no longer shows the preview-only warning before an action is attempted.

## Apply

Extract into repo root and overwrite files.

Then:

```bash
cd frontend
npm run build
```

If it passes:

```bash
npm run deploy
```

Commit:

```bash
cd ..
git add frontend/src/components/Inventory.jsx frontend/src/components/UnifiedItemExperience.jsx frontend/src/components/Trades.jsx frontend/src/components/Bazaar.jsx frontend/src/styles-unified-mosaic-overrides.css
git commit -m "Fix ultrawide scaling online pill and item id resolution"
git push
```

Redeploy backend if your online toggle/item action routes were updated separately.
