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

const cssPatch = read(path.join(root, 'patches/unified-item-experience.css'));
appendOnce(
  path.join(root, 'frontend/src/styles.css'),
  '/* === VelkTrade unified item experience + player menu fix patch === */',
  cssPatch
);

const appPath = path.join(root, 'frontend/src/App.jsx');
let app = read(appPath);

if (app && !app.includes("UnifiedItemExperience")) {
  const importLine = "import UnifiedItemExperience from './components/UnifiedItemExperience.jsx';";
  const imports = [...app.matchAll(/^import .+;$/gm)];
  if (imports.length) {
    const last = imports[imports.length - 1];
    app = app.slice(0, last.index + last[0].length) + "\n" + importLine + app.slice(last.index + last[0].length);
  } else {
    app = importLine + "\n" + app;
  }

  const renderBlock = `
      {user && (
        <UnifiedItemExperience currentUser={user} />
      )}

`;

  const dndOpen = `    <DndContext
      sensors={sensors}
      collisionDetection={tradeCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragItem(null)}
    >`;

  if (app.includes(dndOpen)) {
    app = app.replace(dndOpen, dndOpen + "\n" + renderBlock);
  } else if (app.includes('<div className="app">')) {
    app = app.replace('<div className="app">', '<div className="app">\\n' + renderBlock);
  } else {
    app = app.replace(/\n\s*return\s*\(/, '\n  return (\\n' + renderBlock);
  }

  write(appPath, app);
  console.log('Patched App.jsx with UnifiedItemExperience.');
}

const serverPath = path.join(root, 'backend/server.js');
let server = read(serverPath);

if (!server) {
  console.warn('backend/server.js missing; skipped backend patch.');
} else if (server.includes('velktradeUnifiedItemExperiencePatch')) {
  console.log('Backend already patched.');
} else {
  const helper = `

// === velktradeUnifiedItemExperiencePatch ===
function vtCurrentUserId(req) {
  return req.user?.id || req.userId || req.session?.user?.id || req.session?.userId;
}

function vtIsAdmin(req) {
  return Boolean(req.user?.isAdmin || req.user?.is_admin || req.user?.isDeveloper || req.user?.is_developer || req.user?.role === 'admin' || req.user?.role === 'developer');
}

function vtBool(value, fallback = true) {
  if (value === undefined || value === null) return fallback;
  return value === true || value === 'true' || value === 1 || value === '1';
}

async function vtTryDb(attempts) {
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

async function vtEnsureColumns() {
  try {
    await vtTryDb([
      () => typeof run === 'function' && run('ALTER TABLE users ADD COLUMN IF NOT EXISTS show_online BOOLEAN DEFAULT TRUE'),
      () => typeof query === 'function' && query('ALTER TABLE users ADD COLUMN IF NOT EXISTS show_online BOOLEAN DEFAULT TRUE'),
      () => typeof pool !== 'undefined' && pool?.query && pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS show_online BOOLEAN DEFAULT TRUE')
    ]);
  } catch {}

  try {
    await vtTryDb([
      () => typeof run === 'function' && run('ALTER TABLE items ADD COLUMN IF NOT EXISTS trade_pending BOOLEAN DEFAULT FALSE'),
      () => typeof query === 'function' && query('ALTER TABLE items ADD COLUMN IF NOT EXISTS trade_pending BOOLEAN DEFAULT FALSE'),
      () => typeof pool !== 'undefined' && pool?.query && pool.query('ALTER TABLE items ADD COLUMN IF NOT EXISTS trade_pending BOOLEAN DEFAULT FALSE')
    ]);
  } catch {}
}

async function vtGetItem(itemId) {
  const result = await vtTryDb([
    () => typeof get === 'function' && get('SELECT * FROM items WHERE id = $1', [itemId]),
    () => typeof get === 'function' && get('SELECT * FROM items WHERE id = ?', [itemId]),
    () => typeof query === 'function' && query('SELECT * FROM items WHERE id = $1', [itemId]),
    () => typeof pool !== 'undefined' && pool?.query && pool.query('SELECT * FROM items WHERE id = $1', [itemId])
  ]);

  if (Array.isArray(result?.rows)) return result.rows[0];
  if (Array.isArray(result)) return result[0];
  return result;
}

function vtOwnsItem(req, item) {
  const userId = String(vtCurrentUserId(req) || '');
  const ownerId = String(item?.user_id ?? item?.userid ?? item?.userId ?? item?.owner_id ?? item?.ownerId ?? '');
  return Boolean(userId && ownerId && userId === ownerId);
}

async function vtOnlineToggle(req, res) {
  try {
    const userId = vtCurrentUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    await vtEnsureColumns();

    const showOnline = vtBool(req.body?.showOnline ?? req.body?.show_online ?? req.body?.online ?? req.body?.enabled, true);

    await vtTryDb([
      () => typeof run === 'function' && run('UPDATE users SET show_online = $1 WHERE id = $2', [showOnline, userId]),
      () => typeof run === 'function' && run('UPDATE users SET show_online = ? WHERE id = ?', [showOnline, userId]),
      () => typeof query === 'function' && query('UPDATE users SET show_online = $1 WHERE id = $2', [showOnline, userId]),
      () => typeof pool !== 'undefined' && pool?.query && pool.query('UPDATE users SET show_online = $1 WHERE id = $2', [showOnline, userId])
    ]);

    if (typeof onlineUsers !== 'undefined' && onlineUsers?.has?.(userId)) {
      const current = onlineUsers.get(userId);
      onlineUsers.set(userId, { ...current, showOnline, show_online: showOnline });
      if (typeof broadcastPresence === 'function') broadcastPresence();
    }

    res.json({ ok: true, showOnline, show_online: showOnline, online: showOnline });
  } catch (error) {
    console.error('Online toggle failed:', error);
    res.status(500).json({ error: error.message || 'Failed to update online toggle' });
  }
}

async function vtUpdateItemPrice(req, res) {
  try {
    const itemId = req.params.itemId || req.params.id;
    const price = req.body?.price ?? req.body?.ic ?? req.body?.value ?? '';

    const item = await vtGetItem(itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (!vtIsAdmin(req) && !vtOwnsItem(req, item)) return res.status(403).json({ error: 'Not allowed' });

    await vtTryDb([
      () => typeof run === 'function' && run('UPDATE items SET price = $1 WHERE id = $2', [price, itemId]),
      () => typeof run === 'function' && run('UPDATE items SET price = ? WHERE id = ?', [price, itemId]),
      () => typeof query === 'function' && query('UPDATE items SET price = $1 WHERE id = $2', [price, itemId]),
      () => typeof pool !== 'undefined' && pool?.query && pool.query('UPDATE items SET price = $1 WHERE id = $2', [price, itemId])
    ]);

    res.json({ ok: true, itemId, price });
  } catch (error) {
    console.error('Update item price failed:', error);
    res.status(500).json({ error: error.message || 'Failed to update item price' });
  }
}

async function vtRemoveItem(req, res) {
  try {
    const itemId = req.params.itemId || req.params.id;
    const item = await vtGetItem(itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (!vtIsAdmin(req) && !vtOwnsItem(req, item)) return res.status(403).json({ error: 'Not allowed' });

    await vtTryDb([
      () => typeof run === 'function' && run('UPDATE items SET price = NULL, trade_pending = TRUE WHERE id = $1', [itemId]),
      () => typeof run === 'function' && run('UPDATE items SET price = ?, trade_pending = ? WHERE id = ?', [null, true, itemId]),
      () => typeof query === 'function' && query('UPDATE items SET price = NULL, trade_pending = TRUE WHERE id = $1', [itemId]),
      () => typeof pool !== 'undefined' && pool?.query && pool.query('UPDATE items SET price = NULL, trade_pending = TRUE WHERE id = $1', [itemId])
    ]);

    res.json({ ok: true, itemId, removed: true });
  } catch (error) {
    console.error('Remove item failed:', error);
    res.status(500).json({ error: error.message || 'Failed to remove item' });
  }
}

async function vtAddInterest(req, res) {
  try {
    const itemId = req.params.itemId || req.params.id;
    const userId = vtCurrentUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    await vtTryDb([
      () => typeof run === 'function' && run('INSERT INTO buy_requests (item_id, buyer_id, created_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING', [itemId, userId]),
      () => typeof run === 'function' && run('INSERT OR IGNORE INTO buy_requests (item_id, buyer_id, created_at) VALUES (?, ?, ?)', [itemId, userId, new Date().toISOString()]),
      () => typeof query === 'function' && query('INSERT INTO buy_requests (item_id, buyer_id, created_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING', [itemId, userId]),
      () => typeof pool !== 'undefined' && pool?.query && pool.query('INSERT INTO buy_requests (item_id, buyer_id, created_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING', [itemId, userId])
    ]);

    res.json({ ok: true, itemId, interested: true });
  } catch (error) {
    console.error('Add interest failed:', error);
    res.status(500).json({ error: error.message || 'Failed to add interest' });
  }
}

async function vtRemoveInterest(req, res) {
  try {
    const itemId = req.params.itemId || req.params.id;
    const userId = vtCurrentUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    await vtTryDb([
      () => typeof run === 'function' && run('DELETE FROM buy_requests WHERE item_id = $1 AND buyer_id = $2', [itemId, userId]),
      () => typeof run === 'function' && run('DELETE FROM buy_requests WHERE item_id = ? AND buyer_id = ?', [itemId, userId]),
      () => typeof query === 'function' && query('DELETE FROM buy_requests WHERE item_id = $1 AND buyer_id = $2', [itemId, userId]),
      () => typeof pool !== 'undefined' && pool?.query && pool.query('DELETE FROM buy_requests WHERE item_id = $1 AND buyer_id = $2', [itemId, userId])
    ]);

    res.json({ ok: true, itemId, interested: false });
  } catch (error) {
    console.error('Remove interest failed:', error);
    res.status(500).json({ error: error.message || 'Failed to remove interest' });
  }
}

async function vtGetInterest(req, res) {
  try {
    const itemId = req.params.itemId || req.params.id;

    const result = await vtTryDb([
      () => typeof query === 'function' && query('SELECT u.id, u.username, u.is_verified FROM buy_requests br JOIN users u ON u.id = br.buyer_id WHERE br.item_id = $1', [itemId]),
      () => typeof pool !== 'undefined' && pool?.query && pool.query('SELECT u.id, u.username, u.is_verified FROM buy_requests br JOIN users u ON u.id = br.buyer_id WHERE br.item_id = $1', [itemId])
    ]);

    res.json({ users: result?.rows || [] });
  } catch (error) {
    res.json({ users: [] });
  }
}

async function vtInstantTrade(req, res) {
  try {
    const itemId = req.params.itemId || req.params.id;
    const item = await vtGetItem(itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (!vtIsAdmin(req) && !vtOwnsItem(req, item)) return res.status(403).json({ error: 'Not allowed' });

    await vtEnsureColumns();

    await vtTryDb([
      () => typeof run === 'function' && run('UPDATE items SET trade_pending = TRUE WHERE id = $1', [itemId]),
      () => typeof run === 'function' && run('UPDATE items SET trade_pending = ? WHERE id = ?', [true, itemId]),
      () => typeof query === 'function' && query('UPDATE items SET trade_pending = TRUE WHERE id = $1', [itemId]),
      () => typeof pool !== 'undefined' && pool?.query && pool.query('UPDATE items SET trade_pending = TRUE WHERE id = $1', [itemId])
    ]);

    res.json({ ok: true, itemId, tradePending: true, status: 'seller_pending_confirm' });
  } catch (error) {
    console.error('Instant trade failed:', error);
    res.status(500).json({ error: error.message || 'Failed to create instant trade' });
  }
}

`;

  const routes = `
app.put('/api/me/online', authMiddleware, vtOnlineToggle);
app.post('/api/me/online', authMiddleware, vtOnlineToggle);
app.patch('/api/me/online', authMiddleware, vtOnlineToggle);
app.put('/api/profile/online', authMiddleware, vtOnlineToggle);
app.post('/api/profile/online', authMiddleware, vtOnlineToggle);
app.patch('/api/profile/online', authMiddleware, vtOnlineToggle);
app.put('/api/users/me/online', authMiddleware, vtOnlineToggle);
app.post('/api/users/me/online', authMiddleware, vtOnlineToggle);
app.patch('/api/users/me/online', authMiddleware, vtOnlineToggle);
app.put('/api/inventory/online', authMiddleware, vtOnlineToggle);
app.post('/api/inventory/online', authMiddleware, vtOnlineToggle);
app.patch('/api/inventory/online', authMiddleware, vtOnlineToggle);

app.put('/api/items/:itemId/price', authMiddleware, vtUpdateItemPrice);
app.patch('/api/items/:itemId/price', authMiddleware, vtUpdateItemPrice);
app.post('/api/items/:itemId/price', authMiddleware, vtUpdateItemPrice);
app.delete('/api/items/:itemId', authMiddleware, vtRemoveItem);
app.post('/api/items/:itemId/remove', authMiddleware, vtRemoveItem);
app.get('/api/items/:itemId/interest', authMiddleware, vtGetInterest);
app.post('/api/items/:itemId/interest', authMiddleware, vtAddInterest);
app.delete('/api/items/:itemId/interest', authMiddleware, vtRemoveInterest);
app.post('/api/items/:itemId/instant-trade', authMiddleware, vtInstantTrade);
app.post('/api/bazaar/items/:itemId/instant-trade', authMiddleware, vtInstantTrade);
app.post('/api/bazaar/items/:itemId/trade-pending', authMiddleware, vtInstantTrade);

`;

  const lastRequire = [...server.matchAll(/^const .+require\(.+\);$/gm)].pop();
  if (lastRequire) {
    server = server.slice(0, lastRequire.index + lastRequire[0].length) + helper + server.slice(lastRequire.index + lastRequire[0].length);
  } else {
    server = helper + server;
  }

  const firstRoute = server.search(/\napp\.(get|post|put|patch|delete|use)\(/);
  if (firstRoute !== -1) {
    server = server.slice(0, firstRoute) + '\n' + routes + server.slice(firstRoute);
  } else {
    server += '\n' + routes;
  }

  write(serverPath, server);
  console.log('Patched backend/server.js.');
}

console.log('VelkTrade unified item experience patch applied.');
