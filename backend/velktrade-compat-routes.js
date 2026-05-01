
/*
Optional compatibility routes for item popup actions and online toggle.

Usage in backend/server.js, after app/authMiddleware/db helpers are defined:

const installVelkTradeCompatRoutes = require('./velktrade-compat-routes');
installVelkTradeCompatRoutes({ app, authMiddleware, pool, query, run, get });

This file prevents frontend NetworkError by ensuring these endpoints exist:
- /api/me/online
- /api/profile/online
- /api/users/me/online
- /api/inventory/online
- /api/items/:itemId/price
- /api/items/:itemId/interest
- /api/items/:itemId/instant-trade
*/

function installVelkTradeCompatRoutes({ app, authMiddleware, pool, query, run, get }) {
  const auth = authMiddleware || ((req, _res, next) => next());

  const q = async (sql, params = []) => {
    if (pool?.query) return pool.query(sql, params);
    if (typeof query === 'function') return query(sql, params);
    if (typeof run === 'function') return run(sql, params);
    throw new Error('No database helper available');
  };

  const currentUserId = req => req.user?.id || req.userId || req.session?.user?.id || req.session?.userId;

  async function online(req, res) {
    const userId = currentUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const value = req.body?.showOnline ?? req.body?.show_online ?? req.body?.online ?? req.body?.enabled;
    const showOnline = value === true || value === 'true' || value === 1 || value === '1';
    try {
      await q('ALTER TABLE users ADD COLUMN IF NOT EXISTS show_online BOOLEAN DEFAULT TRUE');
    } catch {}
    try {
      await q('UPDATE users SET show_online = $1 WHERE id = $2', [showOnline, userId]);
    } catch {}
    res.json({ ok: true, showOnline, show_online: showOnline, online: showOnline });
  }

  async function resolveItemId(req) {
    const itemId = req.params.itemId || req.params.id;
    if (itemId) return itemId;

    const title = String(req.body?.title || '').trim();
    const image = String(req.body?.image || '').trim();
    if (!title && !image) return '';

    const result = await q(
      `SELECT id FROM items
       WHERE ($1 = '' OR title = $1)
          OR ($2 = '' OR image = $2)
       ORDER BY id DESC
       LIMIT 1`,
      [title, image]
    );

    return result?.rows?.[0]?.id || '';
  }

  async function price(req, res) {
    const itemId = await resolveItemId(req);
    if (!itemId) return res.status(404).json({ error: 'Item not found' });
    await q('UPDATE items SET price = $1 WHERE id = $2', [req.body?.price || '', itemId]);
    res.json({ ok: true, itemId, price: req.body?.price || '' });
  }

  async function addInterest(req, res) {
    const userId = currentUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const itemId = await resolveItemId(req);
    if (!itemId) return res.status(404).json({ error: 'Item not found' });
    try {
      await q('INSERT INTO buy_requests (item_id, buyer_id, created_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING', [itemId, userId]);
    } catch {}
    res.json({ ok: true, itemId, interested: true });
  }

  async function removeInterest(req, res) {
    const userId = currentUserId(req);
    const itemId = await resolveItemId(req);
    if (itemId && userId) {
      try { await q('DELETE FROM buy_requests WHERE item_id = $1 AND buyer_id = $2', [itemId, userId]); } catch {}
    }
    res.json({ ok: true, itemId, interested: false });
  }

  async function getInterest(req, res) {
    const itemId = await resolveItemId(req);
    try {
      const result = await q(
        'SELECT u.id, u.username, u.is_verified FROM buy_requests br JOIN users u ON u.id = br.buyer_id WHERE br.item_id = $1',
        [itemId]
      );
      return res.json({ users: result?.rows || [] });
    } catch {
      return res.json({ users: [] });
    }
  }

  async function instantTrade(req, res) {
    const itemId = await resolveItemId(req);
    if (!itemId) return res.status(404).json({ error: 'Item not found' });
    try {
      await q('ALTER TABLE items ADD COLUMN IF NOT EXISTS trade_pending BOOLEAN DEFAULT FALSE');
      await q('UPDATE items SET trade_pending = TRUE WHERE id = $1', [itemId]);
    } catch {}
    res.json({ ok: true, itemId, tradePending: true, status: 'seller_pending_confirm' });
  }

  for (const method of ['put', 'post', 'patch']) {
    app[method]('/api/me/online', auth, online);
    app[method]('/api/profile/online', auth, online);
    app[method]('/api/users/me/online', auth, online);
    app[method]('/api/inventory/online', auth, online);
  }

  app.post('/api/items/resolve', auth, async (req, res) => {
    const id = await resolveItemId(req);
    res.json({ id, itemId: id });
  });

  app.put('/api/items/:itemId/price', auth, price);
  app.patch('/api/items/:itemId/price', auth, price);
  app.post('/api/items/:itemId/price', auth, price);
  app.get('/api/items/:itemId/interest', auth, getInterest);
  app.post('/api/items/:itemId/interest', auth, addInterest);
  app.delete('/api/items/:itemId/interest', auth, removeInterest);
  app.post('/api/items/:itemId/instant-trade', auth, instantTrade);
}

module.exports = installVelkTradeCompatRoutes;
