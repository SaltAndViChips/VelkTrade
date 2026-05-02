/*
  VelkTrade item lock routes.

  First implementation of the roadmap Item Lock step.

  Goals:
  - add persistent lock columns to items when possible
  - expose a read endpoint for locked items
  - expose admin/dev/owner compatible lock/unlock endpoints
  - keep the code safe if older DB schemas do not have these columns yet
*/

function installItemLockRoutes({ app, authMiddleware, pool, query, run, get }) {
  if (!app || app.__velktradeItemLockRoutesInstalled) return;
  app.__velktradeItemLockRoutesInstalled = true;

  const auth = authMiddleware || ((_req, _res, next) => next());

  async function q(sql, params = []) {
    if (pool?.query) return pool.query(sql, params);
    if (typeof query === 'function') return query(sql, params);
    if (typeof run === 'function') return run(sql, params);
    throw new Error('No database helper available');
  }

  async function one(sql, params = []) {
    if (typeof get === 'function') return get(sql, params);
    const result = await q(sql, params);
    if (Array.isArray(result?.rows)) return result.rows[0];
    if (Array.isArray(result)) return result[0];
    return result;
  }

  function currentUserId(req) {
    return req.user?.id || req.userId || req.session?.user?.id || req.session?.userId;
  }

  function username(req) {
    return String(req.user?.username || req.session?.user?.username || '').trim().toLowerCase();
  }

  function isAdminOrDeveloper(req) {
    const name = username(req);
    return Boolean(
      req.user?.isAdmin || req.user?.is_admin || req.user?.admin ||
      req.user?.isDeveloper || req.user?.is_developer || req.user?.developer ||
      req.user?.role === 'admin' || req.user?.role === 'developer' ||
      req.user?.rank === 'admin' || req.user?.rank === 'developer' ||
      name === 'salt' || name === 'velkon'
    );
  }

  function ownerId(item) {
    return item?.user_id ?? item?.userid ?? item?.userId ?? item?.owner_id ?? item?.ownerId ?? null;
  }

  function ownsItem(req, item) {
    const userId = String(currentUserId(req) || '');
    const itemOwnerId = String(ownerId(item) || '');
    return Boolean(userId && itemOwnerId && userId === itemOwnerId);
  }

  async function ensureColumns() {
    try { await q('ALTER TABLE items ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT FALSE'); } catch {}
    try { await q('ALTER TABLE items ADD COLUMN IF NOT EXISTS lock_reason TEXT'); } catch {}
    try { await q('ALTER TABLE items ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP'); } catch {}
    try { await q('ALTER TABLE items ADD COLUMN IF NOT EXISTS locked_by INTEGER'); } catch {}
    try { await q('ALTER TABLE items ADD COLUMN IF NOT EXISTS trade_pending BOOLEAN DEFAULT FALSE'); } catch {}
  }

  async function loadItem(itemId) {
    return one('SELECT * FROM items WHERE id = $1', [itemId]).catch(() => one('SELECT * FROM items WHERE id = ?', [itemId]));
  }

  function lockedFromItem(item) {
    return Boolean(item?.locked || item?.is_locked || item?.isLocked || item?.trade_pending || item?.tradePending);
  }

  async function listLockedItems(_req, res) {
    try {
      await ensureColumns();
      const result = await q(
        'SELECT id, locked, lock_reason, locked_at, locked_by, trade_pending FROM items WHERE COALESCE(locked, FALSE) = TRUE OR COALESCE(trade_pending, FALSE) = TRUE'
      ).catch(() => ({ rows: [] }));

      const rows = Array.isArray(result?.rows) ? result.rows : Array.isArray(result) ? result : [];
      res.json({
        ok: true,
        items: rows.map(row => ({
          itemId: row.id,
          id: row.id,
          locked: lockedFromItem(row),
          reason: row.lock_reason || (row.trade_pending ? 'trade_pending' : 'locked'),
          lockedAt: row.locked_at || null,
          lockedBy: row.locked_by || null
        }))
      });
    } catch (error) {
      console.error('list locked items failed:', error);
      res.status(500).json({ error: error.message || 'Failed to load locked items' });
    }
  }

  async function lockItem(req, res) {
    try {
      const itemId = req.params.itemId || req.params.id;
      if (!/^\d+$/.test(String(itemId || ''))) return res.status(400).json({ error: 'Invalid item id' });

      await ensureColumns();
      const item = await loadItem(itemId);
      if (!item) return res.status(404).json({ error: 'Item not found' });
      if (!ownsItem(req, item) && !isAdminOrDeveloper(req)) return res.status(403).json({ error: 'Not allowed' });

      const reason = String(req.body?.reason || req.body?.lockReason || 'manual').slice(0, 120);
      const userId = currentUserId(req) || null;

      await q(
        'UPDATE items SET locked = TRUE, lock_reason = $1, locked_at = NOW(), locked_by = $2 WHERE id = $3',
        [reason, userId, itemId]
      ).catch(() => q('UPDATE items SET trade_pending = TRUE WHERE id = ?', [itemId]));

      res.json({ ok: true, itemId: Number(itemId), locked: true, reason });
    } catch (error) {
      console.error('lock item failed:', error);
      res.status(500).json({ error: error.message || 'Failed to lock item' });
    }
  }

  async function unlockItem(req, res) {
    try {
      const itemId = req.params.itemId || req.params.id;
      if (!/^\d+$/.test(String(itemId || ''))) return res.status(400).json({ error: 'Invalid item id' });

      await ensureColumns();
      const item = await loadItem(itemId);
      if (!item) return res.status(404).json({ error: 'Item not found' });
      if (!ownsItem(req, item) && !isAdminOrDeveloper(req)) return res.status(403).json({ error: 'Not allowed' });

      await q(
        'UPDATE items SET locked = FALSE, lock_reason = NULL, locked_at = NULL, locked_by = NULL, trade_pending = FALSE WHERE id = $1',
        [itemId]
      ).catch(() => q('UPDATE items SET trade_pending = FALSE WHERE id = ?', [itemId]));

      res.json({ ok: true, itemId: Number(itemId), locked: false });
    } catch (error) {
      console.error('unlock item failed:', error);
      res.status(500).json({ error: error.message || 'Failed to unlock item' });
    }
  }

  app.get('/api/items/locks', auth, listLockedItems);
  app.get('/api/locked-items', auth, listLockedItems);

  app.post('/api/items/:itemId/lock', auth, lockItem);
  app.patch('/api/items/:itemId/lock', auth, lockItem);
  app.put('/api/items/:itemId/lock', auth, lockItem);

  app.post('/api/items/:itemId/unlock', auth, unlockItem);
  app.delete('/api/items/:itemId/lock', auth, unlockItem);
}

module.exports = installItemLockRoutes;
