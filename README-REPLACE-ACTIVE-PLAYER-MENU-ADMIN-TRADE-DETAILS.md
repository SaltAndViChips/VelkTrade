# VelkTrade replace active player menu + admin trade details patch

## Why this patch is different

Your screenshot proves the app is still rendering the old `SafeOnlinePlayersDropdown` path:

```html
safe-online-toggle
safe-online-panel
safe-online-card
```

So this patch replaces `SafeOnlinePlayersDropdown.jsx` itself with the new rewritten menu.

That means even if `App.jsx` still imports the old component name, the rendered UI changes.

## Player menu fixes

Replaces the currently active player menu with:

- compact top-right button
- Online / Notifications tabs
- role icon beside name:
  - `🖥️` Developer
  - `🛡️` Admin
  - `✓` Verified
- presence labels:
  - Online
  - In trade room
  - Viewing Bazaar
  - Away for Xm
- yellow dot for Away
- Profile button
- Invite button
- invite button is never disabled just because you are not already in a room
- self-fetches `/api/online-users` every 10 seconds
- merges socket-provided users with fetched users

## Admin trade detail fixes

The admin trade details now understand this trade shape:

```json
{
  "fromItemDetails": [],
  "toItemDetails": [],
  "chatHistory": [],
  "fromItems": [],
  "toItems": []
}
```

It displays:

- From user / To user
- Status
- From items
- To items
- From IC / To IC where fields exist
- Chat history
- Raw JSON only as a fallback/debug section, not instead of parsed details

Recognized IC fields include:

- `fromIc`
- `toIc`
- `fromIC`
- `toIC`
- `fromIcAmount`
- `toIcAmount`
- `fromICAmount`
- `toICAmount`
- `offerIc`
- `requestIc`
- `offeredIc`
- `requestedIc`

## Backend presence support

Also patches `/api/online-users` output when your backend source is available so users return:

- `isDeveloper`
- `isAdmin`
- `isVerified`
- `highestBadge`
- `status`
- `presence`

## Changed files

- `frontend/src/components/SafeOnlinePlayersDropdown.jsx`
- `frontend/src/components/PresenceHub.jsx`
- `frontend/src/components/AdminPanel.jsx`
- `frontend/src/styles.css`
- `backend/admin.js`
- `backend/server.js`

## Apply

```bash
git add frontend/src/components/SafeOnlinePlayersDropdown.jsx frontend/src/components/PresenceHub.jsx frontend/src/components/AdminPanel.jsx frontend/src/styles.css backend/admin.js backend/server.js
git commit -m "Replace active player menu and parse admin trade details"
git push
```

Deploy frontend:

```bash
cd frontend
npm run build
npm run deploy
```

Then redeploy Render backend.
