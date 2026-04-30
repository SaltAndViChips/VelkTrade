# VelkTrade Discord preview crawler fix

## Problem

Discord may not show the profile metadata when the share page immediately redirects with:

- `meta refresh`
- JavaScript redirect
- a URL Discord cached before the metadata existed

## Fix

This patch changes the backend `/u/:username` route so:

- Discord/Twitter/Facebook crawlers receive a static Open Graph page with no redirect.
- Real browser users still get redirected to the normal profile page.
- The copied Discord share link includes a cache-busting `?v=...` value so Discord fetches fresh metadata.

## Share URL format

Use this in Discord:

```txt
https://velktrade.onrender.com/u/Salt?v=2
```

The `?v=2` can be any changed value when testing.

## Render environment variable

Make sure this exists on Render:

```env
PUBLIC_FRONTEND_URL=https://nicecock.ca/VelkTrade
```

Then redeploy the backend.

## Changed files

- `backend/server.js`
- `frontend/src/components/UserInventoryPage.jsx`

## Apply

```bash
git add backend/server.js frontend/src/components/UserInventoryPage.jsx
git commit -m "Fix Discord profile preview crawler handling"
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

## Testing

After deployment, test with a fresh URL:

```txt
https://velktrade.onrender.com/u/Salt?v=3
```

Discord caches previews aggressively. If you repost the exact same URL, it may keep the old preview.
