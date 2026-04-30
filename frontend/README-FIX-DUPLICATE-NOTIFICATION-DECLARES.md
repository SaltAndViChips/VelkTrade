# VelkTrade fix duplicate notification declarations patch

## Fix

Fixes build errors:

```txt
Identifier `visibleNotifications` has already been declared
Identifier `tradeStatuses` has already been declared
Identifier `unseenNotificationCount` has already been declared
```

## Important

This patch removes the **earlier/old** duplicate declarations and keeps the later stabilizer declarations.

Kept:

```jsx
const visibleNotifications = notifications || [];
const tradeStatuses = {};
const unseenNotificationCount = 0;
```

Removed only the earlier duplicate copies.

## Changed file

- `frontend/src/App.jsx`

## Apply

```bash
git add frontend/src/App.jsx
git commit -m "Remove old duplicate notification declarations"
git push
```

Then test:

```bash
cd frontend
npm run build
```
