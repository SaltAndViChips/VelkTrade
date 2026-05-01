# VelkTrade direct item popup cleanup + trade crash fix

No scripts. Direct files only.

## Files included

```txt
frontend/src/components/UnifiedItemExperience.jsx
frontend/src/components/TradeRenderGuard.jsx
frontend/src/styles-unified-mosaic-overrides.css
```

## Apply

Extract into your repo root and overwrite files.

Then make sure `UnifiedItemExperience` is still mounted in `App.jsx` from the previous patch.

Also add this import and wrapper if you want the extra trade crash guard around the app:

```jsx
import TradeRenderGuard from "./components/TradeRenderGuard.jsx";
```

Wrap your app return contents with:

```jsx
<TradeRenderGuard>
  {/* existing app content */}
</TradeRenderGuard>
```

The main fixes are in `UnifiedItemExperience.jsx` and `styles-unified-mosaic-overrides.css`.

## What changed

- Clicking anywhere on an item card now opens the item popout, not just clicking the image.
- Inventory/profile/trade/admin cards are included, not only Bazaar.
- Top-level Bazaar card buttons are hidden:
  - Interested
  - Remove
  - inline action buttons
- Top-level price/IC badges are hidden from cards.
- Price and all actions appear in the item popout.
- Hover image popouts/hover zoom are disabled.
- Buttons in the popout are grouped and styled cleaner.
- Object values are safely stringified in the unified item popout.

## Build

```bash
cd frontend
npm run build
```

If it passes:

```bash
npm run deploy
```
