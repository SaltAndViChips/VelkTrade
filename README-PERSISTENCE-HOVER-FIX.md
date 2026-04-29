# VelkTrade persistence + inventory hover fix

## Fixes

1. Inventory items enlarge on hover.
2. SQLite database can persist across Render rebuilds/redeploys.
3. Added DATABASE_FILE to env example.

## Why accounts disappeared after rebuild/redeploy

Your app uses SQLite. If SQLite writes to `./db.sqlite` inside the deployed app folder, Render can replace that filesystem during rebuild/redeploy. That wipes users, inventories, and trades.

The fix is to attach a Render persistent disk and store SQLite under that disk, for example:

DATABASE_FILE=/var/data/db.sqlite

## Render setup

In Render:

1. Open backend web service.
2. Go to Disks.
3. Add disk.
4. Mount path:

/var/data

5. Add Environment Variable:

DATABASE_FILE=/var/data/db.sqlite

6. Keep JWT_SECRET unchanged forever. If JWT_SECRET changes, old login tokens become invalid.
7. Redeploy.

## Changed files

- backend/db.js
- backend/.env.example
- frontend/src/styles.css
