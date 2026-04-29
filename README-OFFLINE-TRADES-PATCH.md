# VelkTrade offline trades / counter-offers / room ID patch

Copy these files into your repo, preserving paths.

## What this patch adds/fixes

- Room ID is shown again inside live room/trade view.
- Dashboard menu says `Trades` instead of `My Trade History`.
- Adds an offline trade-offer flow:
  - Search a player.
  - Drag your own items into `Your Offer`.
  - Drag the other player's items into `Requested Items`.
  - Submit offer even when the other player is offline/not in a room.
- Adds counter-offers:
  - Open `Trades`.
  - Click `Counter`.
  - Build and submit a counter-offer.
- Adds accept / confirm / decline actions for stored trades.
- Stored trades show in `Trades` for both players.
- Chat history remains included in trade history for live trades.
- Double-click still works:
  - Your item -> offered items
  - Other player's item -> requested items
  - Offered/requested item -> remove from that side

## Changed / added files

- backend/server.js
- frontend/src/App.jsx
- frontend/src/components/Dashboard.jsx
- frontend/src/components/RoomPanel.jsx
- frontend/src/components/TradeOfferPanel.jsx
- frontend/src/components/Trades.jsx
- frontend/src/styles.css

## Important

This patch assumes you already applied the Neon/Postgres patch. It uses the existing `trades` table:

- fromUser
- toUser
- fromItems
- toItems
- chatHistory
- status

Statuses used:

- pending
- countered
- accepted
- completed
- declined
