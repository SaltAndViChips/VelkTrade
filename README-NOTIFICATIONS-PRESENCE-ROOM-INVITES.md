# VelkTrade notifications, online presence, and room invite patch

## Adds

### Notifications

Persistent notifications are now stored in Postgres for:

- Receiving an offline trade request
- Receiving a counter offer
- Receiving a room invite
- A room invite being declined
- A room invite being accepted

### Notifications bell

Top-right bell beside Logout shows unseen notification count:

```txt
🔔 3
```

The browser tab title changes to:

```txt
(3) Salts Trading Board
```

### Notification settings

The Notifications page includes a gear section with:

- Offline trade request notifications
- Counter offer notifications
- Room invite notifications
- Invite response notifications
- Sound volume slider
- Flashing tab/window notification toggle

### Sound + flash

When a new notification arrives:

- Notification sound plays if volume > 0
- Tab title flashes if enabled

### Online presence

Backend tracks logged-in socket users and broadcasts online usernames.

Profiles now receive an `online` boolean where supported.

### Room invites

From a created/live room, you can invite a player by username.

The invited player receives a notification with:

- Join Room
- Decline

If they decline, the inviter receives a notification.

## Changed files

- `backend/db.js`
- `backend/server.js`
- `frontend/src/App.jsx`
- `frontend/src/components/Notifications.jsx`
- `frontend/src/components/UserInventoryPage.jsx`
- `frontend/src/styles.css`

## Apply

```bash
git add backend/db.js backend/server.js frontend/src/App.jsx frontend/src/components/Notifications.jsx frontend/src/components/UserInventoryPage.jsx frontend/src/styles.css
git commit -m "Add notifications presence and room invites"
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

## Notes

This patch assumes your current backend uses the Postgres schema from the previous VelkTrade patches.
