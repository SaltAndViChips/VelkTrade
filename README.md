# Realtime Trading App

A realtime 1v1 item trading app built with React, Express, Socket.io, SQLite, and Imgur links.

## Features

- Register/login
- Persistent user inventories
- Add items by direct Imgur image URL
- Fetch Imgur image title automatically
- View another player inventory by username
- Create and join realtime 1v1 trade rooms
- Drag items into a trade offer
- Offered items disappear from your visible trade inventory
- Counter-offers reset accept/confirm status
- Both users must accept first
- Both users must confirm after accepting
- Items transfer only after both users confirm
- Trade history stored in SQLite

## File structure

```txt
trading-app/
├─ backend/
│  ├─ package.json
│  ├─ server.js
│  ├─ db.js
│  ├─ auth.js
│  ├─ imgur.js
│  ├─ rooms.js
│  └─ .env.example
│
├─ frontend/
│  ├─ package.json
│  ├─ index.html
│  ├─ vite.config.js
│  └─ src/
│     ├─ main.jsx
│     ├─ App.jsx
│     ├─ api.js
│     ├─ socket.js
│     ├─ styles.css
│     ├─ components/
│     │  ├─ AuthForm.jsx
│     │  ├─ Inventory.jsx
│     │  ├─ RoomPanel.jsx
│     │  └─ TradeBoard.jsx
│     └─ tests/
│        └─ tradeLogic.test.js
└─ README.md
```

## Backend setup

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

## Frontend setup

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Open:

```txt
http://localhost:5173
```

## GitHub Pages deploy

The frontend can deploy to GitHub Pages:

```bash
cd frontend
npm run build
npm run deploy
```

The backend cannot run on GitHub Pages. Deploy the backend separately using Railway, Render, Fly.io, or a VPS.

Set your production frontend API URL before deploying:

```env
VITE_API_URL=https://your-backend-url.com
```

## Trade behavior

When an item is dragged into **Your Offer**, it disappears from your visible inventory immediately.

However, it is not permanently transferred in the database until:

1. Player A clicks **Accept Trade**
2. Player B clicks **Accept Trade**
3. Player A clicks **Confirm Trade**
4. Player B clicks **Confirm Trade**

Only then does the backend run a database transaction that transfers ownership.
