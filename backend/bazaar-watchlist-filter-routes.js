/*
  VelkTrade Bazaar Watchlist + Saved Filters routes.

  Roadmap step after Price History:
  Bazaar Watchlist/Filters.
*/

const { get, all, run } = require('./db');

function installBazaarWatchlistFilterRoutes({ app, authMiddleware }) {
  if (!app || app.__velktradeBazaarWatchlistFilterRoutesInstalled) return;
  app.__velktradeBazaarWatchlistFilterRoutesInstalled = true;

  const auth = authMiddleware || ((_req, _res, next) => next());

  function userId(req) {
    return Number(req.user?.id || req.userId || req.session?.user?.id || req.session?.userId || 0);
  }

  async function ensureTables() {
    await run(`
      CREATE TABLE IF NOT EXISTS bazaar_saved_filters (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        filters TEXT DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS bazaar_watchlist (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        keyword TEXT NOT NULL,
        min_price TEXT DEFAULT '',
        max_price TEXT DEFAULT '',
        verified_only BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }

  function parseJson(value, fallback = {}) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  async function audit(req, action, targetType, targetId, metadata = {}) {
    try {
      await run(
        `INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata) VALUES (?, ?, ?, ?, ?)`,
        [userId(req) || null, action, targetType || '', String(targetId || ''), JSON.stringify(metadata || {})]
      );
    } catch {}
  }

  async function listFilters(req, res) {
    try {
      await ensureTables();
      const uid = userId(req);
      if (!uid) return res.status(401).json({ error: 'Not authenticated' });
      const rows = await all(`SELECT * FROM bazaar_saved_filters WHERE user_id = ? ORDER BY updated_at DESC, created_at DESC`, [uid]);
      const filters = rows.map(row => ({
        id: row.id,
        name: row.name,
        filters: parseJson(row.filters),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
      res.json({ ok: true, filters, savedFilters: filters });
    } catch (error) {
      console.error('list saved bazaar filters failed:', error);
      res.status(500).json({ error: error.message || 'Failed to load saved filters' });
    }
  }

  async function saveFilter(req, res) {
    try {
      await ensureTables();
      const uid = userId(req);
      if (!uid) return res.status(401).json({ error: 'Not authenticated' });
      const name = String(req.body?.name || 'Saved Filter').trim().slice(0, 80) || 'Saved Filter';
      const filters = req.body?.filters && typeof req.body.filters === 'object' ? req.body.filters : {};
      const result = await run(
        `INSERT INTO bazaar_saved_filters (user_id, name, filters, updated_at) VALUES (?, ?, ?, NOW()) RETURNING id`,
        [uid, name, JSON.stringify(filters)]
      );
      const id = result.rows?.[0]?.id || result.lastID;
      await audit(req, 'bazaar_filter.saved', 'bazaar_filter', id, { name, filters });
      res.json({ ok: true, id, name, filters });
    } catch (error) {
      console.error('save bazaar filter failed:', error);
      res.status(500).json({ error: error.message || 'Failed to save filter' });
    }
  }

  async function deleteFilter(req, res) {
    try {
      await ensureTables();
      const uid = userId(req);
      const id = req.params.id;
      if (!uid) return res.status(401).json({ error: 'Not authenticated' });
      if (!/^\d+$/.test(String(id || ''))) return res.status(400).json({ error: 'Invalid filter id' });
      await run(`DELETE FROM bazaar_saved_filters WHERE id = ? AND user_id = ?`, [Number(id), uid]);
      await audit(req, 'bazaar_filter.deleted', 'bazaar_filter', id, {});
      res.json({ ok: true, id: Number(id), deleted: true });
    } catch (error) {
      console.error('delete bazaar filter failed:', error);
      res.status(500).json({ error: error.message || 'Failed to delete filter' });
    }
  }

  async function listWatchlist(req, res) {
    try {
      await ensureTables();
      const uid = userId(req);
      if (!uid) return res.status(401).json({ error: 'Not authenticated' });
      const rows = await all(`SELECT * FROM bazaar_watchlist WHERE user_id = ? ORDER BY created_at DESC`, [uid]);
      const watchlist = rows.map(row => ({
        id: row.id,
        keyword: row.keyword,
        minPrice: row.min_price,
        maxPrice: row.max_price,
        verifiedOnly: Boolean(row.verified_only),
        createdAt: row.created_at
      }));
      res.json({ ok: true, watchlist, watches: watchlist });
    } catch (error) {
      console.error('list bazaar watchlist failed:', error);
      res.status(500).json({ error: error.message || 'Failed to load watchlist' });
    }
  }

  async function addWatch(req, res) {
    try {
      await ensureTables();
      const uid = userId(req);
      if (!uid) return res.status(401).json({ error: 'Not authenticated' });
      const keyword = String(req.body?.keyword || req.body?.search || '').trim().slice(0, 120);
      if (!keyword) return res.status(400).json({ error: 'Keyword is required' });
      const minPrice = String(req.body?.minPrice || req.body?.min || '').slice(0, 40);
      const maxPrice = String(req.body?.maxPrice || req.body?.max || '').slice(0, 40);
      const verifiedOnly = Boolean(req.body?.verifiedOnly || req.body?.verified_only);
      const result = await run(
        `INSERT INTO bazaar_watchlist (user_id, keyword, min_price, max_price, verified_only) VALUES (?, ?, ?, ?, ?) RETURNING id`,
        [uid, keyword, minPrice, maxPrice, verifiedOnly]
      );
      const id = result.rows?.[0]?.id || result.lastID;
      await audit(req, 'bazaar_watch.created', 'bazaar_watch', id, { keyword, minPrice, maxPrice, verifiedOnly });
      res.json({ ok: true, id, keyword, minPrice, maxPrice, verifiedOnly });
    } catch (error) {
      console.error('add bazaar watch failed:', error);
      res.status(500).json({ error: error.message || 'Failed to add watch' });
    }
  }

  async function deleteWatch(req, res) {
    try {
      await ensureTables();
      const uid = userId(req);
      const id = req.params.id;
      if (!uid) return res.status(401).json({ error: 'Not authenticated' });
      if (!/^\d+$/.test(String(id || ''))) return res.status(400).json({ error: 'Invalid watch id' });
      await run(`DELETE FROM bazaar_watchlist WHERE id = ? AND user_id = ?`, [Number(id), uid]);
      await audit(req, 'bazaar_watch.deleted', 'bazaar_watch', id, {});
      res.json({ ok: true, id: Number(id), deleted: true });
    } catch (error) {
      console.error('delete bazaar watch failed:', error);
      res.status(500).json({ error: error.message || 'Failed to delete watch' });
    }
  }

  app.get('/api/bazaar/filters', auth, listFilters);
  app.get('/api/bazaar/saved-filters', auth, listFilters);
  app.post('/api/bazaar/filters', auth, saveFilter);
  app.post('/api/bazaar/saved-filters', auth, saveFilter);
  app.delete('/api/bazaar/filters/:id', auth, deleteFilter);
  app.delete('/api/bazaar/saved-filters/:id', auth, deleteFilter);

  app.get('/api/bazaar/watchlist', auth, listWatchlist);
  app.get('/api/bazaar/watches', auth, listWatchlist);
  app.post('/api/bazaar/watchlist', auth, addWatch);
  app.post('/api/bazaar/watches', auth, addWatch);
  app.delete('/api/bazaar/watchlist/:id', auth, deleteWatch);
  app.delete('/api/bazaar/watches/:id', auth, deleteWatch);
}

module.exports = installBazaarWatchlistFilterRoutes;
