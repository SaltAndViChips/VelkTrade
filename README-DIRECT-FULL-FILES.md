# VelkTrade single-popup + wide shell + NetworkError-safe item action fix

Direct full-file zip. No scripts required for frontend.

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

- Uses more desktop/ultrawide width.
- Item grids use `auto-fill` to show more cards horizontally.
- Prevents duplicate stacked item popups.
- Hides duplicate lower inventory Online toggle.
- Top Online pill stays the toggle.
- Item popup actions catch request failures instead of throwing uncaught NetworkError.
- Adds optional backend compatibility routes for item actions and online toggle.

## Apply frontend

Extract into repo root and overwrite files.

```bash
cd frontend
npm run build
npm run deploy
```

Commit frontend files:

```bash
cd ..
git add frontend/src/components/Inventory.jsx frontend/src/components/UnifiedItemExperience.jsx frontend/src/components/Bazaar.jsx frontend/src/components/Trades.jsx frontend/src/styles-unified-mosaic-overrides.css backend/velktrade-compat-routes.js
git commit -m "Fix single item popup wide layout and item action errors"
git push
```

## Optional backend NetworkError fix

If item popup buttons still show request failures, add this once in `backend/server.js` after `app`, `authMiddleware`, and your DB helper/pool are defined:

```js
const installVelkTradeCompatRoutes = require('./velktrade-compat-routes');
installVelkTradeCompatRoutes({ app, authMiddleware, pool, query, run, get });
```

Then redeploy Render backend.
