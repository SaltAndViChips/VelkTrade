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
  if (current.includes(marker)) {
    console.log(`Already patched: ${file}`);
    return;
  }
  current += `\n\n${marker}\n${content}\n`;
  write(file, current);
  console.log(`Patched: ${file}`);
}

const cssPath = path.join(root, 'frontend/src/styles.css');
const overridePath = path.join(root, 'patches/responsive-mobile-overrides.css');
const cssOverrides = read(overridePath);

if (!cssOverrides) {
  throw new Error('Missing patches/responsive-mobile-overrides.css');
}

appendOnce(
  cssPath,
  '/* === VelkTrade responsive item previews + mobile accessibility patch === */',
  cssOverrides
);

const serverPath = path.join(root, 'backend/server.js');
let server = read(serverPath);

if (!server) {
  console.warn('backend/server.js not found; skipped backend route patch.');
} else if (server.includes('velktradeOnlineToggleVisibilityHandler')) {
  console.log('Online toggle route already patched.');
} else {
  const helper = `

// === VelkTrade online toggle compatibility patch ===
async function velktradeEnsureShowOnlineColumn() {
  const attempts = [
    async () => typeof run === 'function' && run('ALTER TABLE users ADD COLUMN IF NOT EXISTS show_online BOOLEAN DEFAULT TRUE'),
    async () => typeof run === 'function' && run('ALTER TABLE users ADD COLUMN show_online BOOLEAN DEFAULT TRUE'),
    async () => typeof query === 'function' && query('ALTER TABLE users ADD COLUMN IF NOT EXISTS show_online BOOLEAN DEFAULT TRUE'),
    async () => typeof pool !== 'undefined' && pool?.query && pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS show_online BOOLEAN DEFAULT TRUE'),
    async () => typeof db !== 'undefined' && db?.query && db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS show_online BOOLEAN DEFAULT TRUE')
  ];

  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result !== false) return;
    } catch {
      // Duplicate-column or unsupported SQL is safe to ignore here.
    }
  }
}

async function velktradeSetShowOnline(userId, showOnline) {
  const attempts = [
    async () => typeof run === 'function' && run('UPDATE users SET show_online = $1 WHERE id = $2', [showOnline, userId]),
    async () => typeof run === 'function' && run('UPDATE users SET show_online = ? WHERE id = ?', [showOnline, userId]),
    async () => typeof query === 'function' && query('UPDATE users SET show_online = $1 WHERE id = $2', [showOnline, userId]),
    async () => typeof pool !== 'undefined' && pool?.query && pool.query('UPDATE users SET show_online = $1 WHERE id = $2', [showOnline, userId]),
    async () => typeof db !== 'undefined' && db?.query && db.query('UPDATE users SET show_online = $1 WHERE id = $2', [showOnline, userId])
  ];

  let lastError;
  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result !== false) return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('No database update helper was available for show_online.');
}

async function velktradeOnlineToggleVisibilityHandler(req, res) {
  try {
    const rawValue =
      req.body?.showOnline ??
      req.body?.show_online ??
      req.body?.online ??
      req.body?.enabled ??
      true;

    const showOnline = rawValue === true || rawValue === 'true' || rawValue === 1 || rawValue === '1';
    const userId = req.user?.id || req.userId || req.session?.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    await velktradeEnsureShowOnlineColumn();
    await velktradeSetShowOnline(userId, showOnline);

    if (typeof onlineUsers !== 'undefined' && onlineUsers?.has?.(userId)) {
      const current = onlineUsers.get(userId);
      onlineUsers.set(userId, {
        ...current,
        showOnline,
        show_online: showOnline
      });

      if (typeof broadcastPresence === 'function') {
        broadcastPresence();
      }
    }

    res.json({
      ok: true,
      showOnline,
      show_online: showOnline,
      online: showOnline
    });
  } catch (error) {
    console.error('Online visibility toggle failed:', error);
    res.status(500).json({ error: error.message || 'Failed to update online visibility' });
  }
}

`;

  const routeBlock = `
app.put('/api/me/online', authMiddleware, velktradeOnlineToggleVisibilityHandler);
app.post('/api/me/online', authMiddleware, velktradeOnlineToggleVisibilityHandler);
app.patch('/api/me/online', authMiddleware, velktradeOnlineToggleVisibilityHandler);
app.put('/api/profile/online', authMiddleware, velktradeOnlineToggleVisibilityHandler);
app.post('/api/profile/online', authMiddleware, velktradeOnlineToggleVisibilityHandler);
app.patch('/api/profile/online', authMiddleware, velktradeOnlineToggleVisibilityHandler);
app.put('/api/users/me/online', authMiddleware, velktradeOnlineToggleVisibilityHandler);
app.post('/api/users/me/online', authMiddleware, velktradeOnlineToggleVisibilityHandler);
app.patch('/api/users/me/online', authMiddleware, velktradeOnlineToggleVisibilityHandler);

`;

  const lastRequire = [...server.matchAll(/^const .+require\(.+\);$/gm)].pop();
  if (lastRequire) {
    server = server.slice(0, lastRequire.index + lastRequire[0].length) + helper + server.slice(lastRequire.index + lastRequire[0].length);
  } else {
    server = helper + server;
  }

  const firstRoute = server.search(/\napp\.(get|post|put|patch|delete)\(/);
  if (firstRoute !== -1) {
    server = server.slice(0, firstRoute) + '\n' + routeBlock + server.slice(firstRoute);
  } else {
    server += '\n' + routeBlock;
  }

  write(serverPath, server);
  console.log('Patched backend/server.js with online toggle endpoints.');
}

console.log('VelkTrade responsive/mobile + online toggle patch applied.');
