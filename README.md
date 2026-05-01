# VelkTrade responsive item previews + mobile layout + online toggle fix

This is a repo-safe patch bundle. Run the included patch script from the repository root.

## What it changes

### Responsive item previews

Admin trade item previews are made readable by default:

- full image visible with `object-fit: contain`
- desktop/browser: roughly 4–5 item cards across
- tablet: roughly 3–4 item cards across
- mobile: 2 item cards across
- hover/click zoom is disabled so images do not jump around

### Mobile/tablet accessibility

Adds responsive CSS across the app:

- no horizontal overflow
- cards/forms/buttons resize properly
- admin panels stack on phones
- inventory/bazaar/item grids use 2 columns on mobile
- trade-room sections stack
- fixed player menu is viewport-safe

### Online toggle fix

Adds backend-compatible online visibility endpoints:

- `PUT /api/me/online`
- `POST /api/me/online`
- `PATCH /api/me/online`
- `PUT /api/profile/online`
- `POST /api/profile/online`
- `PATCH /api/profile/online`
- `PUT /api/users/me/online`
- `POST /api/users/me/online`
- `PATCH /api/users/me/online`

The route accepts any of these body fields:

```json
{
  "showOnline": true,
  "show_online": true,
  "online": true,
  "enabled": true
}
```

It saves to `users.show_online`.

## Apply

From your repo root:

```bash
node scripts/apply-responsive-mobile-online-toggle-patch.mjs
```

Then run the Neon migration if needed:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_online BOOLEAN DEFAULT TRUE;
```

Or run the included file:

```bash
psql "$DATABASE_URL" -f database/neon-show-online.sql
```

Then:

```bash
git add frontend/src/styles.css backend/server.js database/neon-show-online.sql scripts/apply-responsive-mobile-online-toggle-patch.mjs
git commit -m "Improve responsive layout and fix online toggle"
git push
```

Deploy:

```bash
cd frontend
npm run build
npm run deploy
```

Redeploy Render backend after pushing.
