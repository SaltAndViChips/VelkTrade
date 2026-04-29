# VelkTrade admin flag + trade search patch

## Adds

### Database-backed admin flags

Salt remains permanent super-admin.

Admins can now grant/revoke admin access for other accounts from the Admin Panel.

Adds this database column:

```sql
isAdmin BOOLEAN DEFAULT FALSE
```

### Backend admin endpoints

```txt
GET  /api/admin/users
POST /api/admin/set-admin
```

`/api/me`, `/api/login`, and `/api/register` now return:

```json
{
  "user": {
    "id": 1,
    "username": "Salt",
    "isAdmin": true
  }
}
```

### Trades tab search bar

The Trades tab now has a search field that filters by:

- trade ID
- status
- room ID
- usernames
- item names
- chat/message text
- date

## Changed files

- `backend/db.js`
- `backend/server.js`
- `frontend/src/App.jsx`
- `frontend/src/components/AdminPanel.jsx`
- `frontend/src/components/Trades.jsx`

## Apply

```bash
git add backend/db.js backend/server.js frontend/src/App.jsx frontend/src/components/AdminPanel.jsx frontend/src/components/Trades.jsx
git commit -m "Add admin flags and trade search"
git push
```

Then redeploy:

```bash
cd frontend
npm install
npm run build
npm run deploy
```

Also redeploy the Render backend.
