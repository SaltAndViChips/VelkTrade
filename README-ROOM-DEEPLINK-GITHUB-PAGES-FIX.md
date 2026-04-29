# VelkTrade /room/{id} deep-link fix for GitHub Pages

## Fixes

- Removes subdomain room-link logic.
- Uses only:

```txt
/room/{roomId}
```

Example:

```txt
https://nicecock.ca/VelkTrade/room/abc123
```

- Adds a GitHub Pages SPA fallback file:

```txt
frontend/public/404.html
```

Without this file, refreshing or directly opening `/VelkTrade/room/{id}` causes a GitHub Pages 404 because GitHub Pages does not server-rewrite nested React routes to `index.html`.

## Changed files

- `frontend/src/App.jsx`
- `frontend/public/404.html`

## Apply

```bash
git add frontend/src/App.jsx frontend/public/404.html
git commit -m "Fix room deep links for GitHub Pages"
git push
```

Then redeploy frontend:

```bash
cd frontend
npm install
npm run build
npm run deploy
```

## Important

Use this link format only:

```txt
https://nicecock.ca/VelkTrade/room/ROOMID
```

Do not use room subdomains.
