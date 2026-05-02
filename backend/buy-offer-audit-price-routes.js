/*
  VelkTrade Buy Offer Inbox + Audit Logs + Price History routes.

  Roadmap order currently in progress:
  Toasts → Item Lock → Buy Offer Inbox → Audit Logs → Price History → ...
*/

const { get, all, run } = require('./db');

function installBuyOfferAuditPriceRoutes({ app, authMiddleware }) {
  if (!app || app.__velktradeBuyOfferAuditPriceRoutesInstalled) return;
  app.__velktradeBuyOfferAuditPriceRoutesInstalled = true;

  const auth = authMiddleware || ((_req, _res, next) => next());

  function userId(req) {
    return Number(req.user?.id || req.userId || req.session?.user?.id || req.session?.userId || 0);
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

  function validId(value) {
    return /^\d+$/.test(String(value || '').trim());
  }

  function itemOwnerId(item) {
    return item?.userId ?? item?.userid ?? item?.user_id ?? item?.ownerId ?? item?.owner_id ?? null;
  }

  function ownsItem(req, item) {
    const owner = Number(itemOwnerId(item));
    return Boolean(owner && owner === userId(req));
  }

  async function ensureTables() {
    await run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        target_type TEXT DEFAULT '',
        target_id TEXT DEFAULT '',
        metadata TEXT DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS item_price_history (
        id SERIAL PRIMARY KEY,
        item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
        old_price TEXT DEFAULT '',
        new_price TEXT DEFAULT '',
        changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await run(`ALTER TABLE buy_requests ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'`).catch(() => {});
    await run(`ALTER TABLE buy_requests ADD COLUMN IF NOT EXISTS offered_ic TEXT DEFAULT ''`).catch(() => {});
    await run(`ALTER TABLE buy_requests ADD COLUMN IF NOT EXISTS message TEXT DEFAULT ''`).catch(() => {});
    await run(`ALTER TABLE buy_requests ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ`).catch(() => {});
    await run(`ALTER TABLE items ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT FALSE`).catch(() => {});
    await run(`ALTER TABLE items ADD COLUMN IF NOT EXISTS lock_reason TEXT`).catch(() => {});
    await run(`ALTER TABLE items ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ`).catch(() => {});
    await run(`ALTER TABLE items ADD COLUMN IF NOT EXISTS locked_by INTEGER`).catch(() => {});
  }

  async function audit(req, action, targetType, targetId, metadata = {}) {
    try {
      await ensureTables();
      await run(
        `INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata) VALUES (?, ?, ?, ?, ?)`,
        [userId(req) || null, action, targetType || '', String(targetId || ''), JSON.stringify(metadata || {})]
      );
    } catch (error) {
      console.error('audit log failed:', error);
    }
  }

  async function notify(userIdValue, type, title, message, payload = {}) {
    try {
      if (!userIdValue) return;
      await run(`INSERT INTO notifications (user_id, type, title, message, payload) VALUES (?, ?, ?, ?, ?)`, [userIdValue, type, title, message, JSON.stringify(payload || {})]);
    } catch (error) {
      console.error('notification insert failed:', error);
    }
  }

  async function loadRequest(id) {
    return get(`
      SELECT br.*, br.item_id AS "itemId", br.requester_id AS "requesterId", br.owner_id AS "ownerId",
        requester.username AS "requesterUsername", owner.username AS "ownerUsername",
        i.title AS "itemTitle", i.image AS "itemImage", i.price AS "itemPrice", i.userId AS "itemOwnerId"
      FROM buy_requests br
      JOIN items i ON i.id = br.item_id
      JOIN users requester ON requester.id = br.requester_id
      JOIN users owner ON owner.id = br.owner_id
      WHERE br.id = ?
    `, [id]);
  }

  async function listInbox(req, res) {
    try {
      await ensureTables();
      const uid = userId(req);
      const rows = await all(`
        SELECT br.id, br.item_id AS "itemId", br.requester_id AS "requesterId", br.owner_id AS "ownerId", br.status,
          br.offered_ic AS "offeredIc", br.message, br.created_at AS "createdAt", br.responded_at AS "respondedAt",
          requester.username AS "requesterUsername", requester.is_verified AS "requesterVerified",
          owner.username AS "ownerUsername", owner.is_verified AS "ownerVerified",
          i.title AS "itemTitle", i.image AS "itemImage", i.price AS "itemPrice", i.locked, i.trade_pending AS "tradePending"
        FROM buy_requests br
        JOIN items i ON i.id = br.item_id
        JOIN users requester ON requester.id = br.requester_id
        JOIN users owner ON owner.id = br.owner_id
        WHERE br.requester_id = ? OR br.owner_id = ?
        ORDER BY br.created_at DESC
        LIMIT 200
      `, [uid, uid]);
      res.json({ ok: true, offers: rows, buyOffers: rows, buyRequests: rows });
    } catch (error) {
      console.error('buy offer inbox failed:', error);
      res.status(500).json({ error: error.message || 'Failed to load buy offers' });
    }
  }

  async function createOffer(req, res) {
    try {
      await ensureTables();
      const uid = userId(req);
      const itemId = req.params.itemId || req.body?.itemId;
      if (!uid) return res.status(401).json({ error: 'Not authenticated' });
      if (!validId(itemId)) return res.status(400).json({ error: 'Invalid item id' });
      const item = await get('SELECT * FROM items WHERE id = ?', [Number(itemId)]);
      if (!item) return res.status(404).json({ error: 'Item not found' });
      const owner = Number(itemOwnerId(item));
      if (owner === uid) return res.status(400).json({ error: 'Cannot make a buy offer on your own item' });
      if (item.locked || item.trade_pending) return res.status(400).json({ error: 'Item is locked or trade pending' });
      const offeredIc = String(req.body?.offeredIc || req.body?.ic || req.body?.price || item.price || '').slice(0, 80);
      const message = String(req.body?.message || '').slice(0, 500);
      await run(`
        INSERT INTO buy_requests (item_id, requester_id, owner_id, status, offered_ic, message)
        VALUES (?, ?, ?, 'pending', ?, ?)
        ON CONFLICT (item_id, requester_id)
        DO UPDATE SET status = 'pending', offered_ic = EXCLUDED.offered_ic, message = EXCLUDED.message, created_at = NOW(), responded_at = NULL
      `, [Number(itemId), uid, owner, offeredIc, message]);
      await notify(owner, 'buy_offer', 'New buy offer', 'A player made a buy offer on one of your items.', { itemId: Number(itemId), requesterId: uid, offeredIc });
      await audit(req, 'buy_offer.created', 'item', itemId, { offeredIc, message });
      res.json({ ok: true, itemId: Number(itemId), status: 'pending' });
    } catch (error) {
      console.error('create buy offer failed:', error);
      res.status(500).json({ error: error.message || 'Failed to create buy offer' });
    }
  }

  async function declineOffer(req, res) {
    try {
      await ensureTables();
      const id = req.params.offerId || req.params.id;
      if (!validId(id)) return res.status(400).json({ error: 'Invalid offer id' });
      const offer = await loadRequest(Number(id));
      if (!offer) return res.status(404).json({ error: 'Offer not found' });
      if (Number(offer.ownerId) !== userId(req) && Number(offer.requesterId) !== userId(req) && !isAdminOrDeveloper(req)) return res.status(403).json({ error: 'Not allowed' });
      await run(`UPDATE buy_requests SET status = 'declined', responded_at = NOW() WHERE id = ?`, [Number(id)]);
      await notify(offer.requesterId, 'buy_offer_declined', 'Buy offer declined', 'Your buy offer was declined.', { offerId: Number(id), itemId: offer.itemId });
      await audit(req, 'buy_offer.declined', 'buy_request', id, { itemId: offer.itemId });
      res.json({ ok: true, offerId: Number(id), status: 'declined' });
    } catch (error) {
      console.error('decline buy offer failed:', error);
      res.status(500).json({ error: error.message || 'Failed to decline offer' });
    }
  }

  async function counterOffer(req, res) {
    try {
      await ensureTables();
      const id = req.params.offerId || req.params.id;
      if (!validId(id)) return res.status(400).json({ error: 'Invalid offer id' });
      const offer = await loadRequest(Number(id));
      if (!offer) return res.status(404).json({ error: 'Offer not found' });
      if (Number(offer.ownerId) !== userId(req) && !isAdminOrDeveloper(req)) return res.status(403).json({ error: 'Only the owner can counter this offer' });
      const offeredIc = String(req.body?.offeredIc || req.body?.ic || '').slice(0, 80);
      const message = String(req.body?.message || '').slice(0, 500);
      await run(`UPDATE buy_requests SET status = 'countered', offered_ic = ?, message = ?, responded_at = NOW() WHERE id = ?`, [offeredIc, message, Number(id)]);
      await notify(offer.requesterId, 'buy_offer_countered', 'Buy offer countered', 'The seller countered your buy offer.', { offerId: Number(id), itemId: offer.itemId, offeredIc });
      await audit(req, 'buy_offer.countered', 'buy_request', id, { itemId: offer.itemId, offeredIc, message });
      res.json({ ok: true, offerId: Number(id), status: 'countered', offeredIc, message });
    } catch (error) {
      console.error('counter buy offer failed:', error);
      res.status(500).json({ error: error.message || 'Failed to counter offer' });
    }
  }

  async function acceptOffer(req, res) {
    try {
      await ensureTables();
      const id = req.params.offerId || req.params.id;
      if (!validId(id)) return res.status(400).json({ error: 'Invalid offer id' });
      const offer = await loadRequest(Number(id));
      if (!offer) return res.status(404).json({ error: 'Offer not found' });
      if (Number(offer.ownerId) !== userId(req) && !isAdminOrDeveloper(req)) return res.status(403).json({ error: 'Only the owner can accept this offer' });
      const roomId = `offline-buy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const offeredIc = String(offer.offered_ic || offer.offeredIc || offer.itemPrice || '').trim();
      const chatHistory = [{ id: `${Date.now()}-buy-offer-accepted`, userId: userId(req), username: req.user?.username || 'Seller', message: `Accepted buy offer #${id}${offeredIc ? ` for ${offeredIc}` : ''}`, createdAt: new Date().toISOString() }, { type: 'trade-meta', message: JSON.stringify({ icOffers: { [offer.requesterId]: offeredIc } }) }];
      const trade = await run(`INSERT INTO trades (roomId, fromUser, toUser, fromItems, toItems, chatHistory, status) VALUES (?, ?, ?, ?, ?, ?, 'accepted') RETURNING id`, [roomId, offer.requesterId, offer.ownerId, '[]', JSON.stringify([Number(offer.itemId)]), JSON.stringify(chatHistory)]);
      const tradeId = trade.rows?.[0]?.id || trade.lastID;
      await run(`UPDATE buy_requests SET status = 'accepted', responded_at = NOW() WHERE id = ?`, [Number(id)]);
      await run(`UPDATE items SET locked = TRUE, lock_reason = 'buy_offer_accepted', locked_at = NOW(), locked_by = ? WHERE id = ?`, [userId(req), Number(offer.itemId)]).catch(() => {});
      await notify(offer.requesterId, 'buy_offer_accepted', 'Buy offer accepted', 'The seller accepted your buy offer. Confirm the trade to complete it.', { offerId: Number(id), tradeId, itemId: offer.itemId });
      await audit(req, 'buy_offer.accepted', 'buy_request', id, { itemId: offer.itemId, tradeId, offeredIc });
      res.json({ ok: true, offerId: Number(id), tradeId, roomId, status: 'accepted' });
    } catch (error) {
      console.error('accept buy offer failed:', error);
      res.status(500).json({ error: error.message || 'Failed to accept offer' });
    }
  }

  async function listAudit(req, res) {
    try {
      if (!isAdminOrDeveloper(req)) return res.status(403).json({ error: 'Not allowed' });
      await ensureTables();
      const rows = await all(`SELECT al.*, u.username AS "actorUsername" FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_id ORDER BY al.created_at DESC LIMIT 250`);
      res.json({ ok: true, auditLogs: rows, logs: rows });
    } catch (error) {
      console.error('audit list failed:', error);
      res.status(500).json({ error: error.message || 'Failed to load audit logs' });
    }
  }

  async function saveClientAudit(req, res) {
    try {
      await ensureTables();
      const events = Array.isArray(req.body?.events) ? req.body.events.slice(0, 25) : [];
      for (const event of events) {
        const action = String(event?.type || event?.action || 'client.event').slice(0, 120);
        const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {};
        const targetType = String(payload.targetType || payload.target_type || payload.itemId ? 'item' : 'client').slice(0, 80);
        const targetId = String(payload.targetId || payload.target_id || payload.itemId || payload.offerId || payload.tradeId || '').slice(0, 80);
        await run(`INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata) VALUES (?, ?, ?, ?, ?)`, [userId(req) || null, action, targetType, targetId, JSON.stringify({ ...payload, clientCreatedAt: event?.createdAt || null })]);
      }
      res.json({ ok: true, saved: events.length });
    } catch (error) {
      console.error('client audit save failed:', error);
      res.status(500).json({ error: error.message || 'Failed to save client audit events' });
    }
  }

  async function listPriceHistory(req, res) {
    try {
      await ensureTables();
      const itemId = req.params.itemId || req.params.id;
      if (!validId(itemId)) return res.status(400).json({ error: 'Invalid item id' });
      const item = await get('SELECT * FROM items WHERE id = ?', [Number(itemId)]);
      if (!item) return res.status(404).json({ error: 'Item not found' });
      if (!ownsItem(req, item) && !isAdminOrDeveloper(req)) return res.status(403).json({ error: 'Not allowed' });
      const rows = await all(`SELECT iph.*, u.username AS "changedByUsername" FROM item_price_history iph LEFT JOIN users u ON u.id = iph.changed_by WHERE iph.item_id = ? ORDER BY iph.created_at DESC LIMIT 100`, [Number(itemId)]);
      res.json({ ok: true, itemId: Number(itemId), history: rows, priceHistory: rows });
    } catch (error) {
      console.error('price history list failed:', error);
      res.status(500).json({ error: error.message || 'Failed to load price history' });
    }
  }

  async function updatePrice(req, res) {
    try {
      await ensureTables();
      const itemId = req.params.itemId || req.params.id;
      if (!validId(itemId)) return res.status(400).json({ error: 'Invalid item id' });
      const item = await get('SELECT * FROM items WHERE id = ?', [Number(itemId)]);
      if (!item) return res.status(404).json({ error: 'Item not found' });
      if (!ownsItem(req, item)) return res.status(403).json({ error: 'Only the item owner can edit price' });
      if (item.locked || item.trade_pending) return res.status(400).json({ error: 'Item is locked' });
      const oldPrice = String(item.price || '');
      const newPrice = String(req.body?.price || '').slice(0, 80);
      await run('UPDATE items SET price = ? WHERE id = ?', [newPrice, Number(itemId)]);
      await run('INSERT INTO item_price_history (item_id, old_price, new_price, changed_by) VALUES (?, ?, ?, ?)', [Number(itemId), oldPrice, newPrice, userId(req) || null]);
      await audit(req, 'item.price_updated', 'item', itemId, { oldPrice, newPrice });
      res.json({ ok: true, itemId: Number(itemId), oldPrice, price: newPrice });
    } catch (error) {
      console.error('price update failed:', error);
      res.status(500).json({ error: error.message || 'Failed to update price' });
    }
  }

  app.get('/api/buy-offers/inbox', auth, listInbox);
  app.get('/api/buy-requests/inbox', auth, listInbox);
  app.get('/api/buy-offers', auth, listInbox);
  app.post('/api/items/:itemId/buy-offer', auth, createOffer);
  app.post('/api/items/:itemId/buy-request', auth, createOffer);
  app.post('/api/buy-offers/:offerId/accept', auth, acceptOffer);
  app.post('/api/buy-offers/:offerId/decline', auth, declineOffer);
  app.post('/api/buy-offers/:offerId/counter', auth, counterOffer);
  app.post('/api/buy-requests/:offerId/accept', auth, acceptOffer);
  app.post('/api/buy-requests/:offerId/decline', auth, declineOffer);
  app.post('/api/buy-requests/:offerId/counter', auth, counterOffer);
  app.get('/api/audit-logs', auth, listAudit);
  app.get('/api/admin/audit-logs', auth, listAudit);
  app.post('/api/audit-logs/client', auth, saveClientAudit);
  app.get('/api/items/:itemId/price-history', auth, listPriceHistory);
  app.get('/api/price-history/items/:itemId', auth, listPriceHistory);
  app.put('/api/items/:itemId/price', auth, updatePrice);
  app.patch('/api/items/:itemId/price', auth, updatePrice);
  app.post('/api/items/:itemId/price', auth, updatePrice);
}

module.exports = installBuyOfferAuditPriceRoutes;
