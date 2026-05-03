/*
VelkTrade compatibility routes for popup item actions, online toggle, and Bazaar auctions.

Install once in backend/server.js AFTER app/authMiddleware/db helpers are available:

const installVelkTradeCompatRoutes = require('./velktrade-compat-routes');
installVelkTradeCompatRoutes({ app, authMiddleware, pool, query, run, get });

Only pass helpers that actually exist in your server.js.
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

  async function many(sql, params = []) {
    const result = await q(sql, params);
    if (Array.isArray(result?.rows)) return result.rows;
    if (Array.isArray(result)) return result;
    return [];
  }

  function currentUserId(req) {
    return req.user?.id || req.userId || req.session?.user?.id || req.session?.userId;
  }

  function currentUsername(req) {
    return req.user?.username || req.user?.name || req.session?.user?.username || req.session?.user?.name || req.body?.currentUsername || '';
  }

  async function loadCurrentUser(req) {
    const userId = currentUserId(req);
    const username = currentUsername(req);

    if (userId) {
      const found = await one('SELECT * FROM users WHERE id = $1', [userId]).catch(() => null);
      if (found) return found;
    }

    if (username) {
      const found = await one('SELECT * FROM users WHERE lower(username) = lower($1)', [username]).catch(() => null);
      if (found) return found;
    }

    return req.user || req.session?.user || null;
  }

  async function isAdmin(req) {
    const user = await loadCurrentUser(req);
    const username = String(user?.username || currentUsername(req) || '').toLowerCase();

    return Boolean(
      user?.isAdmin || user?.is_admin || user?.admin ||
      user?.isDeveloper || user?.is_developer || user?.developer ||
      user?.role === 'admin' || user?.role === 'developer' ||
      user?.rank === 'admin' || user?.rank === 'developer' ||
      username === 'salt' || username === 'velkon'
    );
  }

  async function isVerifiedUser(req) {
    const user = await loadCurrentUser(req);
    const admin = await isAdmin(req);
    return Boolean(admin || user?.isVerified || user?.is_verified || user?.verified || user?.isTrusted || user?.is_trusted);
  }

  async function ensureColumns() {
    try { await q('ALTER TABLE users ADD COLUMN IF NOT EXISTS show_online BOOLEAN DEFAULT TRUE'); } catch {}
    try { await q('ALTER TABLE items ADD COLUMN IF NOT EXISTS trade_pending BOOLEAN DEFAULT FALSE'); } catch {}
  }

  async function ensureAuctionTables() {
    await q(`
      CREATE TABLE IF NOT EXISTS bazaar_auctions (
        id SERIAL PRIMARY KEY,
        item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
        seller_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        starting_bid INTEGER NOT NULL DEFAULT 0,
        buyout_price INTEGER,
        current_bid INTEGER NOT NULL DEFAULT 0,
        winner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'active',
        ends_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS bazaar_auction_bids (
        id SERIAL PRIMARY KEY,
        auction_id INTEGER REFERENCES bazaar_auctions(id) ON DELETE CASCADE,
        bidder_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    try { await q('ALTER TABLE bazaar_auctions ADD COLUMN IF NOT EXISTS buyout_price INTEGER'); } catch {}
    try { await q('ALTER TABLE bazaar_auctions ADD COLUMN IF NOT EXISTS current_bid INTEGER NOT NULL DEFAULT 0'); } catch {}
    try { await q('ALTER TABLE bazaar_auctions ADD COLUMN IF NOT EXISTS winner_id INTEGER REFERENCES users(id) ON DELETE SET NULL'); } catch {}
    try { await q('ALTER TABLE bazaar_auctions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT \'active\''); } catch {}
    try { await q('ALTER TABLE bazaar_auctions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()'); } catch {}
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
      const imageTail = image.split('/').pop();
      item = await one('SELECT * FROM items WHERE image ILIKE $1 ORDER BY id DESC LIMIT 1', [`%${imageTail}%`]).catch(() => null);
      if (item) return item;
    }

    return null;
  }

  function itemOwnerId(item) {
    return item?.user_id ?? item?.userid ?? item?.userId ?? item?.owner_id ?? item?.ownerId ?? null;
  }

  function ownsItem(req, item) {
    const userId = String(currentUserId(req) || '');
    const ownerId = String(itemOwnerId(item) || '');
    return Boolean(userId && ownerId && userId === ownerId);
  }

  function numberInput(value, fallback = 0) {
    const number = Number(String(value ?? '').replace(/[^\d.]/g, ''));
    return Number.isFinite(number) ? Math.floor(number) : fallback;
  }

  function publicAuction(row, req) {
    const currentId = Number(currentUserId(req) || 0);
    const sellerId = Number(row.seller_id || row.sellerId || 0);
    const isSeller = currentId && sellerId && currentId === sellerId;
    return {
      id: row.id,
      itemId: row.item_id || row.itemId,
      title: row.title || row.item_title || 'Item',
      image: row.image || '',
      sellerId: isSeller || row.viewer_can_see_seller ? sellerId : undefined,
      sellerUsername: isSeller || row.viewer_can_see_seller ? row.seller_username || row.sellerUsername : undefined,
      sellerVerified: Boolean(row.seller_verified || row.sellerVerified),
      startingBid: Number(row.starting_bid || row.startingBid || 0),
      buyoutPrice: row.buyout_price || row.buyoutPrice ? Number(row.buyout_price || row.buyoutPrice) : null,
      currentBid: Number(row.current_bid || row.currentBid || row.starting_bid || 0),
      winningBid: Number(row.current_bid || row.currentBid || row.starting_bid || 0),
      winnerId: row.winner_id || row.winnerId || null,
      status: row.status || 'active',
      endsAt: row.ends_at || row.endsAt,
      createdAt: row.created_at || row.createdAt,
      bidCount: Number(row.bid_count || row.bidCount || 0),
      viewerIsSeller: Boolean(isSeller),
      viewerIsWinner: Boolean(currentId && Number(row.winner_id || row.winnerId || 0) === currentId)
    };
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
      if (!ownsItem(req, item)) return res.status(403).json({ error: 'Only the item owner can edit price' });

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

      const ownerId = itemOwnerId(item);

      await q(
        'INSERT INTO buy_requests (item_id, requester_id, owner_id, created_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING',
        [item.id, userId, ownerId]
      ).catch(async () => {
        await q(
          'INSERT INTO buy_requests (item_id, buyer_id, owner_id, created_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING',
          [item.id, userId, ownerId]
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
        await q('DELETE FROM buy_requests WHERE item_id = $1 AND requester_id = $2', [item.id, userId])
          .catch(() => q('DELETE FROM buy_requests WHERE item_id = $1 AND buyer_id = $2', [item.id, userId]).catch(() => {}));
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
      if (!(await isAdmin(req)) && !ownsItem(req, item)) return res.status(403).json({ error: 'Not allowed' });

      const result = await q(
        'SELECT u.id, u.username, u.is_verified FROM buy_requests br JOIN users u ON u.id = br.requester_id WHERE br.item_id = $1',
        [item.id]
      ).catch(() => q(
        'SELECT u.id, u.username, u.is_verified FROM buy_requests br JOIN users u ON u.id = br.buyer_id WHERE br.item_id = $1',
        [item.id]
      ).catch(() => ({ rows: [] })));

      res.json({ users: result?.rows || [] });
    } catch {
      res.json({ users: [] });
    }
  }

  async function removeItem(req, res) {
    try {
      const item = await resolveItem(req);
      if (!item?.id) return res.status(404).json({ error: 'Item not found' });
      if (!(await isAdmin(req)) && !ownsItem(req, item)) return res.status(403).json({ error: 'Not allowed' });

      await ensureColumns();

      if (ownsItem(req, item)) {
        await q('DELETE FROM buy_requests WHERE item_id = $1', [item.id]).catch(() => {});
        await q('DELETE FROM items WHERE id = $1', [item.id]);
        return res.json({ ok: true, itemId: item.id, removed: true, deleted: true, item });
      }

      await q('UPDATE items SET price = NULL, show_bazaar = FALSE, trade_pending = TRUE WHERE id = $1', [item.id])
        .catch(() => q('UPDATE items SET price = NULL, trade_pending = TRUE WHERE id = $1', [item.id]).catch(() => {}));

      res.json({ ok: true, itemId: item.id, removed: true, listingOnly: true, item });
    } catch (error) {
      console.error('compat remove item failed:', error);
      res.status(500).json({ error: error.message || 'Failed to remove item/listing' });
    }
  }

  async function listAuctionItems(req, res) {
    try {
      if (!(await isVerifiedUser(req))) return res.status(403).json({ error: 'Verified users only' });
      await ensureAuctionTables();
      await ensureColumns();
      const userId = currentUserId(req);
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });
      const rows = await many(`
        SELECT i.id, i.title, i.image, i.price
        FROM items i
        WHERE i.userid = $1
          AND COALESCE(i.trade_pending, FALSE) = FALSE
          AND NOT EXISTS (
            SELECT 1 FROM bazaar_auctions a
            WHERE a.item_id = i.id AND a.status = 'active'
          )
        ORDER BY i.title ASC, i.id DESC
      `, [userId]);
      res.json({ ok: true, items: rows.map(row => ({ id: row.id, title: row.title, image: row.image, price: row.price || '' })) });
    } catch (error) {
      console.error('list auction items failed:', error);
      res.status(500).json({ error: error.message || 'Failed to load auctionable items' });
    }
  }

  async function listAuctions(req, res) {
    try {
      await ensureAuctionTables();
      await q("UPDATE bazaar_auctions SET status = 'ended', updated_at = NOW() WHERE status = 'active' AND ends_at <= NOW()").catch(() => {});
      const status = String(req.query?.status || 'active').toLowerCase();
      const where = status === 'all' ? '' : "WHERE a.status = $1";
      const params = status === 'all' ? [] : [status];
      const rows = await many(`
        SELECT
          a.*,
          i.title,
          i.image,
          u.username AS seller_username,
          COALESCE(u.is_verified, false) AS seller_verified,
          COUNT(b.id) AS bid_count
        FROM bazaar_auctions a
        JOIN items i ON i.id = a.item_id
        JOIN users u ON u.id = a.seller_id
        LEFT JOIN bazaar_auction_bids b ON b.auction_id = a.id
        ${where}
        GROUP BY a.id, i.title, i.image, u.username, u.is_verified
        ORDER BY CASE WHEN a.status = 'active' THEN 0 ELSE 1 END, a.ends_at ASC, a.created_at DESC
      `, params);
      res.json({ ok: true, auctions: rows.map(row => publicAuction(row, req)) });
    } catch (error) {
      console.error('list auctions failed:', error);
      res.status(500).json({ error: error.message || 'Failed to load auctions' });
    }
  }

  async function createAuction(req, res) {
    try {
      if (!(await isVerifiedUser(req))) return res.status(403).json({ error: 'Verified users only' });
      await ensureAuctionTables();
      const userId = currentUserId(req);
      const item = await resolveItem(req);
      if (!item?.id) return res.status(404).json({ error: 'Item not found' });
      if (!ownsItem(req, item) && !(await isAdmin(req))) return res.status(403).json({ error: 'Only the owner can auction this item' });
      if (item.trade_pending) return res.status(400).json({ error: 'Item is trade pending' });

      const startingBid = Math.max(1, numberInput(req.body?.startingBid ?? req.body?.starting_bid));
      const buyoutPriceRaw = numberInput(req.body?.buyoutPrice ?? req.body?.buyout_price, 0);
      const buyoutPrice = buyoutPriceRaw > 0 ? buyoutPriceRaw : null;
      if (buyoutPrice && buyoutPrice <= startingBid) return res.status(400).json({ error: 'Buyout must be higher than starting bid' });
      const durationHours = Math.min(168, Math.max(1, numberInput(req.body?.durationHours ?? req.body?.duration_hours, 24)));

      const existing = await one("SELECT id FROM bazaar_auctions WHERE item_id = $1 AND status = 'active' LIMIT 1", [item.id]).catch(() => null);
      if (existing?.id) return res.status(409).json({ error: 'This item already has an active auction' });

      const inserted = await q(
        `INSERT INTO bazaar_auctions (item_id, seller_id, starting_bid, buyout_price, current_bid, status, ends_at, updated_at)
         VALUES ($1, $2, $3, $4, $3, 'active', NOW() + ($5 || ' hours')::interval, NOW()) RETURNING *`,
        [item.id, itemOwnerId(item) || userId, startingBid, buyoutPrice, durationHours]
      );
      const auction = inserted?.rows?.[0] || { id: inserted?.lastID, item_id: item.id, seller_id: userId, starting_bid: startingBid, buyout_price: buyoutPrice, current_bid: startingBid, status: 'active' };
      res.json({ ok: true, auction: publicAuction({ ...auction, title: item.title, image: item.image }, req) });
    } catch (error) {
      console.error('create auction failed:', error);
      res.status(500).json({ error: error.message || 'Failed to create auction' });
    }
  }

  async function placeBid(req, res) {
    try {
      if (!(await isVerifiedUser(req))) return res.status(403).json({ error: 'Verified users only' });
      await ensureAuctionTables();
      const userId = currentUserId(req);
      const auctionId = req.params.auctionId || req.params.id;
      const amount = numberInput(req.body?.amount ?? req.body?.bid);
      const auction = await one('SELECT * FROM bazaar_auctions WHERE id = $1', [auctionId]).catch(() => null);
      if (!auction) return res.status(404).json({ error: 'Auction not found' });
      if (auction.status !== 'active') return res.status(400).json({ error: 'Auction is not active' });
      if (new Date(auction.ends_at || auction.endsAt).getTime() <= Date.now()) return res.status(400).json({ error: 'Auction has ended' });
      if (Number(auction.seller_id) === Number(userId)) return res.status(400).json({ error: 'Cannot bid on your own auction' });
      const minimum = Math.max(Number(auction.current_bid || auction.starting_bid || 0) + 1, Number(auction.starting_bid || 0));
      if (amount < minimum) return res.status(400).json({ error: `Bid must be at least ${minimum.toLocaleString()} IC` });

      await q('INSERT INTO bazaar_auction_bids (auction_id, bidder_id, amount) VALUES ($1, $2, $3)', [auctionId, userId, amount]);
      await q('UPDATE bazaar_auctions SET current_bid = $1, winner_id = $2, updated_at = NOW() WHERE id = $3', [amount, userId, auctionId]);
      res.json({ ok: true, auctionId: Number(auctionId), currentBid: amount, winnerId: userId });
    } catch (error) {
      console.error('place auction bid failed:', error);
      res.status(500).json({ error: error.message || 'Failed to place bid' });
    }
  }

  async function buyoutAuction(req, res) {
    try {
      if (!(await isVerifiedUser(req))) return res.status(403).json({ error: 'Verified users only' });
      await ensureAuctionTables();
      await ensureColumns();
      const userId = currentUserId(req);
      const auctionId = req.params.auctionId || req.params.id;
      const auction = await one('SELECT * FROM bazaar_auctions WHERE id = $1', [auctionId]).catch(() => null);
      if (!auction) return res.status(404).json({ error: 'Auction not found' });
      if (auction.status !== 'active') return res.status(400).json({ error: 'Auction is not active' });
      if (!auction.buyout_price) return res.status(400).json({ error: 'No buyout price set' });
      if (Number(auction.seller_id) === Number(userId)) return res.status(400).json({ error: 'Cannot buy out your own auction' });
      await q('INSERT INTO bazaar_auction_bids (auction_id, bidder_id, amount) VALUES ($1, $2, $3)', [auctionId, userId, Number(auction.buyout_price)]).catch(() => {});
      await q("UPDATE bazaar_auctions SET current_bid = $1, winner_id = $2, status = 'bought_out', updated_at = NOW() WHERE id = $3", [Number(auction.buyout_price), userId, auctionId]);
      await q('UPDATE items SET trade_pending = TRUE WHERE id = $1', [auction.item_id]).catch(() => {});
      res.json({ ok: true, auctionId: Number(auctionId), status: 'bought_out', currentBid: Number(auction.buyout_price), winnerId: userId });
    } catch (error) {
      console.error('buyout auction failed:', error);
      res.status(500).json({ error: error.message || 'Failed to buy out auction' });
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

  app.get('/api/bazaar/auction-items', auth, listAuctionItems);
  app.get('/api/bazaar/auctions/items', auth, listAuctionItems);
  app.get('/api/bazaar/auctions', auth, listAuctions);
  app.post('/api/bazaar/auctions', auth, createAuction);
  app.post('/api/bazaar/auctions/:auctionId/bid', auth, placeBid);
  app.post('/api/bazaar/auctions/:auctionId/buyout', auth, buyoutAuction);
}

module.exports = installVelkTradeCompatRoutes;
