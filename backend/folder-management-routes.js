/*
  VelkTrade folder management compatibility routes.

  Adds bulk removal from folders and hardened folder deletion for the modern
  Inventory Tools folder workflow.
*/

const { get, all, run } = require('./db');

function installFolderManagementRoutes({ app, authMiddleware }) {
  if (!app || app.__velktradeFolderManagementRoutesInstalled) return;
  app.__velktradeFolderManagementRoutesInstalled = true;

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

  function normalizeIdList(value) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.map(item => Number(item)).filter(Number.isInteger).filter(item => item > 0))).slice(0, 500);
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
      CREATE TABLE IF NOT EXISTS item_folders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT DEFAULT '',
        icon TEXT DEFAULT '📁',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch(() => {});

    await run(`
      CREATE TABLE IF NOT EXISTS item_folder_assignments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
        folder_id INTEGER REFERENCES item_folders(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch(() => {});
  }

  async function audit(req, action, targetType, targetId, metadata = {}) {
    try {
      await run(
        `INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata) VALUES (?, ?, ?, ?, ?)`,
        [userId(req) || null, action, targetType || '', String(targetId || ''), JSON.stringify(metadata || {})]
      );
    } catch {}
  }

  async function loadOwnedItemIds(req, ids) {
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const rows = await all(`SELECT * FROM items WHERE id IN (${placeholders})`, ids).catch(() => []);
    return rows
      .filter(item => ownsItem(req, item) || isAdminOrDeveloper(req))
      .map(item => Number(item.id))
      .filter(Number.isInteger);
  }

  async function bulkRemoveFromFolder(req, res) {
    try {
      await ensureTables();
      const uid = userId(req);
      if (!uid) return res.status(401).json({ error: 'Not authenticated' });

      const ids = normalizeIdList(req.body?.itemIds || req.body?.ids || []);
      const folderId = req.body?.folderId || req.body?.folder_id || req.params.folderId;
      if (!ids.length) return res.status(400).json({ error: 'No selected item ids provided' });
      if (!validId(folderId)) return res.status(400).json({ error: 'Choose a valid folder first' });

      const folder = await get(`SELECT * FROM item_folders WHERE id = ? AND user_id = ?`, [Number(folderId), uid]);
      if (!folder) return res.status(404).json({ error: 'Folder not found' });

      const allowedIds = await loadOwnedItemIds(req, ids);
      if (!allowedIds.length) return res.status(403).json({ error: 'No allowed selected items found' });

      const placeholders = allowedIds.map(() => '?').join(', ');
      const result = await run(
        `DELETE FROM item_folder_assignments WHERE user_id = ? AND folder_id = ? AND item_id IN (${placeholders})`,
        [uid, Number(folderId), ...allowedIds]
      );

      const removed = Number(result?.rowCount || result?.changes || result?.affectedRows || allowedIds.length || 0);
      await run(`UPDATE item_folders SET updated_at = NOW() WHERE id = ? AND user_id = ?`, [Number(folderId), uid]).catch(() => {});
      await audit(req, 'inventory.bulk_folder_removed', 'item_folder', folderId, { count: removed, itemIds: allowedIds });

      res.json({ ok: true, removed, folderId: Number(folderId), itemIds: allowedIds, folder });
    } catch (error) {
      console.error('bulk folder remove failed:', error);
      res.status(500).json({ error: error.message || 'Failed to remove selected items from folder' });
    }
  }

  async function deleteFolder(req, res) {
    try {
      await ensureTables();
      const uid = userId(req);
      const id = req.params.id || req.params.folderId;
      if (!uid) return res.status(401).json({ error: 'Not authenticated' });
      if (!validId(id)) return res.status(400).json({ error: 'Invalid folder id' });

      const folder = await get(`SELECT * FROM item_folders WHERE id = ? AND user_id = ?`, [Number(id), uid]);
      if (!folder) return res.status(404).json({ error: 'Folder not found' });

      const assignmentResult = await run(`DELETE FROM item_folder_assignments WHERE folder_id = ? AND user_id = ?`, [Number(id), uid]).catch(() => null);
      await run(`DELETE FROM item_folders WHERE id = ? AND user_id = ?`, [Number(id), uid]);
      await audit(req, 'item_folder.deleted', 'item_folder', id, {
        name: folder.name,
        assignmentsRemoved: Number(assignmentResult?.rowCount || assignmentResult?.changes || assignmentResult?.affectedRows || 0)
      });

      res.json({ ok: true, id: Number(id), deleted: true, folder });
    } catch (error) {
      console.error('delete folder failed:', error);
      res.status(500).json({ error: error.message || 'Failed to delete folder' });
    }
  }

  app.post('/api/inventory/bulk-folder-remove', auth, bulkRemoveFromFolder);
  app.post('/api/items/bulk-folder-remove', auth, bulkRemoveFromFolder);
  app.post('/api/item-folders/:folderId/remove-items', auth, bulkRemoveFromFolder);
  app.delete('/api/item-folders/:id/hard-delete', auth, deleteFolder);
  app.delete('/api/inventory/folders/:id/hard-delete', auth, deleteFolder);
}

module.exports = installFolderManagementRoutes;
