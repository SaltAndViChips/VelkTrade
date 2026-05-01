# VelkTrade direct inventory/trades/popup/online fix

No scripts. Direct full-file replacements only.

## Files included

```txt
frontend/src/components/Inventory.jsx
frontend/src/components/Trades.jsx
frontend/src/components/UnifiedItemExperience.jsx
frontend/src/styles-unified-mosaic-overrides.css
```

## Fixes

- Trades tab React error #31 from rendering `{}` objects.
- Inventory Online toggle can turn off/on from inside the Inventory component.
- Inventory items are clickable and open the unified popup.
- Inventory top-level `IC Price` and `Remove` buttons are removed from item cards.
- Trade/Bazaar/admin/profile item hover zoom/popout behavior is disabled.
- Popup buttons are cleaner and grouped.
- All item values are converted to safe text before render.

## Apply

Extract into your repo root and overwrite files.

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
git add frontend/src/components/Inventory.jsx frontend/src/components/Trades.jsx frontend/src/components/UnifiedItemExperience.jsx frontend/src/styles-unified-mosaic-overrides.css
git commit -m "Fix inventory popup online toggle and trade render crash"
git push
```
