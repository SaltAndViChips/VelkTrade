/*
  VelkTrade Item Folders + Private Notes routes.

  Roadmap step:
  Inventory Folders/Notes.
*/

const { get, all, run } = require('./db');

const FOLDER_ICONS = new Set(['📁', '🗂️', '📦', '🧰', '🏷️', '⭐', '✨', '🔥', '💎', '🪐', '🌌', '☄️', '🌙', '☀️', '⚔️', '🛡️', '🏹', '🎯', '💣', '☠️', '👑', '💰', '🪙', '⚡', '🔮', '🧪', '🧬', '🕯️', '✦', '◆', '◇', '★', '☢', '☣', 'Ω', 'α', 'β', 'Δ', '#', '$', 'IC', 'S', 'A', 'B', 'C']);
function cleanIcon(value) {
  const icon = String(value || '📁').trim().slice(0, 6);
  return FOLDER_ICONS.has(icon) ? icon : '📁';
}

function installItemFolderNoteRoutes({ app, authMiddleware }) {
  if (!app || app.__velktradeItemFolderNoteRoutesInstalled) return;
  app.__velktradeItemFolderNoteRoutesInstalled = true;

  const auth = authMiddleware || ((_req, _res, next) => next());

  function userId(req) { return Number(req.user?.id || req.userId || req.session?.user?.id || req.session?.userId || 0); }
  function username(req) { return String(req.user?.username || req.session?.user?.username || '').trim().toLowerCase(); }
  function isAdminOrDeveloper(req) {
    const name = username(req);
    return Boolean(req.user?.isAdmin || req.user?.is_admin || req.user?.admin || req.user?.isDeveloper || req.user?.is_developer || req.user?.developer || req.user?.role === 'admin' || req.user?.role === 'developer' || req.user?.rank === 'admin' || req.user?.rank === 'developer' || name === 'salt' || name === 'velkon');
  }
  function validId(value) { return /^\d+$/.test(String(value || '').trim()); }
  function itemOwnerId(item) { return item?.userId ?? item?.userid ?? item?.user_id ?? item?.ownerId ?? item?.owner_id ?? null; }
  function ownsItem(req, item) { const owner = Number(itemOwnerId(item)); return Boolean(owner && owner === userId(req)); }

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
    `);
    await run(`ALTER TABLE item_folders ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '📁'`).catch(() => {});

    await run(`
      CREATE TABLE IF NOT EXISTS item_folder_assignments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
        folder_id INTEGER REFERENCES item_folders(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS item_private_notes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
        note TEXT DEFAULT '',
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (user_id, item_id)
      )
    `);
  }

  async function audit(req, action, targetType, targetId, metadata = {}) {
    try { await run(`INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata) VALUES (?, ?, ?, ?, ?)`, [userId(req) || null, action, targetType || '', String(targetId || ''), JSON.stringify(metadata || {})]); } catch {}
  }

  async function loadItem(itemId) { return get('SELECT * FROM items WHERE id = ?', [Number(itemId)]); }
  async function requireOwnedItem(req, res, itemId, allowAdmin = false) {
    if (!validId(itemId)) { res.status(400).json({ error: 'Invalid item id' }); return null; }
    const item = await loadItem(itemId);
    if (!item) { res.status(404).json({ error: 'Item not found' }); return null; }
    if (!ownsItem(req, item) && !(allowAdmin && isAdminOrDeveloper(req))) { res.status(403).json({ error: 'Not allowed' }); return null; }
    return item;
  }

  async function listFolders(req, res) {
    try {
      await ensureTables();
      const uid = userId(req);
      if (!uid) return res.status(401).json({ error: 'Not authenticated' });
      const rows = await all(`
        SELECT f.*, COALESCE(f.icon, '📁') AS icon, COUNT(a.id) AS "itemCount"
        FROM item_folders f
        LEFT JOIN item_folder_assignments a ON a.folder_id = f.id
        WHERE f.user_id = ?
        GROUP BY f.id
        ORDER BY f.updated_at DESC, f.name ASC
      `, [uid]);
      res.json({ ok: true, folders: rows });
    } catch (error) { console.error('list item folders failed:', error); res.status(500).json({ error: error.message || 'Failed to load folders' }); }
  }

  async function createFolder(req, res) {
    try {
      await ensureTables();
      const uid = userId(req);
      if (!uid) return res.status(401).json({ error: 'Not authenticated' });
      const name = String(req.body?.name || '').trim().slice(0, 80);
      const color = String(req.body?.color || '').trim().slice(0, 40);
      const icon = cleanIcon(req.body?.icon);
      if (!name) return res.status(400).json({ error: 'Folder name is required' });
      const result = await run(`INSERT INTO item_folders (user_id, name, color, icon, updated_at) VALUES (?, ?, ?, ?, NOW()) RETURNING id`, [uid, name, color, icon]);
      const id = result.rows?.[0]?.id || result.lastID;
      await audit(req, 'item_folder.created', 'item_folder', id, { name, color, icon });
      res.json({ ok: true, folder: { id, name, color, icon, itemCount: 0 } });
    } catch (error) { console.error('create item folder failed:', error); res.status(500).json({ error: error.message || 'Failed to create folder' }); }
  }

  async function updateFolder(req, res) {
    try {
      await ensureTables();
      const uid = userId(req); const id = req.params.id;
      if (!uid) return res.status(401).json({ error: 'Not authenticated' });
      if (!validId(id)) return res.status(400).json({ error: 'Invalid folder id' });
      const existing = await get(`SELECT * FROM item_folders WHERE id = ? AND user_id = ?`, [Number(id), uid]);
      if (!existing) return res.status(404).json({ error: 'Folder not found' });
      const name = req.body?.name !== undefined ? String(req.body.name || '').trim().slice(0, 80) : existing.name;
      const color = req.body?.color !== undefined ? String(req.body.color || '').trim().slice(0, 40) : existing.color;
      const icon = req.body?.icon !== undefined ? cleanIcon(req.body.icon) : cleanIcon(existing.icon);
      if (!name) return res.status(400).json({ error: 'Folder name is required' });
      await run(`UPDATE item_folders SET name = ?, color = ?, icon = ?, updated_at = NOW() WHERE id = ? AND user_id = ?`, [name, color, icon, Number(id), uid]);
      await audit(req, 'item_folder.updated', 'item_folder', id, { name, color, icon });
      res.json({ ok: true, folder: { ...existing, id: Number(id), name, color, icon } });
    } catch (error) { console.error('update item folder failed:', error); res.status(500).json({ error: error.message || 'Failed to update folder' }); }
  }

  async function deleteFolder(req, res) {
    try {
      await ensureTables();
      const uid = userId(req); const id = req.params.id;
      if (!uid) return res.status(401).json({ error: 'Not authenticated' });
      if (!validId(id)) return res.status(400).json({ error: 'Invalid folder id' });
      await run(`DELETE FROM item_folder_assignments WHERE folder_id = ? AND user_id = ?`, [Number(id), uid]).catch(() => {});
      await run(`DELETE FROM item_folders WHERE id = ? AND user_id = ?`, [Number(id), uid]);
      await audit(req, 'item_folder.deleted', 'item_folder', id, {});
      res.json({ ok: true, id: Number(id), deleted: true });
    } catch (error) { console.error('delete item folder failed:', error); res.status(500).json({ error: error.message || 'Failed to delete folder' }); }
  }

  async function getItemOrganization(req, res) {
    try {
      await ensureTables();
      const uid = userId(req); const itemId = req.params.itemId || req.params.id;
      if (!uid) return res.status(401).json({ error: 'Not authenticated' });
      const item = await requireOwnedItem(req, res, itemId, true);
      if (!item) return;
      const viewerOwnsItem = ownsItem(req, item);
      if (!viewerOwnsItem && !isAdminOrDeveloper(req)) return res.status(403).json({ error: 'Not allowed' });
      const noteRow = await get(`SELECT note, updated_at AS "updatedAt" FROM item_private_notes WHERE user_id = ? AND item_id = ?`, [uid, Number(itemId)]).catch(() => null);
      const folders = await all(`SELECT f.id, f.name, f.color, COALESCE(f.icon, '📁') AS icon, a.created_at AS "assignedAt" FROM item_folder_assignments a JOIN item_folders f ON f.id = a.folder_id WHERE a.user_id = ? AND a.item_id = ? ORDER BY f.name ASC`, [uid, Number(itemId)]).catch(() => []);
      res.json({ ok: true, itemId: Number(itemId), note: noteRow?.note || '', noteUpdatedAt: noteRow?.updatedAt || null, folders });
    } catch (error) { console.error('get item organization failed:', error); res.status(500).json({ error: error.message || 'Failed to load item organization' }); }
  }

  async function saveItemNote(req, res) {
    try {
      await ensureTables();
      const uid = userId(req); const itemId = req.params.itemId || req.params.id;
      if (!uid) return res.status(401).json({ error: 'Not authenticated' });
      const item = await requireOwnedItem(req, res, itemId, false); if (!item) return;
      const note = String(req.body?.note || '').slice(0, 5000);
      await run(`INSERT INTO item_private_notes (user_id, item_id, note, updated_at) VALUES (?, ?, ?, NOW()) ON CONFLICT (user_id, item_id) DO UPDATE SET note = EXCLUDED.note, updated_at = NOW()`, [uid, Number(itemId), note]);
      await audit(req, 'item_note.saved', 'item', itemId, { noteLength: note.length });
      res.json({ ok: true, itemId: Number(itemId), note });
    } catch (error) { console.error('save item note failed:', error); res.status(500).json({ error: error.message || 'Failed to save note' }); }
  }

  async function assignFolder(req, res) {
    try {
      await ensureTables();
      const uid = userId(req); const itemId = req.params.itemId || req.params.id; const folderId = req.body?.folderId || req.body?.folder_id || req.params.folderId;
      if (!uid) return res.status(401).json({ error: 'Not authenticated' });
      if (!validId(folderId)) return res.status(400).json({ error: 'Invalid folder id' });
      const item = await requireOwnedItem(req, res, itemId, false); if (!item) return;
      const folder = await get(`SELECT * FROM item_folders WHERE id = ? AND user_id = ?`, [Number(folderId), uid]);
      if (!folder) return res.status(404).json({ error: 'Folder not found' });
      await run(`INSERT INTO item_folder_assignments (user_id, item_id, folder_id) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`, [uid, Number(itemId), Number(folderId)]);
      await run(`UPDATE item_folders SET updated_at = NOW() WHERE id = ?`, [Number(folderId)]).catch(() => {});
      await audit(req, 'item_folder.assigned', 'item', itemId, { folderId: Number(folderId), folderName: folder.name });
      res.json({ ok: true, itemId: Number(itemId), folder });
    } catch (error) { console.error('assign item folder failed:', error); res.status(500).json({ error: error.message || 'Failed to assign folder' }); }
  }

  async function unassignFolder(req, res) {
    try {
      await ensureTables();
      const uid = userId(req); const itemId = req.params.itemId || req.params.id; const folderId = req.params.folderId || req.body?.folderId || req.body?.folder_id;
      if (!uid) return res.status(401).json({ error: 'Not authenticated' });
      if (!validId(folderId)) return res.status(400).json({ error: 'Invalid folder id' });
      const item = await requireOwnedItem(req, res, itemId, false); if (!item) return;
      await run(`DELETE FROM item_folder_assignments WHERE user_id = ? AND item_id = ? AND folder_id = ?`, [uid, Number(itemId), Number(folderId)]);
      await audit(req, 'item_folder.unassigned', 'item', itemId, { folderId: Number(folderId) });
      res.json({ ok: true, itemId: Number(itemId), folderId: Number(folderId), removed: true });
    } catch (error) { console.error('unassign item folder failed:', error); res.status(500).json({ error: error.message || 'Failed to remove folder assignment' }); }
  }

  app.get('/api/item-folders', auth, listFolders);
  app.get('/api/inventory/folders', auth, listFolders);
  app.post('/api/item-folders', auth, createFolder);
  app.post('/api/inventory/folders', auth, createFolder);
  app.put('/api/item-folders/:id', auth, updateFolder);
  app.patch('/api/item-folders/:id', auth, updateFolder);
  app.put('/api/inventory/folders/:id', auth, updateFolder);
  app.patch('/api/inventory/folders/:id', auth, updateFolder);
  app.delete('/api/item-folders/:id', auth, deleteFolder);
  app.delete('/api/inventory/folders/:id', auth, deleteFolder);

  app.get('/api/items/:itemId/organization', auth, getItemOrganization);
  app.get('/api/items/:itemId/folders-notes', auth, getItemOrganization);
  app.put('/api/items/:itemId/note', auth, saveItemNote);
  app.post('/api/items/:itemId/note', auth, saveItemNote);
  app.post('/api/items/:itemId/folders', auth, assignFolder);
  app.delete('/api/items/:itemId/folders/:folderId', auth, unassignFolder);
}

module.exports = installItemFolderNoteRoutes;
