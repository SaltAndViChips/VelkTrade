/*
  VelkTrade Inventory Bulk Tools + Cleanup routes.

  Roadmap step:
  Bulk Tools/Cleanup.
*/

const { get, all, run } = require('./db');

function installInventoryBulkCleanupRoutes({ app, authMiddleware }) {
  if (!app || app.__velktradeInventoryBulkCleanupRoutesInstalled) return;
  app.__velktradeInventoryBulkCleanupRoutesInstalled = true;

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

  function normalizeIdList(value) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.map(item => Number(item)).filter(Number.isInteger).filter(item => item > 0))).slice(0, 300);
  }

  async function ensureTables() {
    await run(`ALTER TABLE items ADD COLUMN IF NOT EXISTS show_bazaar BOOLEAN DEFAULT TRUE`).catch(() => {});
    await run(`ALTER TABLE items ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT FALSE`).catch(() => {});
    await run(`ALTER TABLE items ADD COLUMN IF NOT EXISTS trade_pending BOOLEAN DEFAULT FALSE`).catch(() => {});
    await run(`ALTER TABLE items ADD COLUMN IF NOT EXISTS cleanup_flag TEXT DEFAULT ''`).catch(() => {});
  }

  async function audit(req, action, targetType, targetId, metadata = {}) {
    try {
      await run(
        `INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata) VALUES (?, ?, ?, ?, ?)`,
        [userId(req) || null, action, targetType || '', String(targetId || ''), JSON.stringify(metadata || {})]
      );
    } catch {}
  }

  async function loadOwnedItems(req, ids) {
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const rows = await all(`SELECT * FROM items WHERE id IN (${placeholders})`, ids);
    return rows.filter(item => ownsItem(req, item) || isAdminOrDeveloper(req));
  }

  async function cleanupScan(req, res) {
    try {
      await ensureTables();
      const uid = userId(req);
      if (!uid) return res.status(401).json({ error: 'Not authenticated' });

      const items = await all(`SELECT * FROM items WHERE userId = ? OR userid = ? OR user_id = ? ORDER BY id DESC`, [uid, uid, uid]).catch(async () => {
        return all(`SELECT * FROM items WHERE userId = ? ORDER BY id DESC`, [uid]);
      });

      const byImage = new Map();
      const duplicateImages = [];
      const missingTitles = [];
      const missingImages = [];
      const blankPrices = [];
      const brokenImgurLinks = [];

      for (const item of items) {
        const id = item.id;
        const title = String(item.title || item.name || '').trim();
        const image = String(item.image || item.img || item.url || '').trim();
        const price = String(item.price || '').trim();

        if (!title) missingTitles.push({ id, title, image, price });
        if (!image) missingImages.push({ id, title, image, price });
        if (!price) blankPrices.push({ id, title, image, price });
        if (image && /imgur\.com/i.test(image) && !/i\.imgur\.com\/[^/]+\.(png|jpe?g|gif|webp)$/i.test(image)) {
          brokenImgurLinks.push({ id, title, image, price });
        }

        const key = image.toLowerCase().replace(/^https?:\/\//, '').replace(/\?.*$/, '');
        if (key) {
          if (!byImage.has(key)) byImage.set(key, []);
          byImage.get(key).push({ id, title, image, price });
        }
      }

      for (const group of byImage.values()) {
        if (group.length > 1) duplicateImages.push(group);
      }

      const summary = {
        totalItems: items.length,
        duplicateImageGroups: duplicateImages.length,
        missingTitles: missingTitles.length,
        missingImages: missingImages.length,
        blankPrices: blankPrices.length,
        brokenImgurLinks: brokenImgurLinks.length
      };

      await audit(req, 'inventory.cleanup_scanned', 'inventory', uid, summary);
      res.json({ ok: true, summary, duplicateImages, missingTitles, missingImages, blankPrices, brokenImgurLinks });
    } catch (error) {
      console.error('inventory cleanup scan failed:', error);
      res.status(500).json({ error: error.message || 'Failed to scan inventory' });
    }
  }

  async function bulkUpdate(req, res) {
    try {
      await ensureTables();
      const ids = normalizeIdList(req.body?.itemIds || req.body?.ids || []);
      if (!ids.length) return res.status(400).json({ error: 'No valid item ids provided' });

      const items = await loadOwnedItems(req, ids);
      if (!items.length) return res.status(403).json({ error: 'No allowed items found' });
      const allowedIds = items.map(item => Number(item.id));
      const placeholders = allowedIds.map(() => '?').join(', ');
      const updates = [];
      const params = [];
      const actions = {};

      if (req.body?.price !== undefined) {
        updates.push('price = ?');
        params.push(String(req.body.price || '').slice(0, 80));
        actions.price = String(req.body.price || '').slice(0, 80);
      }
      if (req.body?.showBazaar !== undefined || req.body?.show_bazaar !== undefined) {
        updates.push('show_bazaar = ?');
        params.push(Boolean(req.body.showBazaar ?? req.body.show_bazaar));
        actions.showBazaar = Boolean(req.body.showBazaar ?? req.body.show_bazaar);
      }
      if (req.body?.locked !== undefined) {
        updates.push('locked = ?');
        params.push(Boolean(req.body.locked));
        actions.locked = Boolean(req.body.locked);
      }
      if (req.body?.cleanupFlag !== undefined || req.body?.cleanup_flag !== undefined) {
        updates.push('cleanup_flag = ?');
        params.push(String(req.body.cleanupFlag ?? req.body.cleanup_flag ?? '').slice(0, 120));
        actions.cleanupFlag = String(req.body.cleanupFlag ?? req.body.cleanup_flag ?? '').slice(0, 120);
      }

      if (!updates.length) return res.status(400).json({ error: 'No supported bulk updates provided' });

      await run(`UPDATE items SET ${updates.join(', ')} WHERE id IN (${placeholders})`, [...params, ...allowedIds]);
      await audit(req, 'inventory.bulk_updated', 'items', allowedIds.join(','), { count: allowedIds.length, actions });
      res.json({ ok: true, updated: allowedIds.length, itemIds: allowedIds, actions });
    } catch (error) {
      console.error('bulk update inventory failed:', error);
      res.status(500).json({ error: error.message || 'Failed to bulk update items' });
    }
  }

  async function bulkDelete(req, res) {
    try {
      const ids = normalizeIdList(req.body?.itemIds || req.body?.ids || []);
      if (!ids.length) return res.status(400).json({ error: 'No valid item ids provided' });
      const items = await loadOwnedItems(req, ids);
      if (!items.length) return res.status(403).json({ error: 'No allowed items found' });
      const allowedIds = items.map(item => Number(item.id));
      const placeholders = allowedIds.map(() => '?').join(', ');

      await run(`DELETE FROM buy_requests WHERE item_id IN (${placeholders})`, allowedIds).catch(() => {});
      await run(`DELETE FROM items WHERE id IN (${placeholders})`, allowedIds);
      await audit(req, 'inventory.bulk_deleted', 'items', allowedIds.join(','), { count: allowedIds.length });
      res.json({ ok: true, deleted: allowedIds.length, itemIds: allowedIds });
    } catch (error) {
      console.error('bulk delete inventory failed:', error);
      res.status(500).json({ error: error.message || 'Failed to bulk delete items' });
    }
  }

  async function bulkAssignFolder(req, res) {
    try {
      const ids = normalizeIdList(req.body?.itemIds || req.body?.ids || []);
      const folderId = Number(req.body?.folderId || req.body?.folder_id || 0);
      const uid = userId(req);
      if (!uid) return res.status(401).json({ error: 'Not authenticated' });
      if (!ids.length) return res.status(400).json({ error: 'No valid item ids provided' });
      if (!validId(folderId)) return res.status(400).json({ error: 'Invalid folder id' });
      const folder = await get(`SELECT * FROM item_folders WHERE id = ? AND user_id = ?`, [folderId, uid]);
      if (!folder) return res.status(404).json({ error: 'Folder not found' });
      const items = await loadOwnedItems(req, ids);
      const allowedIds = items.map(item => Number(item.id));
      for (const id of allowedIds) {
        await run(`INSERT INTO item_folder_assignments (user_id, item_id, folder_id) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`, [uid, id, folderId]).catch(() => {});
      }
      await audit(req, 'inventory.bulk_folder_assigned', 'item_folder', folderId, { count: allowedIds.length, itemIds: allowedIds });
      res.json({ ok: true, assigned: allowedIds.length, folder, itemIds: allowedIds });
    } catch (error) {
      console.error('bulk folder assign failed:', error);
      res.status(500).json({ error: error.message || 'Failed to bulk assign folder' });
    }
  }

  app.get('/api/inventory/cleanup-scan', auth, cleanupScan);
  app.get('/api/inventory/cleanup', auth, cleanupScan);
  app.post('/api/inventory/bulk-update', auth, bulkUpdate);
  app.post('/api/items/bulk-update', auth, bulkUpdate);
  app.post('/api/inventory/bulk-delete', auth, bulkDelete);
  app.post('/api/items/bulk-delete', auth, bulkDelete);
  app.post('/api/inventory/bulk-folder', auth, bulkAssignFolder);
  app.post('/api/items/bulk-folder', auth, bulkAssignFolder);
}

module.exports = installInventoryBulkCleanupRoutes;
