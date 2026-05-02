/*
  VelkTrade Item Folder visual grouping routes.

  Returns folders with assigned item ids so the frontend can visually move items
  into collapsible folders instead of leaving them flat in My Inventory.
*/

const { all, run } = require('./db');

function installItemFolderViewRoutes({ app, authMiddleware }) {
  if (!app || app.__velktradeItemFolderViewRoutesInstalled) return;
  app.__velktradeItemFolderViewRoutesInstalled = true;

  const auth = authMiddleware || ((_req, _res, next) => next());
  function userId(req) { return Number(req.user?.id || req.userId || req.session?.user?.id || req.session?.userId || 0); }

  async function ensureTables() {
    await run(`CREATE TABLE IF NOT EXISTS item_folders (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, color TEXT DEFAULT '', icon TEXT DEFAULT '📁', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
    await run(`ALTER TABLE item_folders ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '📁'`).catch(() => {});
    await run(`CREATE TABLE IF NOT EXISTS item_folder_assignments (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, item_id INTEGER REFERENCES items(id) ON DELETE CASCADE, folder_id INTEGER REFERENCES item_folders(id) ON DELETE CASCADE, created_at TIMESTAMPTZ DEFAULT NOW())`);
  }

  async function foldersWithItems(req, res) {
    try {
      await ensureTables();
      const uid = userId(req);
      if (!uid) return res.status(401).json({ error: 'Not authenticated' });
      const rows = await all(`SELECT f.id, f.name, f.color, COALESCE(f.icon, '📁') AS icon, f.created_at AS "createdAt", f.updated_at AS "updatedAt", COALESCE(COUNT(a.item_id), 0) AS "itemCount" FROM item_folders f LEFT JOIN item_folder_assignments a ON a.folder_id = f.id AND a.user_id = f.user_id WHERE f.user_id = ? GROUP BY f.id ORDER BY f.updated_at DESC, f.name ASC`, [uid]);
      const assignments = await all(`SELECT a.folder_id AS "folderId", a.item_id AS "itemId" FROM item_folder_assignments a JOIN item_folders f ON f.id = a.folder_id AND f.user_id = a.user_id JOIN items i ON i.id = a.item_id WHERE a.user_id = ? ORDER BY a.created_at DESC`, [uid]).catch(() => []);
      const byFolder = new Map();
      for (const assignment of assignments) {
        const key = Number(assignment.folderId);
        if (!byFolder.has(key)) byFolder.set(key, []);
        byFolder.get(key).push(Number(assignment.itemId));
      }
      const folders = rows.map(folder => ({ ...folder, itemIds: byFolder.get(Number(folder.id)) || [] }));
      res.json({ ok: true, folders });
    } catch (error) {
      console.error('folder visual grouping failed:', error);
      res.status(500).json({ error: error.message || 'Failed to load folder view' });
    }
  }

  app.get('/api/item-folders-with-items', auth, foldersWithItems);
  app.get('/api/inventory/folders-with-items', auth, foldersWithItems);
  app.get('/api/item-folders/with-items', auth, foldersWithItems);
  app.get('/api/inventory/folders/with-items', auth, foldersWithItems);
}

module.exports = installItemFolderViewRoutes;
