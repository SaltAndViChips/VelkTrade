import fs from 'fs';
import path from 'path';

const root = process.cwd();

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function appendOnce(file, marker, content) {
  let current = read(file);
  if (!current) {
    console.warn(`Missing file: ${file}`);
    return false;
  }

  if (current.includes(marker)) {
    console.log(`Already patched: ${file}`);
    return true;
  }

  current += `\n\n${marker}\n${content}\n`;
  write(file, current);
  console.log(`Patched: ${file}`);
  return true;
}

const cssPath = path.join(root, 'frontend/src/styles.css');
const cssPatch = read(path.join(root, 'patches/mosaic-responsive-overrides.css'));

if (!cssPatch) {
  throw new Error('Missing patches/mosaic-responsive-overrides.css');
}

appendOnce(cssPath, '/* === VelkTrade bazaar/trade/inventory/admin mosaic responsive patch === */', cssPatch);

const serverPath = path.join(root, 'backend/server.js');
let server = read(serverPath);

if (!server) {
  console.warn('backend/server.js not found; skipped backend patch.');
} else if (server.includes('velktradeBazaarTradeMosaicPrivacyPatch')) {
  console.log('Backend already patched.');
} else {
  const helperBlock = `

// === velktradeBazaarTradeMosaicPrivacyPatch ===
function velktradeBool(value, fallback = true) {
  if (value === undefined || value === null) return fallback;
  return value === true || value === 'true' || value === 1 || value === '1';
}

function velktradeCurrentUserId(req) {
  return req.user?.id || req.userId || req.session?.user?.id || req.session?.userId;
}

function velktradeIsAdmin(req) {
  return Boolean(req.user?.isAdmin || req.user?.is_admin || req.user?.isDeveloper || req.user?.is_developer || req.user?.role === 'admin' || req.user?.role === 'developer');
}

function velktradeIsAccepted(value) {
  const status = String(value?.status || value?.tradeStatus || value?.sellerStatus || '').toLowerCase();
  return Boolean(
    value?.accepted ||
    value?.sellerAccepted ||
    value?.seller_accepted ||
    value?.acceptedBySeller ||
    value?.accepted_by_seller ||
    status === 'accepted' ||
    status === 'seller_accepted' ||
    status === 'confirmed' ||
    status === 'pending_confirm'
  );
}

function velktradeSanitizeSellerFields(value, req) {
  if (Array.isArray(value)) return value.map(item => velktradeSanitizeSellerFields(item, req));
  if (!value || typeof value !== 'object') return value;

  const currentUserId = String(velktradeCurrentUserId(req) || '');
  const isAdmin = velktradeIsAdmin(req);
  const sellerId = String(value.sellerId ?? value.seller_id ?? value.ownerId ?? value.owner_id ?? value.userId ?? value.userid ?? '');
  const viewerIsSeller = sellerId && currentUserId && sellerId === currentUserId;
  const accepted = velktradeIsAccepted(value);

  const copy = { ...value };

  for (const key of Object.keys(copy)) {
    copy[key] = velktradeSanitizeSellerFields(copy[key], req);
  }

  if (!isAdmin && !viewerIsSeller && !accepted) {
    delete copy.seller;
    delete copy.sellerId;
    delete copy.seller_id;
    delete copy.sellerUsername;
    delete copy.seller_username;
    delete copy.owner;
    delete copy.ownerId;
    delete copy.owner_id;
    delete copy.ownerUsername;
    delete copy.owner_username;
    delete copy.userId;
    delete copy.userid;
    delete copy.username;
  }

  return copy;
}

function velktradeInstallSellerPrivacySanitizer(req, res, next) {
  if (res.locals?.velktradePrivacyWrapped) return next();
  res.locals.velktradePrivacyWrapped = true;

  const originalJson = res.json.bind(res);
  res.json = payload => {
    const url = String(req.originalUrl || req.url || '').toLowerCase();
    const shouldSanitize = url.includes('/api/bazaar') || url.includes('/api/buy') || url.includes('/api/trade');
    return originalJson(shouldSanitize ? velktradeSanitizeSellerFields(payload, req) : payload);
  };

  next();
}

async function velktradeTryDb(attempts) {
  let lastError;
  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result !== false && result !== undefined) return result;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('No compatible database helper succeeded.');
}

async function velktradeEnsureShowOnlineColumn() {
  try {
    await velktradeTryDb([
      () => typeof run === 'function' && run('ALTER TABLE users ADD COLUMN IF NOT EXISTS show_online BOOLEAN DEFAULT TRUE'),
      () => typeof query === 'function' && query('ALTER TABLE users ADD COLUMN IF NOT EXISTS show_online BOOLEAN DEFAULT TRUE'),
      () => typeof pool !== 'undefined' && pool?.query && pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS show_online BOOLEAN DEFAULT TRUE'),
      () => typeof db !== 'undefined' && db?.query && db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS show_online BOOLEAN DEFAULT TRUE')
    ]);
  } catch {}
}

async function velktradeOnlineToggleVisibilityHandler(req, res) {
  try {
    const userId = velktradeCurrentUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const showOnline = velktradeBool(req.body?.showOnline ?? req.body?.show_online ?? req.body?.online ?? req.body?.enabled, true);

    await velktradeEnsureShowOnlineColumn();

    await velktradeTryDb([
      () => typeof run === 'function' && run('UPDATE users SET show_online = $1 WHERE id = $2', [showOnline, userId]),
      () => typeof run === 'function' && run('UPDATE users SET show_online = ? WHERE id = ?', [showOnline, userId]),
      () => typeof query === 'function' && query('UPDATE users SET show_online = $1 WHERE id = $2', [showOnline, userId]),
      () => typeof pool !== 'undefined' && pool?.query && pool.query('UPDATE users SET show_online = $1 WHERE id = $2', [showOnline, userId]),
      () => typeof db !== 'undefined' && db?.query && db.query('UPDATE users SET show_online = $1 WHERE id = $2', [showOnline, userId])
    ]);

    if (typeof onlineUsers !== 'undefined' && onlineUsers?.has?.(userId)) {
      const current = onlineUsers.get(userId);
      onlineUsers.set(userId, { ...current, showOnline, show_online: showOnline });
      if (typeof broadcastPresence === 'function') broadcastPresence();
    }

    res.json({ ok: true, showOnline, show_online: showOnline, online: showOnline });
  } catch (error) {
    console.error('Online visibility toggle failed:', error);
    res.status(500).json({ error: error.message || 'Failed to update online visibility' });
  }
}

async function velktradeAdminRemoveBazaarListing(req, res) {
  try {
    if (!velktradeIsAdmin(req)) return res.status(403).json({ error: 'Admin only' });

    const itemId = req.params.itemId || req.params.id;
    if (!itemId) return res.status(400).json({ error: 'Missing item id' });

    await velktradeTryDb([
      () => typeof run === 'function' && run('UPDATE items SET price = NULL WHERE id = $1', [itemId]),
      () => typeof run === 'function' && run('UPDATE items SET price = ? WHERE id = ?', [null, itemId]),
      () => typeof query === 'function' && query('UPDATE items SET price = NULL WHERE id = $1', [itemId]),
      () => typeof pool !== 'undefined' && pool?.query && pool.query('UPDATE items SET price = NULL WHERE id = $1', [itemId]),
      () => typeof db !== 'undefined' && db?.query && db.query('UPDATE items SET price = NULL WHERE id = $1', [itemId])
    ]);

    res.json({ ok: true, itemId, removed: true });
  } catch (error) {
    console.error('Admin remove bazaar listing failed:', error);
    res.status(500).json({ error: error.message || 'Failed to remove bazaar listing' });
  }
}

async function velktradeGetBazaarItem(itemId) {
  const result = await velktradeTryDb([
    () => typeof get === 'function' && get('SELECT * FROM items WHERE id = $1', [itemId]),
    () => typeof get === 'function' && get('SELECT * FROM items WHERE id = ?', [itemId]),
    () => typeof query === 'function' && query('SELECT * FROM items WHERE id = $1', [itemId]),
    () => typeof pool !== 'undefined' && pool?.query && pool.query('SELECT * FROM items WHERE id = $1', [itemId]),
    () => typeof db !== 'undefined' && db?.query && db.query('SELECT * FROM items WHERE id = $1', [itemId])
  ]);

  if (Array.isArray(result?.rows)) return result.rows[0];
  if (Array.isArray(result)) return result[0];
  return result;
}

async function velktradeCreateAcceptedOfflineTrade(req, res) {
  try {
    const itemId = req.params.itemId || req.params.id;
    const buyerId = req.body?.buyerId || req.body?.buyer_id || velktradeCurrentUserId(req);
    const buyerUsername = req.body?.buyerUsername || req.body?.buyer_username || req.user?.username || null;
    const icAmount = Number(req.body?.icAmount || req.body?.ic || req.body?.price || 0);

    if (!itemId) return res.status(400).json({ error: 'Missing item id' });
    if (!buyerId) return res.status(400).json({ error: 'Missing buyer id' });
    if (!Number.isFinite(icAmount) || icAmount <= 0) return res.status(400).json({ error: 'Invalid IC amount' });

    const item = await velktradeGetBazaarItem(itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const sellerId = item.user_id || item.userid || item.userId || item.owner_id || item.ownerId;
    const sellerUsername = item.username || item.ownerUsername || item.owner_username || item.sellerUsername || item.seller_username || null;
    const roomId = 'offline-bazaar-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

    const tradePayload = {
      roomId,
      fromUser: buyerId,
      toUser: sellerId,
      fromUsername: buyerUsername,
      toUsername: sellerUsername,
      fromItems: [],
      toItems: [Number(itemId)],
      fromIc: icAmount,
      toIc: 0,
      status: 'seller_pending_confirm',
      buyerAccepted: true,
      sellerAccepted: false,
      source: 'bazaar'
    };

    const inserted = await velktradeTryDb([
      () => typeof run === 'function' && run(
        'INSERT INTO trades (room_id, from_user, to_user, from_username, to_username, from_items, to_items, from_ic, to_ic, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())',
        [roomId, buyerId, sellerId, buyerUsername, sellerUsername, JSON.stringify([]), JSON.stringify([Number(itemId)]), icAmount, 0, 'seller_pending_confirm']
      ),
      () => typeof run === 'function' && run(
        'INSERT INTO trades (roomId, fromUser, toUser, fromUsername, toUsername, fromItems, toItems, fromIc, toIc, status, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [roomId, buyerId, sellerId, buyerUsername, sellerUsername, JSON.stringify([]), JSON.stringify([Number(itemId)]), icAmount, 0, 'seller_pending_confirm', new Date().toISOString()]
      ),
      () => typeof query === 'function' && query(
        'INSERT INTO trades (room_id, from_user, to_user, from_username, to_username, from_items, to_items, from_ic, to_ic, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()) RETURNING *',
        [roomId, buyerId, sellerId, buyerUsername, sellerUsername, JSON.stringify([]), JSON.stringify([Number(itemId)]), icAmount, 0, 'seller_pending_confirm']
      ),
      () => typeof pool !== 'undefined' && pool?.query && pool.query(
        'INSERT INTO trades (room_id, from_user, to_user, from_username, to_username, from_items, to_items, from_ic, to_ic, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()) RETURNING *',
        [roomId, buyerId, sellerId, buyerUsername, sellerUsername, JSON.stringify([]), JSON.stringify([Number(itemId)]), icAmount, 0, 'seller_pending_confirm']
      )
    ]);

    const trade = inserted?.rows?.[0] || tradePayload;
    res.json({ ok: true, trade: velktradeSanitizeSellerFields(trade, req) });
  } catch (error) {
    console.error('Create accepted bazaar offline trade failed:', error);
    res.status(500).json({ error: error.message || 'Failed to create accepted offline trade' });
  }
}

`;

  const routeBlock = `
app.use(velktradeInstallSellerPrivacySanitizer);

app.put('/api/me/online', authMiddleware, velktradeOnlineToggleVisibilityHandler);
app.post('/api/me/online', authMiddleware, velktradeOnlineToggleVisibilityHandler);
app.patch('/api/me/online', authMiddleware, velktradeOnlineToggleVisibilityHandler);
app.put('/api/profile/online', authMiddleware, velktradeOnlineToggleVisibilityHandler);
app.post('/api/profile/online', authMiddleware, velktradeOnlineToggleVisibilityHandler);
app.patch('/api/profile/online', authMiddleware, velktradeOnlineToggleVisibilityHandler);
app.put('/api/users/me/online', authMiddleware, velktradeOnlineToggleVisibilityHandler);
app.post('/api/users/me/online', authMiddleware, velktradeOnlineToggleVisibilityHandler);
app.patch('/api/users/me/online', authMiddleware, velktradeOnlineToggleVisibilityHandler);

app.delete('/api/admin/bazaar/items/:itemId', authMiddleware, velktradeAdminRemoveBazaarListing);
app.post('/api/admin/bazaar/items/:itemId/remove', authMiddleware, velktradeAdminRemoveBazaarListing);
app.delete('/api/bazaar/items/:itemId/admin', authMiddleware, velktradeAdminRemoveBazaarListing);
app.post('/api/bazaar/items/:itemId/admin-remove', authMiddleware, velktradeAdminRemoveBazaarListing);

app.post('/api/bazaar/items/:itemId/offline-accepted-trade', authMiddleware, velktradeCreateAcceptedOfflineTrade);
app.post('/api/bazaar/items/:itemId/create-offline-trade', authMiddleware, velktradeCreateAcceptedOfflineTrade);
app.post('/api/admin/bazaar/items/:itemId/offline-accepted-trade', authMiddleware, velktradeCreateAcceptedOfflineTrade);

`;

  const lastRequire = [...server.matchAll(/^const .+require\(.+\);$/gm)].pop();
  if (lastRequire) {
    server = server.slice(0, lastRequire.index + lastRequire[0].length) + helperBlock + server.slice(lastRequire.index + lastRequire[0].length);
  } else {
    server = helperBlock + server;
  }

  const firstRoute = server.search(/\napp\.(get|post|put|patch|delete|use)\(/);
  if (firstRoute !== -1) {
    server = server.slice(0, firstRoute) + '\n' + routeBlock + server.slice(firstRoute);
  } else {
    server += '\n' + routeBlock;
  }

  write(serverPath, server);
  console.log('Patched backend/server.js.');
}

// Frontend helper injection into App.jsx where safe.
const appPath = path.join(root, 'frontend/src/App.jsx');
let app = read(appPath);

if (app && !app.includes('createAcceptedBazaarOfflineTrade')) {
  const helper = `

  async function adminRemoveBazaarListing(item) {
    const itemId = item?.id || item?.itemId;
    if (!itemId) return;
    if (!window.confirm('Remove this listing from the Bazaar?')) return;

    await api('/api/admin/bazaar/items/' + encodeURIComponent(itemId), {
      method: 'DELETE'
    });

    if (typeof loadBazaarItems === 'function') {
      await loadBazaarItems();
    }
  }

  async function createAcceptedBazaarOfflineTrade(item) {
    const itemId = item?.id || item?.itemId;
    if (!itemId) return;

    const rawIc = window.prompt('IC amount from buyer:', item?.price || '');
    const icAmount = Number(rawIc);

    if (!Number.isFinite(icAmount) || icAmount <= 0) {
      alert('Enter a valid IC amount.');
      return;
    }

    await api('/api/bazaar/items/' + encodeURIComponent(itemId) + '/offline-accepted-trade', {
      method: 'POST',
      body: JSON.stringify({ icAmount })
    });

    alert('Offline trade created. Seller must confirm.');
  }
`;

  app = app.replace(/\n\s*return\s*\(/, helper + '\n\n  return (');
  write(appPath, app);
  console.log('Injected App.jsx bazaar helper functions.');
}

console.log('VelkTrade bazaar/trade/mosaic/online/privacy patch applied.');
