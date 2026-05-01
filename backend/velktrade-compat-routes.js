
/*
VelkTrade compatibility routes for popup item actions and online toggle.

Install once in backend/server.js AFTER app/authMiddleware/db helpers are available:

const installVelkTradeCompatRoutes = require('./velktrade-compat-routes');
installVelkTradeCompatRoutes({ app, authMiddleware, pool, query, run, get });

Then redeploy Render.
*/

function installVelkTradeCompatRoutes({ app, authMiddleware, pool, query, run, get }) {
  if (!app || app.__velktradeCompatRoutesInstalled) return;
  app.__velktradeCompatRoutesInstalled = true;

  const auth = authMiddleware || ((req, _res, next) => next());

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

  function isAdmin(req) {
    return Boolean(
      req.user?.isAdmin ||
      req.user?.is_admin ||
      req.user?.isDeveloper ||
      req.user?.is_developer ||
      req.user?.role === 'admin' ||
      req.user?.role === 'developer'
    );
  }

  async function ensureColumns() {
    try { await q('ALTER TABLE users ADD COLUMN IF NOT EXISTS show_online BOOLEAN DEFAULT TRUE'); } catch {}
    try { await q('ALTER TABLE items ADD COLUMN IF NOT EXISTS trade_pending BOOLEAN DEFAULT FALSE'); } catch {}
  }

  async function resolveItem(req) {
    const directId = req.params.itemId || req.params.id || req.body?.itemId || req.body?.id;
    if (directId) {
      const item = await one('SELECT * FROM items WHERE id = $1', [directId]).catch(() => null);
      return item || { id: directId };
    }

    const title = String(req.body?.title || '').trim();
    const image = String(req.body?.image || '').trim();
    const price = String(req.body?.price || '').trim();

    if (!title && !image && !price) return null;

    let item = null;

    if (image) {
      item = await one('SELECT * FROM items WHERE image = $1 ORDER BY id DESC LIMIT 1', [image]).catch(() => null);
      if (item) return item;
    }

    if (title) {
      item = await one('SELECT * FROM items WHERE title = $1 ORDER BY id DESC LIMIT 1', [title]).catch(() => null);
      if (item) return item;
    }

    if (image) {
      item = await one('SELECT * FROM items WHERE image ILIKE $1 ORDER BY id DESC LIMIT 1', [`%${image.split('/').pop()}%`]).catch(() => null);
      if (item) return item;
    }

    return null;
  }

  function ownsItem(req, item) {
    const userId = String(currentUserId(req) || '');
    const ownerId = String(item?.user_id ?? item?.userid ?? item?.userId ?? item?.owner_id ?? item?.ownerId ?? '');
    return Boolean(userId && ownerId && userId === ownerId);
  }

  async function online(req, res) {
    try {
      const userId = currentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });

      const raw = req.body?.showOnline ?? req.body?.show_online ?? req.body?.online ?? req.body?.enabled;
      const showOnline = raw === true || raw === 'true' || raw === 1 || raw === '1';

      await ensureColumns();
      await q('UPDATE users SET show_online = $1 WHERE id = $2', [showOnline, userId]).catch(() => {});

      res.json({ ok: true, showOnline, show_online: showOnline, online: showOnline });
    } catch (error) {
      console.error('compat online failed:', error);
      res.status(500).json({ error: error.message || 'Failed to update online visibility' });
    }
  }

  async function resolve(req, res) {
    const item = await resolveItem(req);
    res.json({ id: item?.id || '', itemId: item?.id || '', item: item || null });
  }

  async function updatePrice(req, res) {
    try {
      const item = await resolveItem(req);
      if (!item?.id) return res.status(404).json({ error: 'Item not found' });

      if (!isAdmin(req) && !ownsItem(req, item)) {
        return res.status(403).json({ error: 'Not allowed' });
      }

      await q('UPDATE items SET price = $1 WHERE id = $2', [req.body?.price || '', item.id]);
      res.json({ ok: true, itemId: item.id, price: req.body?.price || '' });
    } catch (error) {
      console.error('compat update price failed:', error);
      res.status(500).json({ error: error.message || 'Failed to update price' });
    }
  }

  async function addInterest(req, res) {
    try {
      const userId = currentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });

      const item = await resolveItem(req);
      if (!item?.id) return res.status(404).json({ error: 'Item not found' });

      if (ownsItem(req, item)) return res.status(400).json({ error: 'Cannot mark interest in your own item' });
      if (item.trade_pending) return res.status(400).json({ error: 'Item is trade pending' });

      await q(
        'INSERT INTO buy_requests (item_id, buyer_id, owner_id, created_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING',
        [item.id, userId, item.user_id || item.userid || item.userId || item.owner_id || item.ownerId || null]
      ).catch(async () => {
        await q(
          'INSERT INTO buy_requests (item_id, buyer_id, created_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING',
          [item.id, userId]
        ).catch(() => {});
      });

      res.json({ ok: true, itemId: item.id, interested: true });
    } catch (error) {
      console.error('compat add interest failed:', error);
      res.status(500).json({ error: error.message || 'Failed to add interest' });
    }
  }

  async function removeInterest(req, res) {
    try {
      const userId = currentUserId(req);
      const item = await resolveItem(req);
      if (item?.id && userId) {
        await q('DELETE FROM buy_requests WHERE item_id = $1 AND buyer_id = $2', [item.id, userId]).catch(() => {});
      }
      res.json({ ok: true, itemId: item?.id || '', interested: false });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Failed to remove interest' });
    }
  }

  async function getInterest(req, res) {
    try {
      const item = await resolveItem(req);
      if (!item?.id) return res.json({ users: [] });

      if (!isAdmin(req) && !ownsItem(req, item)) return res.status(403).json({ error: 'Not allowed' });

      const result = await q(
        'SELECT u.id, u.username, u.is_verified FROM buy_requests br JOIN users u ON u.id = br.buyer_id WHERE br.item_id = $1',
        [item.id]
      ).catch(() => ({ rows: [] }));

      res.json({ users: result?.rows || [] });
    } catch {
      res.json({ users: [] });
    }
  }

  async function instantTrade(req, res) {
    try {
      const item = await resolveItem(req);
      if (!item?.id) return res.status(404).json({ error: 'Item not found' });

      if (!isAdmin(req) && !ownsItem(req, item)) {
        return res.status(403).json({ error: 'Not allowed' });
      }

      await ensureColumns();
      await q('UPDATE items SET trade_pending = TRUE WHERE id = $1', [item.id]).catch(() => {});
      await q('DELETE FROM buy_requests WHERE item_id = $1', [item.id]).catch(() => {});

      res.json({ ok: true, itemId: item.id, tradePending: true, status: 'seller_pending_confirm' });
    } catch (error) {
      console.error('compat instant trade failed:', error);
      res.status(500).json({ error: error.message || 'Failed to mark trade pending' });
    }
  }

  async function removeItem(req, res) {
    try {
      const item = await resolveItem(req);
      if (!item?.id) return res.status(404).json({ error: 'Item not found' });

      if (!isAdmin(req) && !ownsItem(req, item)) {
        return res.status(403).json({ error: 'Not allowed' });
      }

      await ensureColumns();
      await q('UPDATE items SET price = NULL, trade_pending = TRUE WHERE id = $1', [item.id]).catch(() => {});
      res.json({ ok: true, itemId: item.id, removed: true });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Failed to remove item/listing' });
    }
  }

  for (const method of ['put', 'post', 'patch']) {
    app[method]('/api/me/online', auth, online);
    app[method]('/api/profile/online', auth, online);
    app[method]('/api/users/me/online', auth, online);
    app[method]('/api/inventory/online', auth, online);
  }

  app.post('/api/items/resolve', auth, resolve);
  app.put('/api/items/:itemId/price', auth, updatePrice);
  app.patch('/api/items/:itemId/price', auth, updatePrice);
  app.post('/api/items/:itemId/price', auth, updatePrice);
  app.delete('/api/items/:itemId', auth, removeItem);
  app.post('/api/items/:itemId/remove', auth, removeItem);
  app.get('/api/items/:itemId/interest', auth, getInterest);
  app.post('/api/items/:itemId/interest', auth, addInterest);
  app.delete('/api/items/:itemId/interest', auth, removeInterest);
  app.post('/api/items/:itemId/instant-trade', auth, instantTrade);
  app.post('/api/bazaar/items/:itemId/instant-trade', auth, instantTrade);
  app.post('/api/bazaar/items/:itemId/trade-pending', auth, instantTrade);
}

module.exports = installVelkTradeCompatRoutes;
