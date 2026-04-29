# VelkTrade dashboard/admin/DnD patch

Copy these files into your repo, preserving paths.

## Added/fixed

- Salt admin access is now case-insensitive and trimmed.
- Added item deletion from inventory.
- Added dashboard with:
  - My Inventory
  - My Trade History
  - Create Room
  - Join Room
  - Admin Panel, Salt only
- Added exit room and return-to-dashboard buttons.
- Added trade history filters: all, accepted, confirmed, completed, declined.
- Trade chat history is saved into trade history.
- Added dashboard charts.
- Fixed clunky drag by using DragOverlay.
- Added double-click to move item:
  - inventory -> offer
  - offer -> inventory
- Steam-like dark purple/grey/black theme.

## Files included

- backend/db.js
- backend/rooms.js
- backend/server.js
- frontend/src/App.jsx
- frontend/src/components/AdminPanel.jsx
- frontend/src/components/ChartsPanel.jsx
- frontend/src/components/Dashboard.jsx
- frontend/src/components/Inventory.jsx
- frontend/src/components/MyTradeHistory.jsx
- frontend/src/components/TradeBoard.jsx
- frontend/src/components/TradeChat.jsx
- frontend/src/styles.css
- frontend/src/tests/tradeLogic.test.js
