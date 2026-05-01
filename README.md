# VelkTrade unified item experience + online/player menu fix

Run from the repo root:

```bash
node scripts/apply-unified-item-experience-online-player-fix.mjs
```

## Adds/fixes

### Unified item style across all item screens

Targets item tiles in:

- My Inventory
- Profile inventories
- Bazaar
- Trade menu
- Admin trade logs

The patch forces a shared 3-wide mosaic style on desktop:

- 3 wide on desktop
- 3 wide on tablet unless extremely narrow
- 2 wide on small phones only
- full image visible using `object-fit: contain`
- removes nested tiny image boxes visually
- item text/price overlays on hover/focus at the bottom

### Click item popout

Clicking an item image/card opens a unified popout:

- image fills about 60–75% of viewport height
- image is slightly left of center
- action menu is on the right
- mobile stacks the image above the menu

Menu supports:

- Edit price, if owner/admin/dev can be detected
- Mark Interested, if not owner
- Remove Interest
- Remove item/listing, if owner/admin/dev can be detected
- Show interested users, if owner/admin/dev can be detected
- Verified-only interested users toggle
- Instant trade button for owner/admin/dev:
  - creates a pending seller-confirm trade
  - marks item as trade pending through backend endpoint
  - blocks further interest through backend endpoint

The overlay uses DOM data if available and gracefully degrades if an item id cannot be detected.

### Online toggle fix

Adds robust backend routes for online toggle:

- `PUT/POST/PATCH /api/me/online`
- `PUT/POST/PATCH /api/profile/online`
- `PUT/POST/PATCH /api/users/me/online`
- `PUT/POST/PATCH /api/inventory/online`

Also adds frontend global fallback handling for buttons/toggles labelled `Online`.

### Player menu desktop fix

Adds CSS fixes so the online/player menu opens fully on desktop instead of only opening a bit.

### Backend endpoints

Adds compatibility routes:

- `PUT/PATCH/POST /api/items/:itemId/price`
- `DELETE /api/items/:itemId`
- `POST /api/items/:itemId/remove`
- `POST /api/items/:itemId/interest`
- `DELETE /api/items/:itemId/interest`
- `POST /api/items/:itemId/instant-trade`
- `POST /api/bazaar/items/:itemId/instant-trade`
- `POST /api/bazaar/items/:itemId/trade-pending`

## Neon SQL

Run in Neon if needed:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_online BOOLEAN DEFAULT TRUE;
ALTER TABLE items ADD COLUMN IF NOT EXISTS trade_pending BOOLEAN DEFAULT FALSE;
```

Included:

```bash
database/neon-unified-item-experience.sql
```

## Apply

```bash
node scripts/apply-unified-item-experience-online-player-fix.mjs
psql "$DATABASE_URL" -f database/neon-unified-item-experience.sql
git add frontend/src/App.jsx frontend/src/components/UnifiedItemExperience.jsx frontend/src/styles.css backend/server.js database/neon-unified-item-experience.sql scripts/apply-unified-item-experience-online-player-fix.mjs patches/unified-item-experience.css
git commit -m "Unify item views and fix online player toggles"
git push
```

Then:

```bash
cd frontend
npm run build
npm run deploy
```

Redeploy Render backend after pushing.
