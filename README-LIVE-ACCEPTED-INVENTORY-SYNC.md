# VelkTrade live accepted trade + inventory sync patch

## Fixes

### 1. Save live trade after accepted

When both players in a live room click Accept, the backend immediately saves a trade row with:

```txt
status = accepted
```

It includes:
- room ID
- both players
- both offer sides
- chat history

When both later Confirm, it saves the completed trade and transfers ownership.

### 2. Inventory updates during live trade

When a player adds/removes an inventory item while inside a live room, the frontend emits:

```txt
inventory:updated
```

The backend broadcasts it to the room.

The other player receives it and refreshes that player's inventory automatically, so new items show up without refreshing the page.

## Changed files

- backend/rooms.js
- backend/server.js
- frontend/src/App.jsx

## Apply

```bash
git add backend/rooms.js backend/server.js frontend/src/App.jsx
git commit -m "Save accepted live trades and sync room inventories"
git push
```

Then redeploy Render and GitHub Pages.
