# VelkTrade live join inventory + drag/drop + room link fix

## Fixes

### Live room inventory no longer loading

The socket effect now stays stable instead of reconnecting when room state changes. On every room update, both inventories refresh immediately.

### Drag/drop still not working

The frontend now uses:
- `PointerSensor`
- `TouchSensor`
- `pointerWithin`
- `rectIntersection`
- stable draggable IDs
- visible fallback buttons: `Offer` and `Remove`

Even if drag/drop is blocked by browser behavior, the buttons still let both players add/remove live trade items.

### Room links

This adds automatic room deep-linking:

```txt
https://nicecock.ca/VelkTrade/room/ROOMID
```

When a logged-in player opens that link, the app auto-joins the room.

It also supports optional subdomain parsing:

```txt
https://ROOMID.nicecock.ca/VelkTrade
```

However, true wildcard subdomains require DNS/hosting support. GitHub Pages supports configured custom subdomains, but GitHub warns against wildcard DNS records like `*.example.com` due to takeover risk.

## Changed files

- frontend/src/App.jsx
- frontend/src/components/Inventory.jsx
- frontend/src/components/TradeBoard.jsx
- frontend/src/styles.css
- backend/server.js

## Apply

```bash
git add frontend/src/App.jsx frontend/src/components/Inventory.jsx frontend/src/components/TradeBoard.jsx frontend/src/styles.css backend/server.js
git commit -m "Fix live join inventory drag drop and room links"
git push
```

Then deploy:

```bash
cd frontend
npm install
npm run build
npm run deploy
```

Also redeploy Render backend.
