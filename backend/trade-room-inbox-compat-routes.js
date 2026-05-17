/*
  Trade room / inbox compatibility routes.

  The frontend currently polls several historical endpoint names for trade rooms,
  offline offers, buy offers, and room invitations. Render was returning 404 for
  those paths, creating console spam and repeated failed notification polling.

  These routes normalize all those aliases to stable JSON responses. When the
  database has compatible tables, the route returns real data; when a feature has
  no backing table yet, it returns an empty collection instead of 404.
*/

const { all, get, run } = require('./db');

function installTradeRoomInboxCompatRoutes({ app, authMiddleware }) {
  if (!app || app.__velktradeTradeRoomInboxCompatRoutesInstalled) return;
  app.__velktradeTradeRoomInboxCompatRoutesInstalled = true;

  const auth = authMiddleware || ((_req, _res, next) => next());

  function userId(req) {
    return Number(req.user?.id || req.userId || req.session?.user?.id || req.session?.userId || 0);
  }

  function username(req) {
    return String(req.user?.username || req.session?.user?.username || '').trim();
  }

  function emptyInbox(extra = {}) {
    return {
      ok: true,
      count: 0,
      items: [],
      offers: [],
      trades: [],
      invitations: [],
      invites: [],
      buyOffers: [],
      buy_offers: [],
      requests: [],
      ...extra
    };
  }

  async function ensureCompatTables() {
    await run(`
      CREATE TABLE IF NOT EXISTS room_invites (
        id SERIAL PRIMARY KEY,
        room_id TEXT,
        from_user_id INTEGER,
        to_user_id INTEGER,
        status TEXT DEFAULT 'pending',
        message TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch(() => {});

    await run(`
      CREATE TABLE IF NOT EXISTS offline_trade_offers (
        id SERIAL PRIMARY KEY,
        from_user_id INTEGER,
        to_user_id INTEGER,
        status TEXT DEFAULT 'pending',
        message TEXT DEFAULT '',
        payload TEXT DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch(() => {});
  }

  function normalizeRow(row = {}) {
    return {
      ...row,
      id: row.id,
      status: row.status || 'pending',
      createdAt: row.createdAt || row.created_at || row.created || null,
      updatedAt: row.updatedAt || row.updated_at || row.updated || null,
      fromUserId: row.fromUserId || row.from_user_id || row.sender_id || row.buyer_id || null,
      toUserId: row.toUserId || row.to_user_id || row.recipient_id || row.seller_id || row.owner_id || null,
      fromUsername: row.fromUsername || row.from_username || row.sender_username || row.buyer_username || row.buyer || null,
      toUsername: row.toUsername || row.to_username || row.recipient_username || row.seller_username || row.owner_username || row.owner || null,
      itemId: row.itemId || row.item_id || null,
      itemTitle: row.itemTitle || row.item_title || row.title || row.name || null,
      itemImage: row.itemImage || row.item_image || row.image || row.image_url || null,
      listedPrice: row.listedPrice || row.listed_price || row.price || null,
      offeredPrice: row.offeredPrice || row.offered_price || row.offer_price || row.amount || null
    };
  }

  async function buyOffersInbox(req, res) {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const rows = await all(`
        SELECT
          br.*,
          br.created_at AS "createdAt",
          i.id AS "itemId",
          i.title AS "itemTitle",
          i.name AS "itemName",
          i.image AS "itemImage",
          i.image_url AS "itemImageUrl",
          i.price AS "listedPrice",
          u.username AS "buyerUsername",
          owner.username AS "sellerUsername"
        FROM buy_requests br
        LEFT JOIN items i ON i.id = br.item_id
        LEFT JOIN users u ON u.id = br.buyer_id
        LEFT JOIN users owner ON owner.id = COALESCE(i.user_id, i.owner_id)
        WHERE br.buyer_id = ? OR i.user_id = ? OR i.owner_id = ?
        ORDER BY br.created_at DESC
        LIMIT 100
      `, [uid, uid, uid]);

      const buyOffers = rows.map(row => normalizeRow({
        ...row,
        buyer_username: row.buyerUsername,
        seller_username: row.sellerUsername,
        item_title: row.itemTitle || row.itemName,
        item_image: row.itemImage || row.itemImageUrl,
        listed_price: row.listedPrice
      }));
      res.json({ ...emptyInbox(), count: buyOffers.length, items: buyOffers, offers: buyOffers, buyOffers, buy_offers: buyOffers });
    } catch (error) {
      res.json(emptyInbox({ warning: 'buy_requests table unavailable', detail: error.message }));
    }
  }

  async function tradeOffersInbox(req, res) {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ error: 'Not authenticated' });

    try {
      await ensureCompatTables();
      const rows = await all(`
        SELECT
          o.*,
          o.created_at AS "createdAt",
          sender.username AS "fromUsername",
          recipient.username AS "toUsername"
        FROM offline_trade_offers o
        LEFT JOIN users sender ON sender.id = o.from_user_id
        LEFT JOIN users recipient ON recipient.id = o.to_user_id
        WHERE o.from_user_id = ? OR o.to_user_id = ?
        ORDER BY o.created_at DESC
        LIMIT 100
      `, [uid, uid]);
      const offers = rows.map(normalizeRow);
      res.json({ ...emptyInbox(), count: offers.length, items: offers, offers, trades: offers });
    } catch (error) {
      res.json(emptyInbox({ warning: 'offline_trade_offers unavailable', detail: error.message }));
    }
  }

  async function roomInvitesInbox(req, res) {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ error: 'Not authenticated' });

    try {
      await ensureCompatTables();
      const rows = await all(`
        SELECT
          ri.*,
          ri.room_id AS "roomId",
          ri.created_at AS "createdAt",
          sender.username AS "fromUsername",
          recipient.username AS "toUsername"
        FROM room_invites ri
        LEFT JOIN users sender ON sender.id = ri.from_user_id
        LEFT JOIN users recipient ON recipient.id = ri.to_user_id
        WHERE ri.from_user_id = ? OR ri.to_user_id = ?
        ORDER BY ri.created_at DESC
        LIMIT 100
      `, [uid, uid]);
      const invites = rows.map(normalizeRow);
      res.json({ ...emptyInbox(), count: invites.length, items: invites, invites, invitations: invites });
    } catch (error) {
      res.json(emptyInbox({ warning: 'room_invites unavailable', detail: error.message }));
    }
  }

  async function combinedInbox(req, res) {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ error: 'Not authenticated' });

    let buyOffers = [];
    let tradeOffers = [];
    let invites = [];

    try {
      const rows = await all(`
        SELECT br.*, br.created_at AS "createdAt", i.id AS "itemId", i.title AS "itemTitle", i.name AS "itemName", i.image AS "itemImage", i.image_url AS "itemImageUrl", i.price AS "listedPrice", u.username AS "buyerUsername"
        FROM buy_requests br
        LEFT JOIN items i ON i.id = br.item_id
        LEFT JOIN users u ON u.id = br.buyer_id
        WHERE br.buyer_id = ? OR i.user_id = ? OR i.owner_id = ?
        ORDER BY br.created_at DESC
        LIMIT 100
      `, [uid, uid, uid]);
      buyOffers = rows.map(row => normalizeRow({ ...row, buyer_username: row.buyerUsername, item_title: row.itemTitle || row.itemName, item_image: row.itemImage || row.itemImageUrl, listed_price: row.listedPrice }));
    } catch {}

    try {
      await ensureCompatTables();
      const rows = await all(`SELECT * FROM offline_trade_offers WHERE from_user_id = ? OR to_user_id = ? ORDER BY created_at DESC LIMIT 100`, [uid, uid]);
      tradeOffers = rows.map(normalizeRow);
    } catch {}

    try {
      await ensureCompatTables();
      const rows = await all(`SELECT * FROM room_invites WHERE from_user_id = ? OR to_user_id = ? ORDER BY created_at DESC LIMIT 100`, [uid, uid]);
      invites = rows.map(normalizeRow);
    } catch {}

    const items = [...buyOffers, ...tradeOffers, ...invites];
    res.json({
      ...emptyInbox(),
      count: items.length,
      items,
      offers: tradeOffers,
      trades: tradeOffers,
      buyOffers,
      buy_offers: buyOffers,
      invites,
      invitations: invites
    });
  }

  async function createRoomInvite(req, res) {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ error: 'Not authenticated' });

    try {
      await ensureCompatTables();
      const roomId = String(req.body?.roomId || req.body?.room_id || req.body?.code || '').trim();
      const toUserId = Number(req.body?.toUserId || req.body?.to_user_id || req.body?.recipientId || req.body?.recipient_id || 0) || null;
      const message = String(req.body?.message || '').slice(0, 1000);
      const result = await run(
        `INSERT INTO room_invites (room_id, from_user_id, to_user_id, message, status, updated_at) VALUES (?, ?, ?, ?, 'pending', NOW()) RETURNING id`,
        [roomId, uid, toUserId, message]
      );
      res.json({ ok: true, invite: { id: result.rows?.[0]?.id || result.lastID, roomId, fromUserId: uid, toUserId, message, status: 'pending', fromUsername: username(req) } });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Failed to create room invite' });
    }
  }

  async function markInvite(req, res) {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ error: 'Not authenticated' });
    const id = Number(req.params.id || req.body?.id || 0);
    const status = String(req.body?.status || req.body?.action || 'accepted').toLowerCase();
    const cleanStatus = ['accepted', 'declined', 'dismissed', 'read', 'pending'].includes(status) ? status : 'accepted';
    try {
      await ensureCompatTables();
      await run(`UPDATE room_invites SET status = ?, updated_at = NOW() WHERE id = ? AND (from_user_id = ? OR to_user_id = ?)`, [cleanStatus, id, uid, uid]);
      res.json({ ok: true, id, status: cleanStatus });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Failed to update invite' });
    }
  }

  app.get('/api/me/buy-offers', auth, buyOffersInbox);
  app.get('/api/buy-offers/inbox', auth, buyOffersInbox);
  app.get('/api/offers/inbox', auth, tradeOffersInbox);
  app.get('/api/trades/inbox', auth, combinedInbox);

  app.get('/api/room-invites', auth, roomInvitesInbox);
  app.get('/api/rooms/invites', auth, roomInvitesInbox);
  app.get('/api/invitations', auth, roomInvitesInbox);
  app.get('/api/me/invitations', auth, roomInvitesInbox);

  app.post('/api/room-invites', auth, createRoomInvite);
  app.post('/api/rooms/invites', auth, createRoomInvite);
  app.post('/api/invitations', auth, createRoomInvite);
  app.post('/api/me/invitations', auth, createRoomInvite);

  app.post('/api/room-invites/:id', auth, markInvite);
  app.patch('/api/room-invites/:id', auth, markInvite);
  app.post('/api/rooms/invites/:id', auth, markInvite);
  app.patch('/api/rooms/invites/:id', auth, markInvite);
  app.post('/api/invitations/:id', auth, markInvite);
  app.patch('/api/invitations/:id', auth, markInvite);
}

module.exports = installTradeRoomInboxCompatRoutes;
