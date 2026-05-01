# VelkTrade backend compatibility routes repack

This package adds backend routes required by the item popup buttons and the online toggle.

## Files included

```txt
backend/velktrade-compat-routes.js
backend/SERVER-INSTALL-SNIPPET.js
```

## What this fixes

Adds compatibility routes for:

- `PUT/POST/PATCH /api/me/online`
- `PUT/POST/PATCH /api/profile/online`
- `PUT/POST/PATCH /api/users/me/online`
- `PUT/POST/PATCH /api/inventory/online`
- `POST /api/items/resolve`
- `PUT/PATCH/POST /api/items/:itemId/price`
- `GET/POST/DELETE /api/items/:itemId/interest`
- `DELETE /api/items/:itemId`
- `POST /api/items/:itemId/remove`
- `POST /api/items/:itemId/instant-trade`
- `POST /api/bazaar/items/:itemId/instant-trade`
- `POST /api/bazaar/items/:itemId/trade-pending`

## Install

1. Extract this zip into your repo root.

2. Open:

```txt
backend/server.js
```

3. Add this after `app`, `authMiddleware`, and your database helper are defined:

```js
const installVelkTradeCompatRoutes = require("./velktrade-compat-routes");

installVelkTradeCompatRoutes({
  app,
  authMiddleware,
  pool
});
```

Use `pool` only if your server has `pool`.

If your server uses `query`, `run`, or `get`, use the matching version:

```js
installVelkTradeCompatRoutes({
  app,
  authMiddleware,
  query,
  run,
  get
});
```

Do not pass variables that do not exist in your `server.js`.

4. Commit and push:

```bash
git add backend/server.js backend/velktrade-compat-routes.js
git commit -m "Add backend compatibility routes for item popup actions"
git push
```

5. Redeploy the Render backend.

## Neon SQL

Run this in Neon if you have not already:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_online BOOLEAN DEFAULT TRUE;
ALTER TABLE items ADD COLUMN IF NOT EXISTS trade_pending BOOLEAN DEFAULT FALSE;
```

If you want me to return a zip with a fully modified `backend/server.js`, upload your current `backend/server.js`.
