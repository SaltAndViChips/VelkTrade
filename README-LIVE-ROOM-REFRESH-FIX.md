# VelkTrade live room refresh fix

## Problem

Items only visually/update correctly after rejoining the room.

That means the server is updating the room, but the clients are not refreshing dependent inventory state consistently after `trade:offer`.

## Fix

This patch adds explicit room-wide sync events after offer changes:

- `room:update`
- `trade:offer-updated`
- `inventory:refresh`

Both clients refresh:
- their own inventory
- the other player's inventory
- trades list

This avoids needing to leave/rejoin.

## Changed files

- backend/server.js
- frontend/src/App.jsx

## Apply

```bash
git add backend/server.js frontend/src/App.jsx
git commit -m "Fix live room offer refresh"
git push
```

Then redeploy Render and GitHub Pages.
