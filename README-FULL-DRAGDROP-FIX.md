# VelkTrade full drag/drop frontend + backend fix

This patch fixes live trade drag/drop more aggressively.

## Fixes included

### Frontend
- Uses `PointerSensor`, `MouseSensor`, and `TouchSensor`
- Adds a tiny activation distance so drag starts reliably
- Uses stable drag IDs:
  - `inventory-item-{id}`
  - `offer-item-{id}`
- Adds explicit droppable zone IDs:
  - `inventory-drop`
  - `my-offer-drop`
- Fixes double-click:
  - inventory item -> add to offer
  - offered item -> remove from offer
- Adds visible `Offer` / `Remove` fallback buttons so trading still works even if drag is blocked by browser/device behavior
- Adds drop-zone active styling

### Backend
- Validates live offer item ownership before accepting `trade:offer`
- Normalizes numeric item IDs
- Emits updated room state after each offer update
- Keeps accepted/confirmed reset behavior when offers change

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
git commit -m "Fix live trade drag and drop"
git push
```

Then redeploy:

```bash
# backend: Render redeploy
# frontend:
cd frontend
npm run build
npm run deploy
```

## Note

If drag still does not start after this patch, check browser console for errors and verify `@dnd-kit/core` is installed in `frontend/package.json`.
