# VelkTrade item actions + trade images fix

Direct full-file patch.

## Files included

```txt
frontend/src/components/UnifiedItemExperience.jsx
frontend/src/styles-unified-mosaic-overrides.css
backend/velktrade-compat-routes.js
```

## Frontend fixes

- Removes `Instant trade / mark pending` from the item popup.
- Price editing is visible only to the item owner.
- Remove listing is visible only to the item owner, admins, or developers.
- Interested / remove interest are visible only to non-owners.
- Show interested users is visible only to the item owner, admins, or developers.
- Popup buttons are hidden if the item has no usable id.
- Trade/admin-trade item images are clickable and open the same item popup.
- Trade/admin-trade images are made larger/legible.
- Admin trade images get CSS fallback visibility if they are present in the DOM.

## Backend fixes

The compatibility routes now include more tolerant interest routes:

- `GET /api/items/:itemId/interest`
- `POST /api/items/:itemId/interest`
- `DELETE /api/items/:itemId/interest`
- `POST /api/items/:itemId/remove`
- `DELETE /api/items/:itemId`
- `PUT/PATCH/POST /api/items/:itemId/price`

## Apply

Extract into repo root and overwrite files.

Frontend:

```bash
cd frontend
npm run build
npm run deploy
```

Backend:

```bash
cd ..
git add frontend/src/components/UnifiedItemExperience.jsx frontend/src/styles-unified-mosaic-overrides.css backend/velktrade-compat-routes.js
git commit -m "Fix item popup actions and trade image previews"
git push
```

Redeploy Render backend after pushing because `backend/velktrade-compat-routes.js` changed.
