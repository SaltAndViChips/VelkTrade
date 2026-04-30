# VelkTrade full stabilizer patch

## Stabilizes

### Notifications

Fixes:

```txt
localPrefs is not defined
```

The Notifications component now owns safe local settings state and cannot crash if preferences are missing.

Restores:

- Notifications tab
- notification settings
- unverified-user notification toggle
- volume slider
- flashing tab toggle

### Online player list

Restores and stabilizes the top-right dropdown:

- Online tab
- Notifications tab
- refreshes `/api/online-users` every 10 seconds
- shows player presences:
  - Online
  - In trade room
  - Viewing Bazaar
  - Away for Xm
- Away users have a yellow dot
- clicking Invite automatically creates/opens a room and invites the player

### Role icons

Online player list shows only the highest role icon beside the name:

```txt
🖥️ Developer
🛡️ Admin
✓ Trusted
```

Priority:

```txt
Developer > Admin > Trusted
```

### Developer protections

Protected developer usernames:

```txt
salt
velkon
```

Backend and frontend both treat them as Developer accounts.

Regular admins cannot:

- remove developer/admin rights from developers
- reset developer passwords

Developer password reset controls are hidden/disabled unless the current user is also a developer.

### Inventory duplicate bio

Removes the old duplicate **My Profile Bio** card and keeps the compact profile controls only.

## Changed files

- `backend/admin.js`
- `backend/server.js`
- `frontend/src/App.jsx`
- `frontend/src/components/AdminPanel.jsx`
- `frontend/src/components/Notifications.jsx`
- `frontend/src/components/SafeOnlinePlayersDropdown.jsx`
- `frontend/src/styles.css`

## Apply

```bash
git add backend/admin.js backend/server.js frontend/src/App.jsx frontend/src/components/AdminPanel.jsx frontend/src/components/Notifications.jsx frontend/src/components/SafeOnlinePlayersDropdown.jsx frontend/src/styles.css
git commit -m "Stabilize roles presence notifications and admin protections"
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
