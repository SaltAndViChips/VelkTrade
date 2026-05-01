# VelkTrade wide cards + backend route fix

Direct full-file zip. No frontend scripts.

## Files included

```txt
frontend/src/components/Inventory.jsx
frontend/src/components/UnifiedItemExperience.jsx
frontend/src/components/Bazaar.jsx
frontend/src/components/Trades.jsx
frontend/src/styles-unified-mosaic-overrides.css
backend/velktrade-compat-routes.js
```

## Fixes

- Cards no longer scale taller than the viewport.
- Desktop/21:9 screens show more cards horizontally by using fixed card widths with `auto-fill`.
- Frontend item-action failures are caught instead of crashing.
- Adds a backend compatibility route file for the popup buttons and online toggle.

## Apply frontend

Extract into repo root, then:

```bash
cd frontend
npm run build
npm run deploy
```

## Required backend route install for popup buttons

The message `Request failed. The backend route may need redeploying.` means the frontend built correctly, but Render/backend does not have the item action routes yet.

Add this once in `backend/server.js` after `app`, `authMiddleware`, and your DB helper/pool are defined:

```js
const installVelkTradeCompatRoutes = require('./velktrade-compat-routes');
installVelkTradeCompatRoutes({ app, authMiddleware, pool, query, run, get });
```

Then commit/push and redeploy Render.

## Commit

```bash
cd ..
git add frontend/src/components/Inventory.jsx frontend/src/components/UnifiedItemExperience.jsx frontend/src/components/Bazaar.jsx frontend/src/components/Trades.jsx frontend/src/styles-unified-mosaic-overrides.css backend/velktrade-compat-routes.js backend/server.js
git commit -m "Fix wide item cards and backend item action routes"
git push
```
