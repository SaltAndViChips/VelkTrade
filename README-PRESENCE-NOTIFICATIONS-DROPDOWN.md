# VelkTrade presence + notifications dropdown patch

## Adds

### Compact top-right menu

Replaces the large online-player side tab with a small square top-right `≡` button.

The dropdown has two tabs:

- **Online**
- **Notifications**

### Online tab

Shows:

- player status
- admins first
- verified users next
- regular users after
- admin badge
- verified checkmark
- one-click **Profile**
- one-click **Invite** when you are in a room

### Notifications tab

Shows notifications inside the same dropdown.

Room invites, trade checks, and notification actions still work.

### Room join/leave chimes

When someone joins your current room:

- short soft chime

When someone leaves your current room:

- short pitched-down chime

### Inventory online toggle

Adds a card in **My Inventory**:

```txt
Online Visibility
Appear Online / Appear Offline
```

When off, the user is hidden from the online player list.

## Backend

Adds:

```txt
users.show_online BOOLEAN DEFAULT TRUE
PUT /api/me/online-visibility
```

Presence broadcasts exclude users with `show_online = false`.

## Changed files

- `backend/db.js`
- `backend/server.js`
- `frontend/src/App.jsx`
- `frontend/src/components/PresenceNotificationsDropdown.jsx`
- `frontend/src/components/Notifications.jsx`
- `frontend/src/styles.css`

## Apply

```bash
git add backend/db.js backend/server.js frontend/src/App.jsx frontend/src/components/PresenceNotificationsDropdown.jsx frontend/src/components/Notifications.jsx frontend/src/styles.css
git commit -m "Add presence notifications dropdown and online toggle"
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
