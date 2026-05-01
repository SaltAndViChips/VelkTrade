# VelkTrade bazaar/trade/mosaic/online/privacy fix patch

Run from repo root:

```bash
node scripts/apply-bazaar-trade-mosaic-online-privacy-fix.mjs
```

## Includes

### 3-wide item mosaic

Makes images in these areas display as 3-wide mosaic tiles:

- Admin trade logs
- Trade menu
- Bazaar
- Inventory

Images fill the tile area with `object-fit: contain`, so the full image is visible and readable without hover/click zoom.

### Mobile/tablet CSS

Adds mobile and tablet CSS across the app while preserving the theme.

### Online toggle fix

Adds compatible backend routes for the inventory Online toggle:

- `PUT/POST/PATCH /api/me/online`
- `PUT/POST/PATCH /api/profile/online`
- `PUT/POST/PATCH /api/users/me/online`

Also includes Neon SQL for `users.show_online`.

### Admin bazaar listing removal

Adds backend routes:

- `DELETE /api/admin/bazaar/items/:itemId`
- `POST /api/admin/bazaar/items/:itemId/remove`
- `DELETE /api/bazaar/items/:itemId/admin`
- `POST /api/bazaar/items/:itemId/admin-remove`

These remove a bazaar listing by making the item invalid for Bazaar display, without deleting the item.

### Accepted offline trade from Bazaar

Adds backend routes:

- `POST /api/bazaar/items/:itemId/offline-accepted-trade`
- `POST /api/bazaar/items/:itemId/create-offline-trade`
- `POST /api/admin/bazaar/items/:itemId/offline-accepted-trade`

Expected body:

```json
{
  "buyerId": 123,
  "buyerUsername": "BuyerName",
  "icAmount": 500
}
```

The route creates an offline trade with:

- buyer IC
- seller item from the bazaar post
- seller still needing final confirmation

### Seller privacy for buy orders

Adds a response sanitizer so buyer-facing bazaar/buy-order responses do **not** expose seller identity until accepted.

Hidden fields before seller acceptance:

- `seller`
- `sellerId`
- `seller_id`
- `sellerUsername`
- `seller_username`
- `owner`
- `ownerId`
- `owner_id`
- `ownerUsername`
- `owner_username`
- `userId`
- `userid`

Admins and sellers can still see owner/seller fields.

## Neon SQL

Run in Neon:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_online BOOLEAN DEFAULT TRUE;
UPDATE users SET show_online = TRUE WHERE show_online IS NULL;
```

Included file:

```bash
database/neon-online-toggle.sql
```

## Apply

```bash
node scripts/apply-bazaar-trade-mosaic-online-privacy-fix.mjs
psql "$DATABASE_URL" -f database/neon-online-toggle.sql
git add frontend/src/styles.css backend/server.js database/neon-online-toggle.sql scripts/apply-bazaar-trade-mosaic-online-privacy-fix.mjs patches/mosaic-responsive-overrides.css
git commit -m "Fix bazaar privacy online toggle and item mosaics"
git push
```

Then:

```bash
cd frontend
npm run build
npm run deploy
```

Redeploy Render backend after pushing.
