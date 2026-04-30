# VelkTrade profile Discord/social preview patch

## Why this is needed

Discord does **not** wait for the React app on GitHub Pages to load profile data before reading link previews.

So links like:

```txt
https://nicecock.ca/VelkTrade/user/Salt
```

cannot reliably show a dynamic bio/item count in Discord by themselves.

## Fix

This patch adds a backend share route:

```txt
https://velktrade.onrender.com/u/USERNAME
```

That backend route generates real Open Graph/Discord metadata server-side, including:

- player username
- player bio
- number of items they are selling
- purple theme color
- social preview image

Then it redirects real users to:

```txt
https://nicecock.ca/VelkTrade/user/USERNAME
```

## Example Discord share URL

```txt
https://velktrade.onrender.com/u/Salt
```

Discord will show a preview like:

```txt
Salt's Trading Board
Bio text here...
Selling 12 items on Salts Trading Board.
```

## Changed files

- `backend/server.js`
- `frontend/src/components/UserInventoryPage.jsx`

## New environment variable

On Render, optionally add:

```env
PUBLIC_FRONTEND_URL=https://nicecock.ca/VelkTrade
```

If omitted, it falls back to `FRONTEND_ORIGIN`.

## Apply

```bash
git add backend/server.js frontend/src/components/UserInventoryPage.jsx
git commit -m "Add profile Discord social previews"
git push
```

Deploy frontend:

```bash
cd frontend
npm install
npm run build
npm run deploy
```

Then redeploy the Render backend.
