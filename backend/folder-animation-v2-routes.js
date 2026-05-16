/*
  Folder animation v2 compatibility routes.
  Installed before the original folder routes so 10 animation presets + none are accepted.
*/

const { get, run } = require('./db');

const VALID_ANIMATIONS = new Set([
  'popout', 'fan', 'cascade', 'portal', 'bounce',
  'slide', 'flip', 'zoom', 'spiral', 'shuffle',
  'none'
]);

const VALID_ICONS = new Set(['📁', '🗂️', '📦', '🧰', '🏷️', '⭐', '✨', '🔥', '💎', '🪐', '🌌', '☄️', '🌙', '☀️', '⚔️', '🛡️', '🏹', '🎯', '💣', '☠️', '👑', '💰', '🪙', '⚡', '🔮', '🧪', '🧬', '🕯️', '✦', '◆', '◇', '★', '☢', '☣', 'Ω', 'α', 'β', 'Δ', '#', '$', 'IC', 'S', 'A', 'B', 'C']);

function cleanAnimation(value) {
  const clean = String(value || 'popout').trim().toLowerCase();
  return VALID_ANIMATIONS.has(clean) ? clean : 'popout';
}

function cleanIcon(value) {
  const clean = String(value || '📁').trim().slice(0, 6);
  return VALID_ICONS.has(clean) ? clean : '📁';
}

function userId(req) {
  return Number(req.user?.id || req.userId || req.session?.user?.id || req.session?.userId || 0);
}

async function ensureFolderAnimationColumn() {
  await run(`ALTER TABLE item_folders ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '📁'`).catch(() => {});
  await run(`ALTER TABLE item_folders ADD COLUMN IF NOT EXISTS color TEXT DEFAULT ''`).catch(() => {});
  await run(`ALTER TABLE item_folders ADD COLUMN IF NOT EXISTS animation TEXT DEFAULT 'popout'`).catch(() => {});
}

function installFolderAnimationV2Routes({ app, authMiddleware }) {
  if (!app || app.__velktradeFolderAnimationV2RoutesInstalled) return;
  app.__velktradeFolderAnimationV2RoutesInstalled = true;

  const auth = authMiddleware || ((_req, _res, next) => next());

  async function createFolder(req, res) {
    try {
      await ensureFolderAnimationColumn();
      const uid = userId(req);
      if (!uid) return res.status(401).json({ error: 'Not authenticated' });

      const name = String(req.body?.name || '').trim().slice(0, 80);
      const color = String(req.body?.color || '').trim().slice(0, 40);
      const icon = cleanIcon(req.body?.icon);
      const animation = cleanAnimation(req.body?.animation);
      if (!name) return res.status(400).json({ error: 'Folder name is required' });

      const result = await run(
        `INSERT INTO item_folders (user_id, name, color, icon, animation, updated_at) VALUES (?, ?, ?, ?, ?, NOW()) RETURNING id`,
        [uid, name, color, icon, animation]
      );
      const id = result.rows?.[0]?.id || result.lastID;
      res.json({ ok: true, folder: { id, user_id: uid, name, color, icon, animation, itemCount: 0 } });
    } catch (error) {
      console.error('folder animation v2 create failed:', error);
      res.status(500).json({ error: error.message || 'Failed to create folder' });
    }
  }

  async function updateFolder(req, res) {
    try {
      await ensureFolderAnimationColumn();
      const uid = userId(req);
      const id = Number(req.params.id);
      if (!uid) return res.status(401).json({ error: 'Not authenticated' });
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid folder id' });

      const existing = await get(`SELECT * FROM item_folders WHERE id = ? AND user_id = ?`, [id, uid]);
      if (!existing) return res.status(404).json({ error: 'Folder not found' });

      const name = req.body?.name !== undefined ? String(req.body.name || '').trim().slice(0, 80) : existing.name;
      const color = req.body?.color !== undefined ? String(req.body.color || '').trim().slice(0, 40) : existing.color;
      const icon = req.body?.icon !== undefined ? cleanIcon(req.body.icon) : cleanIcon(existing.icon);
      const animation = req.body?.animation !== undefined ? cleanAnimation(req.body.animation) : cleanAnimation(existing.animation);
      if (!name) return res.status(400).json({ error: 'Folder name is required' });

      await run(
        `UPDATE item_folders SET name = ?, color = ?, icon = ?, animation = ?, updated_at = NOW() WHERE id = ? AND user_id = ?`,
        [name, color, icon, animation, id, uid]
      );
      res.json({ ok: true, folder: { ...existing, id, name, color, icon, animation } });
    } catch (error) {
      console.error('folder animation v2 update failed:', error);
      res.status(500).json({ error: error.message || 'Failed to update folder' });
    }
  }

  app.post('/api/item-folders', auth, createFolder);
  app.post('/api/inventory/folders', auth, createFolder);
  app.put('/api/item-folders/:id', auth, updateFolder);
  app.patch('/api/item-folders/:id', auth, updateFolder);
  app.put('/api/inventory/folders/:id', auth, updateFolder);
  app.patch('/api/inventory/folders/:id', auth, updateFolder);
}

module.exports = installFolderAnimationV2Routes;
