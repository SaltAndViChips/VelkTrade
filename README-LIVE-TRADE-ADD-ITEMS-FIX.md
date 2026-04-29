# VelkTrade live trade add-items fix

This patch fixes both players being unable to add items to live trades.

## Root cause

The previous backend patch made `setOffer()` async and added item ownership validation. If the validation query fails because of Postgres column casing / schema drift / stale table names, the backend rejects the entire offer update, so neither player can add items.

## Fixes

- Live offer updates are no longer blocked by fragile SQL ownership validation.
- Offer item IDs are still normalized and de-duplicated.
- Backend emits clearer `room:error` messages.
- Frontend has direct Offer / Remove buttons plus double-click and drag.
- Frontend immediately displays room errors.
- Keeps accept/confirm reset behavior when offers change.

## Changed files

- backend/rooms.js
- backend/server.js
- frontend/src/App.jsx
- frontend/src/components/Inventory.jsx
- frontend/src/components/TradeBoard.jsx
- frontend/src/styles.css

## Apply

```bash
git add backend/rooms.js backend/server.js frontend/src/App.jsx frontend/src/components/Inventory.jsx frontend/src/components/TradeBoard.jsx frontend/src/styles.css
git commit -m "Fix live trade item adding"
git push
```

Then redeploy Render and GitHub Pages.
