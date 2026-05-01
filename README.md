# VelkTrade item popup refresh/reopen fix

Direct full-file patch. No scripts.

## Files included

```txt
frontend/src/components/UnifiedItemExperience.jsx
frontend/src/styles-unified-mosaic-overrides.css
```

## Fixes

- You can open an item, close it, then open another item without refreshing.
- Removes the unsafe manual DOM deletion that caused the popup state/listener to get stuck.
- Saving price updates the popup immediately.
- Saving price updates the clicked card's data attributes immediately.
- If a card has a visible `.price`, `.item-price`, or `.bazaar-price`, it updates that text immediately.
- Keeps item actions inside the popup.
- Keeps online/player sidebar pinned top-right.
- Keeps item mosaic wide-screen behavior.

## Apply

Extract into repo root and overwrite files.

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
git commit -m "Fix item popup reopening and live price updates"
git push
```
