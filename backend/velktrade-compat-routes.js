/* VelkTrade compatibility routes for item popup actions, online toggle, Bazaar auctions, and admin test-view impersonation. */

function installVelkTradeCompatRoutes({ app, authMiddleware, pool, query, run, get }) {
  if (!app || app.__velktradeCompatRoutesInstalled) return;
  app.__velktradeCompatRoutesInstalled = true;

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

  async function many(sql, params = []) {
    const result = await q(sql, params);
    if (Array.isArray(result?.rows)) return result.rows;
    if (Array.isArray(result)) return result;
    return [];
  }

  function currentUserId(req) { return req.user?.id || req.userId || req.session?.user?.id || req.session?.userId; }
  function currentUsername(req) { return req.user?.username || req.user?.name || req.session?.user?.username || req.session?.user?.name || req.body?.currentUsername || ''; }
  function numberInput(value, fallback = 0) { const number = Number(String(value ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(number) ? Math.floor(number) : fallback; }
  function optionalIncrement(value) { const number = numberInput(value, 0); return Number.isFinite(number) && number > 0 ? number : 0; }
  function isEndedStatus(status) { return ['ended', 'completed', 'no_winner', 'bought_out'].includes(String(status || '').toLowerCase()); }

  async function loadCurrentUser(req) {
    const userId = currentUserId(req);
    const username = currentUsername(req);
    if (userId) { const found = await one('SELECT * FROM users WHERE id = $1', [userId]).catch(() => null); if (found) return found; }
    if (username) { const found = await one('SELECT * FROM users WHERE lower(username) = lower($1)', [username]).catch(() => null); if (found) return found; }
    return req.user || req.session?.user || null;
  }

  function userIsDeveloper(user) {
    const username = String(user?.username || user?.name || '').toLowerCase();
    return Boolean(user?.isDeveloper || user?.is_developer || user?.developer || user?.role === 'developer' || user?.rank === 'developer' || username === 'salt' || username === 'velkon');
  }

  async function isAdmin(req) {
    const user = await loadCurrentUser(req);
    const username = String(user?.username || currentUsername(req) || '').toLowerCase();
    return Boolean(userIsDeveloper(user) || user?.isAdmin || user?.is_admin || user?.admin || user?.role === 'admin' || user?.rank === 'admin' || username === 'salt' || username === 'velkon');
  }

  async function isVerifiedUser(req) {
    const user = await loadCurrentUser(req);
    return Boolean(await isAdmin(req) || user?.isVerified || user?.is_verified || user?.verified || user?.isTrusted || user?.is_trusted);
  }

  async function ensureColumns() {
    try { await q('ALTER TABLE users ADD COLUMN IF NOT EXISTS show_online BOOLEAN DEFAULT TRUE'); } catch {}
    try { await q('ALTER TABLE items ADD COLUMN IF NOT EXISTS trade_pending BOOLEAN DEFAULT FALSE'); } catch {}
  }

  async function ensureAuctionTables() {
    await q(`CREATE TABLE IF NOT EXISTS bazaar_auctions (
      id SERIAL PRIMARY KEY,
      item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
      seller_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      starting_bid INTEGER NOT NULL DEFAULT 0,
      buyout_price INTEGER,
      min_increment INTEGER NOT NULL DEFAULT 0,
      current_bid INTEGER NOT NULL DEFAULT 0,
      winner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'active',
      ends_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '365 days'),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await q(`CREATE TABLE IF NOT EXISTS bazaar_auction_bids (
      id SERIAL PRIMARY KEY,
      auction_id INTEGER REFERENCES bazaar_auctions(id) ON DELETE CASCADE,
      bidder_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    try { await q('ALTER TABLE bazaar_auctions ADD COLUMN IF NOT EXISTS buyout_price INTEGER'); } catch {}
    try { await q('ALTER TABLE bazaar_auctions ADD COLUMN IF NOT EXISTS min_increment INTEGER NOT NULL DEFAULT 0'); } catch {}
    try { await q('ALTER TABLE bazaar_auctions ALTER COLUMN min_increment SET DEFAULT 0'); } catch {}
    try { await q('ALTER TABLE bazaar_auctions ADD COLUMN IF NOT EXISTS current_bid INTEGER NOT NULL DEFAULT 0'); } catch {}
    try { await q('ALTER TABLE bazaar_auctions ADD COLUMN IF NOT EXISTS winner_id INTEGER REFERENCES users(id) ON DELETE SET NULL'); } catch {}
    try { await q("ALTER TABLE bazaar_auctions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'"); } catch {}
    try { await q('ALTER TABLE bazaar_auctions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()'); } catch {}
  }

  async function resolveItem(req) {
    const directId = req.params.itemId || req.params.id || req.body?.itemId || req.body?.id;
    if (directId) return await one('SELECT * FROM items WHERE id = $1', [directId]).catch(() => ({ id: directId })) || { id: directId };
    const title = String(req.body?.title || '').trim();
    const image = String(req.body?.image || '').trim();
    if (image) { const item = await one('SELECT * FROM items WHERE image = $1 ORDER BY id DESC LIMIT 1', [image]).catch(() => null); if (item) return item; }
    if (title) { const item = await one('SELECT * FROM items WHERE title = $1 ORDER BY id DESC LIMIT 1', [title]).catch(() => null); if (item) return item; }
    return null;
  }

  function itemOwnerId(item) { return item?.user_id ?? item?.userid ?? item?.userId ?? item?.owner_id ?? item?.ownerId ?? null; }
  function ownsItem(req, item) { return String(currentUserId(req) || '') === String(itemOwnerId(item) || ''); }
  async function viewerCanManageAuction(req, auction) { return Boolean(await isAdmin(req) || String(currentUserId(req) || '') === String(auction?.seller_id || auction?.sellerId || '')); }

  function publicAuction(row, req) {
    const currentId = Number(currentUserId(req) || 0);
    const sellerId = Number(row.seller_id || row.sellerId || 0);
    const status = row.status || 'active';
    const viewerIsSeller = Boolean(currentId && sellerId && currentId === sellerId);
    const ended = isEndedStatus(status);
    const canRevealSeller = ended || viewerIsSeller || row.viewer_can_manage || row.viewer_can_see_seller;
    const bidCount = Number(row.bid_count || row.bidCount || 0);
    const startingBid = Number(row.starting_bid || row.startingBid || 0);
    const currentBid = Number(row.current_bid || row.currentBid || startingBid || 0);
    const minIncrement = Math.max(0, Number(row.min_increment ?? row.minIncrement ?? 0));
    return {
      id: row.id,
      itemId: row.item_id || row.itemId,
      title: row.title || row.item_title || 'Item',
      image: row.image || '',
      sellerId: canRevealSeller ? sellerId : undefined,
      sellerUsername: canRevealSeller ? row.seller_username || row.sellerUsername : undefined,
      sellerVerified: canRevealSeller ? Boolean(row.seller_verified || row.sellerVerified) : undefined,
      startingBid,
      buyoutPrice: row.buyout_price || row.buyoutPrice ? Number(row.buyout_price || row.buyoutPrice) : null,
      minIncrement,
      currentBid,
      winningBid: currentBid,
      winnerId: row.winner_id || row.winnerId || null,
      winnerUsername: ended ? row.winner_username || row.winnerUsername || null : null,
      status,
      endsAt: row.ends_at || row.endsAt,
      createdAt: row.created_at || row.createdAt,
      updatedAt: row.updated_at || row.updatedAt,
      bidCount,
      hasBids: bidCount > 0,
      displayBidLabel: bidCount > 0 ? 'Current bid' : 'Starting bid',
      minimumNextBid: bidCount > 0 ? currentBid + (minIncrement > 0 ? minIncrement : 1) : startingBid,
      viewerIsSeller,
      viewerCanManage: Boolean(row.viewer_can_manage || viewerIsSeller),
      viewerIsWinner: Boolean(currentId && Number(row.winner_id || row.winnerId || 0) === currentId)
    };
  }

  async function online(req, res) { try { const userId = currentUserId(req); if (!userId) return res.status(401).json({ error: 'Not authenticated' }); const raw = req.body?.showOnline ?? req.body?.show_online ?? req.body?.online ?? req.body?.enabled; const showOnline = raw === true || raw === 'true' || raw === 1 || raw === '1'; await ensureColumns(); await q('UPDATE users SET show_online = $1 WHERE id = $2', [showOnline, userId]).catch(() => {}); res.json({ ok: true, showOnline, show_online: showOnline, online: showOnline }); } catch (error) { res.status(500).json({ error: error.message || 'Failed to update online visibility' }); } }
  async function resolve(req, res) { const item = await resolveItem(req); res.json({ id: item?.id || '', itemId: item?.id || '', item: item || null }); }
  async function updatePrice(req, res) { try { const item = await resolveItem(req); if (!item?.id) return res.status(404).json({ error: 'Item not found' }); if (!ownsItem(req, item)) return res.status(403).json({ error: 'Only the item owner can edit price' }); await q('UPDATE items SET price = $1 WHERE id = $2', [req.body?.price || '', item.id]); res.json({ ok: true, itemId: item.id, price: req.body?.price || '' }); } catch (error) { res.status(500).json({ error: error.message || 'Failed to update price' }); } }
  async function addInterest(req, res) { try { const userId = currentUserId(req); if (!userId) return res.status(401).json({ error: 'Not authenticated' }); const item = await resolveItem(req); if (!item?.id) return res.status(404).json({ error: 'Item not found' }); if (ownsItem(req, item)) return res.status(400).json({ error: 'Cannot mark interest in your own item' }); await q('INSERT INTO buy_requests (item_id, requester_id, owner_id, created_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING', [item.id, userId, itemOwnerId(item)]).catch(() => {}); res.json({ ok: true, itemId: item.id, interested: true }); } catch (error) { res.status(500).json({ error: error.message || 'Failed to add interest' }); } }
  async function removeInterest(req, res) { try { const userId = currentUserId(req); const item = await resolveItem(req); if (item?.id && userId) await q('DELETE FROM buy_requests WHERE item_id = $1 AND requester_id = $2', [item.id, userId]).catch(() => {}); res.json({ ok: true, itemId: item?.id || '', interested: false }); } catch (error) { res.status(500).json({ error: error.message || 'Failed to remove interest' }); } }
  async function getInterest(req, res) { try { const item = await resolveItem(req); if (!item?.id) return res.json({ users: [] }); if (!(await isAdmin(req)) && !ownsItem(req, item)) return res.status(403).json({ error: 'Not allowed' }); const rows = await many('SELECT u.id, u.username, u.is_verified FROM buy_requests br JOIN users u ON u.id = br.requester_id WHERE br.item_id = $1', [item.id]).catch(() => []); res.json({ users: rows }); } catch { res.json({ users: [] }); } }
  async function removeItem(req, res) { try { const item = await resolveItem(req); if (!item?.id) return res.status(404).json({ error: 'Item not found' }); if (!(await isAdmin(req)) && !ownsItem(req, item)) return res.status(403).json({ error: 'Not allowed' }); await ensureColumns(); await q('UPDATE items SET price = NULL, show_bazaar = FALSE, trade_pending = TRUE WHERE id = $1', [item.id]).catch(() => {}); res.json({ ok: true, itemId: item.id, removed: true, item }); } catch (error) { res.status(500).json({ error: error.message || 'Failed to remove item/listing' }); } }

  async function listAuctionItems(req, res) { try { if (!(await isVerifiedUser(req))) return res.status(403).json({ error: 'Verified users only' }); await ensureAuctionTables(); await ensureColumns(); const userId = currentUserId(req); if (!userId) return res.status(401).json({ error: 'Not authenticated' }); const rows = await many(`SELECT i.id, i.title, i.image, i.price FROM items i WHERE i.userid = $1 AND COALESCE(i.trade_pending, FALSE) = FALSE AND NOT EXISTS (SELECT 1 FROM bazaar_auctions a WHERE a.item_id = i.id AND a.status = 'active') ORDER BY i.title ASC, i.id DESC`, [userId]); res.json({ ok: true, items: rows.map(row => ({ id: row.id, title: row.title, image: row.image, price: row.price || '' })) }); } catch (error) { res.status(500).json({ error: error.message || 'Failed to load auctionable items' }); } }

  async function loadAuctionRows(req, status) {
    const admin = await isAdmin(req);
    const currentId = Number(currentUserId(req) || 0);
    let where = "WHERE a.status = 'active'";
    if (status === 'recent') where = "WHERE a.status IN ('completed','no_winner','bought_out','ended') AND a.updated_at >= NOW() - INTERVAL '24 hours'";
    if (status === 'history') where = "WHERE a.status IN ('completed','no_winner','bought_out','ended') AND a.updated_at < NOW() - INTERVAL '24 hours'";
    if (status === 'all') where = "WHERE a.status <> 'deleted'";
    const rows = await many(`SELECT a.*, i.title, i.image, u.username AS seller_username, COALESCE(u.is_verified, false) AS seller_verified, wu.username AS winner_username, COUNT(b.id) AS bid_count FROM bazaar_auctions a JOIN items i ON i.id = a.item_id JOIN users u ON u.id = a.seller_id LEFT JOIN users wu ON wu.id = a.winner_id LEFT JOIN bazaar_auction_bids b ON b.auction_id = a.id ${where} GROUP BY a.id, i.title, i.image, u.username, u.is_verified, wu.username ORDER BY CASE WHEN a.status = 'active' THEN 0 ELSE 1 END, a.updated_at DESC, a.created_at DESC`);
    return rows.map(row => publicAuction({ ...row, viewer_can_manage: admin || (currentId && Number(row.seller_id) === currentId) }, req));
  }

  async function listAuctions(req, res) { try { await ensureAuctionTables(); const status = String(req.query?.status || 'active').toLowerCase(); res.json({ ok: true, auctions: await loadAuctionRows(req, status) }); } catch (error) { res.status(500).json({ error: error.message || 'Failed to load auctions' }); } }
  async function listAuctionBids(req, res) { try { await ensureAuctionTables(); const auctionId = req.params.auctionId || req.params.id; const rows = await many(`SELECT b.id, b.amount, b.created_at, u.id AS bidder_id, u.username AS bidder_username, COALESCE(u.is_verified, false) AS bidder_verified FROM bazaar_auction_bids b JOIN users u ON u.id = b.bidder_id WHERE b.auction_id = $1 ORDER BY b.amount DESC, b.created_at ASC`, [auctionId]); res.json({ ok: true, bids: rows.map(row => ({ id: row.id, amount: Number(row.amount), createdAt: row.created_at, bidderId: row.bidder_id, bidderUsername: row.bidder_username, bidderVerified: Boolean(row.bidder_verified) })) }); } catch (error) { res.status(500).json({ error: error.message || 'Failed to load bids' }); } }

  async function createAuction(req, res) {
    try { if (!(await isVerifiedUser(req))) return res.status(403).json({ error: 'Verified users only' }); await ensureAuctionTables(); const userId = currentUserId(req); const item = await resolveItem(req); if (!item?.id) return res.status(404).json({ error: 'Item not found' }); if (!ownsItem(req, item) && !(await isAdmin(req))) return res.status(403).json({ error: 'Only the owner can auction this item' }); if (item.trade_pending) return res.status(400).json({ error: 'Item is trade pending' }); const startingBid = Math.max(1, numberInput(req.body?.startingBid ?? req.body?.starting_bid)); const buyoutPriceRaw = numberInput(req.body?.buyoutPrice ?? req.body?.buyout_price, 0); const buyoutPrice = buyoutPriceRaw > 0 ? buyoutPriceRaw : null; const minIncrement = optionalIncrement(req.body?.minIncrement ?? req.body?.min_increment); if (buyoutPrice && buyoutPrice <= startingBid) return res.status(400).json({ error: 'Buyout must be higher than starting bid' }); const existing = await one("SELECT id FROM bazaar_auctions WHERE item_id = $1 AND status = 'active' LIMIT 1", [item.id]).catch(() => null); if (existing?.id) return res.status(409).json({ error: 'This item already has an active auction' }); const inserted = await q(`INSERT INTO bazaar_auctions (item_id, seller_id, starting_bid, buyout_price, min_increment, current_bid, status, ends_at, updated_at) VALUES ($1, $2, $3, $4, $5, $3, 'active', NOW() + INTERVAL '365 days', NOW()) RETURNING *`, [item.id, itemOwnerId(item) || userId, startingBid, buyoutPrice, minIncrement]); const auction = inserted?.rows?.[0] || { item_id: item.id, seller_id: userId, starting_bid: startingBid, buyout_price: buyoutPrice, min_increment: minIncrement, current_bid: startingBid, status: 'active' }; res.json({ ok: true, auction: publicAuction({ ...auction, title: item.title, image: item.image, viewer_can_manage: true }, req) }); } catch (error) { res.status(500).json({ error: error.message || 'Failed to create auction' }); }
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
      if (Number(auction.seller_id) === Number(userId)) return res.status(400).json({ error: 'Cannot bid on your own auction' });
      const bidCountRow = await one('SELECT COUNT(*) AS count FROM bazaar_auction_bids WHERE auction_id = $1', [auctionId]).catch(() => ({ count: 0 }));
      const bidCount = Number(bidCountRow?.count || bidCountRow?.COUNT || 0);
      const starting = Number(auction.starting_bid || 0);
      const current = Number(auction.current_bid || auction.starting_bid || 0);
      const increment = Math.max(0, Number(auction.min_increment || 0));
      const minimum = bidCount > 0 ? current + (increment > 0 ? increment : 1) : starting;
      if (amount < minimum) return res.status(400).json({ error: `Bid must be at least ${minimum.toLocaleString()} IC` });
      await q('INSERT INTO bazaar_auction_bids (auction_id, bidder_id, amount) VALUES ($1, $2, $3)', [auctionId, userId, amount]);
      await q('UPDATE bazaar_auctions SET current_bid = $1, winner_id = $2, updated_at = NOW() WHERE id = $3', [amount, userId, auctionId]);
      res.json({ ok: true, auctionId: Number(auctionId), currentBid: amount, winnerId: userId, minimumAccepted: minimum });
    } catch (error) { res.status(500).json({ error: error.message || 'Failed to place bid' }); }
  }

  async function buyoutAuction(req, res) { try { if (!(await isVerifiedUser(req))) return res.status(403).json({ error: 'Verified users only' }); await ensureAuctionTables(); await ensureColumns(); const userId = currentUserId(req); const auctionId = req.params.auctionId || req.params.id; const auction = await one('SELECT * FROM bazaar_auctions WHERE id = $1', [auctionId]).catch(() => null); if (!auction) return res.status(404).json({ error: 'Auction not found' }); if (auction.status !== 'active') return res.status(400).json({ error: 'Auction is not active' }); if (!auction.buyout_price) return res.status(400).json({ error: 'No buyout price set' }); if (Number(auction.seller_id) === Number(userId)) return res.status(400).json({ error: 'Cannot buy out your own auction' }); await q('INSERT INTO bazaar_auction_bids (auction_id, bidder_id, amount) VALUES ($1, $2, $3)', [auctionId, userId, Number(auction.buyout_price)]).catch(() => {}); await q("UPDATE bazaar_auctions SET current_bid = $1, winner_id = $2, status = 'bought_out', updated_at = NOW() WHERE id = $3", [Number(auction.buyout_price), userId, auctionId]); await q('UPDATE items SET trade_pending = TRUE WHERE id = $1', [auction.item_id]).catch(() => {}); res.json({ ok: true, auctionId: Number(auctionId), status: 'bought_out', currentBid: Number(auction.buyout_price), winnerId: userId }); } catch (error) { res.status(500).json({ error: error.message || 'Failed to buy out auction' }); } }
  async function endAuction(req, res) { try { await ensureAuctionTables(); const auctionId = req.params.auctionId || req.params.id; const auction = await one('SELECT * FROM bazaar_auctions WHERE id = $1', [auctionId]).catch(() => null); if (!auction) return res.status(404).json({ error: 'Auction not found' }); if (!(await viewerCanManageAuction(req, auction))) return res.status(403).json({ error: 'Not allowed' }); const winnerId = req.body?.winnerId || req.body?.winner_id || null; if (winnerId) { const bid = await one('SELECT * FROM bazaar_auction_bids WHERE auction_id = $1 AND bidder_id = $2 ORDER BY amount DESC LIMIT 1', [auctionId, winnerId]).catch(() => null); if (!bid) return res.status(400).json({ error: 'Winner must be one of the bidders' }); await q("UPDATE bazaar_auctions SET status = 'completed', winner_id = $1, current_bid = $2, updated_at = NOW() WHERE id = $3", [winnerId, Number(bid.amount), auctionId]); await q('UPDATE items SET trade_pending = TRUE WHERE id = $1', [auction.item_id]).catch(() => {}); return res.json({ ok: true, auctionId: Number(auctionId), status: 'completed', winnerId, currentBid: Number(bid.amount) }); } await q("UPDATE bazaar_auctions SET status = 'no_winner', winner_id = NULL, updated_at = NOW() WHERE id = $1", [auctionId]); res.json({ ok: true, auctionId: Number(auctionId), status: 'no_winner', winnerId: null }); } catch (error) { res.status(500).json({ error: error.message || 'Failed to end auction' }); } }
  async function deleteAuction(req, res) { try { await ensureAuctionTables(); const auctionId = req.params.auctionId || req.params.id; const auction = await one('SELECT * FROM bazaar_auctions WHERE id = $1', [auctionId]).catch(() => null); if (!auction) return res.status(404).json({ error: 'Auction not found' }); if (!(await viewerCanManageAuction(req, auction))) return res.status(403).json({ error: 'Not allowed' }); await q('DELETE FROM bazaar_auctions WHERE id = $1', [auctionId]); res.json({ ok: true, auctionId: Number(auctionId), deleted: true }); } catch (error) { res.status(500).json({ error: error.message || 'Failed to delete auction' }); } }

  function virtualUserForState(state, requester) {
    const developer = userIsDeveloper(requester);
    const base = { id: `test-${state}`, username: `Test ${state.replace('-', ' ')}`, testView: true, state };
    if (state === 'not-registered') return { ...base, id: null, username: 'Guest / Not Registered', registered: false, isVerified: false, isAdmin: false, isDeveloper: false };
    if (state === 'registered') return { ...base, registered: true, isVerified: false, isAdmin: false, isDeveloper: false };
    if (state === 'verified') return { ...base, registered: true, isVerified: true, isAdmin: false, isDeveloper: false };
    if (state === 'admin') return { ...base, registered: true, isVerified: true, isAdmin: true, isDeveloper: false };
    if (state === 'developer' && developer) return { ...base, registered: true, isVerified: true, isAdmin: true, isDeveloper: true };
    return null;
  }

  async function impersonationOptions(req, res) {
    try {
      if (!(await isAdmin(req))) return res.status(403).json({ error: 'Admin only' });
      const requester = await loadCurrentUser(req);
      const states = [
        { key: 'not-registered', label: 'Not-Registered' },
        { key: 'registered', label: 'Registered' },
        { key: 'verified', label: 'Verified' },
        { key: 'admin', label: 'Admin' },
        ...(userIsDeveloper(requester) ? [{ key: 'developer', label: 'Developer' }] : [])
      ];
      res.json({ ok: true, states });
    } catch (error) { res.status(500).json({ error: error.message || 'Failed to load impersonation options' }); }
  }

  async function startImpersonation(req, res) {
    try {
      if (!(await isAdmin(req))) return res.status(403).json({ error: 'Admin only' });
      const requester = await loadCurrentUser(req);
      const state = String(req.body?.state || '').toLowerCase();
      const username = String(req.body?.username || '').trim();
      let target = null;
      if (username) target = await one('SELECT * FROM users WHERE lower(username) = lower($1)', [username]).catch(() => null);
      if (!target && state) target = virtualUserForState(state, requester);
      if (!target) return res.status(404).json({ error: 'No impersonation target found' });
      if (target.isDeveloper && !userIsDeveloper(requester)) return res.status(403).json({ error: 'Developer test view is developer-only' });
      const payload = {
        mode: username ? 'user' : 'state',
        state: state || null,
        user: {
          id: target.id || null,
          username: target.username || target.name || username || 'Test User',
          isVerified: Boolean(target.isVerified || target.is_verified || target.verified),
          isAdmin: Boolean(target.isAdmin || target.is_admin || target.admin || target.isDeveloper || target.is_developer),
          isDeveloper: Boolean(target.isDeveloper || target.is_developer || target.developer || userIsDeveloper(target)),
          registered: target.registered !== false
        },
        startedAt: new Date().toISOString()
      };
      res.json({ ok: true, impersonation: payload });
    } catch (error) { res.status(500).json({ error: error.message || 'Failed to start test view' }); }
  }

  async function stopImpersonation(req, res) {
    if (!(await isAdmin(req))) return res.status(403).json({ error: 'Admin only' });
    res.json({ ok: true, stopped: true });
  }

  for (const method of ['put', 'post', 'patch']) { app[method]('/api/me/online', auth, online); app[method]('/api/profile/online', auth, online); app[method]('/api/users/me/online', auth, online); app[method]('/api/inventory/online', auth, online); }
  app.post('/api/items/resolve', auth, resolve);
  app.put('/api/items/:itemId/price', auth, updatePrice); app.patch('/api/items/:itemId/price', auth, updatePrice); app.post('/api/items/:itemId/price', auth, updatePrice);
  app.delete('/api/items/:itemId', auth, removeItem); app.post('/api/items/:itemId/remove', auth, removeItem);
  app.get('/api/items/:itemId/interest', auth, getInterest); app.post('/api/items/:itemId/interest', auth, addInterest); app.delete('/api/items/:itemId/interest', auth, removeInterest);
  app.get('/api/bazaar/auction-items', auth, listAuctionItems); app.get('/api/bazaar/auctions/items', auth, listAuctionItems);
  app.get('/api/bazaar/auctions', auth, listAuctions); app.post('/api/bazaar/auctions', auth, createAuction);
  app.get('/api/bazaar/auctions/:auctionId/bids', auth, listAuctionBids); app.post('/api/bazaar/auctions/:auctionId/bid', auth, placeBid); app.post('/api/bazaar/auctions/:auctionId/buyout', auth, buyoutAuction); app.post('/api/bazaar/auctions/:auctionId/end', auth, endAuction); app.delete('/api/bazaar/auctions/:auctionId', auth, deleteAuction);
  app.get('/api/admin/impersonation/options', auth, impersonationOptions);
  app.get('/api/admin/impersonation/default-states', auth, impersonationOptions);
  app.post('/api/admin/impersonation/start', auth, startImpersonation);
  app.post('/api/admin/impersonation/stop', auth, stopImpersonation);
}

module.exports = installVelkTradeCompatRoutes;
