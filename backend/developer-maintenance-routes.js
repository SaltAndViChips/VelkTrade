/*
  VelkTrade Developer Maintenance Panel routes.

  Roadmap step:
  Developer Maintenance Panel.
*/

const { get, all, run } = require('./db');

function installDeveloperMaintenanceRoutes({ app, authMiddleware }) {
  if (!app || app.__velktradeDeveloperMaintenanceRoutesInstalled) return;
  app.__velktradeDeveloperMaintenanceRoutesInstalled = true;

  const auth = authMiddleware || ((_req, _res, next) => next());

  function userId(req) {
    return Number(req.user?.id || req.userId || req.session?.user?.id || req.session?.userId || 0);
  }

  function username(req) {
    return String(req.user?.username || req.session?.user?.username || '').trim().toLowerCase();
  }

  function isDeveloper(req) {
    const name = username(req);
    return Boolean(
      req.user?.isDeveloper || req.user?.is_developer || req.user?.developer ||
      req.user?.role === 'developer' || req.user?.rank === 'developer' ||
      name === 'salt' || name === 'velkon'
    );
  }

  function requireDeveloper(req, res) {
    if (!userId(req)) {
      res.status(401).json({ error: 'Not authenticated' });
      return false;
    }
    if (!isDeveloper(req)) {
      res.status(403).json({ error: 'Developer access required' });
      return false;
    }
    return true;
  }

  async function audit(req, action, targetType, targetId, metadata = {}) {
    try {
      await run(
        `INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata) VALUES (?, ?, ?, ?, ?)`,
        [userId(req) || null, action, targetType || '', String(targetId || ''), JSON.stringify(metadata || {})]
      );
    } catch {}
  }

  async function countTable(tableName) {
    try {
      const row = await get(`SELECT COUNT(*) AS count FROM ${tableName}`);
      return Number(row?.count || row?.COUNT || 0);
    } catch {
      return null;
    }
  }

  async function maintenanceSummary(req, res) {
    try {
      if (!requireDeveloper(req, res)) return;

      const [users, items, trades, buyRequests, notifications, auditLogs, folders, notes] = await Promise.all([
        countTable('users'),
        countTable('items'),
        countTable('trades'),
        countTable('buy_requests'),
        countTable('notifications'),
        countTable('audit_logs'),
        countTable('item_folders'),
        countTable('item_private_notes')
      ]);

      const recentAudit = await all(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 25`).catch(() => []);
      const recentErrors = await all(`SELECT * FROM audit_logs WHERE action ILIKE '%error%' OR action ILIKE '%failed%' ORDER BY created_at DESC LIMIT 25`).catch(() => []);

      res.json({
        ok: true,
        summary: {
          users,
          items,
          trades,
          buyRequests,
          notifications,
          auditLogs,
          folders,
          notes,
          checkedAt: new Date().toISOString()
        },
        recentAudit,
        recentErrors
      });
    } catch (error) {
      console.error('developer maintenance summary failed:', error);
      res.status(500).json({ error: error.message || 'Failed to load maintenance summary' });
    }
  }

  async function runMaintenanceAction(req, res) {
    try {
      if (!requireDeveloper(req, res)) return;
      const action = String(req.body?.action || req.params.action || '').trim();
      const dryRun = req.body?.dryRun !== false;
      const result = { action, dryRun, changed: 0, details: [] };

      if (!action) return res.status(400).json({ error: 'Action is required' });

      if (action === 'cleanup-orphan-buy-requests') {
        const rows = await all(`
          SELECT br.id FROM buy_requests br
          LEFT JOIN items i ON i.id = br.item_id
          WHERE i.id IS NULL
        `).catch(() => []);
        result.changed = rows.length;
        result.details = rows.slice(0, 100);
        if (!dryRun && rows.length) {
          await run(`DELETE FROM buy_requests WHERE id IN (${rows.map(() => '?').join(', ')})`, rows.map(row => row.id));
        }
      } else if (action === 'cleanup-orphan-folder-assignments') {
        const rows = await all(`
          SELECT a.id FROM item_folder_assignments a
          LEFT JOIN items i ON i.id = a.item_id
          LEFT JOIN item_folders f ON f.id = a.folder_id
          WHERE i.id IS NULL OR f.id IS NULL
        `).catch(() => []);
        result.changed = rows.length;
        result.details = rows.slice(0, 100);
        if (!dryRun && rows.length) {
          await run(`DELETE FROM item_folder_assignments WHERE id IN (${rows.map(() => '?').join(', ')})`, rows.map(row => row.id));
        }
      } else if (action === 'unlock-stale-trade-pending-items') {
        const rows = await all(`
          SELECT id FROM items
          WHERE COALESCE(locked, FALSE) = TRUE
            AND lock_reason = 'buy_offer_accepted'
            AND locked_at < NOW() - INTERVAL '14 days'
        `).catch(() => []);
        result.changed = rows.length;
        result.details = rows.slice(0, 100);
        if (!dryRun && rows.length) {
          await run(`UPDATE items SET locked = FALSE, lock_reason = NULL, locked_at = NULL, locked_by = NULL WHERE id IN (${rows.map(() => '?').join(', ')})`, rows.map(row => row.id));
        }
      } else if (action === 'prune-old-client-audit-events') {
        const rows = await all(`
          SELECT id FROM audit_logs
          WHERE action LIKE 'client.%'
            AND created_at < NOW() - INTERVAL '90 days'
          LIMIT 1000
        `).catch(() => []);
        result.changed = rows.length;
        result.details = rows.slice(0, 100);
        if (!dryRun && rows.length) {
          await run(`DELETE FROM audit_logs WHERE id IN (${rows.map(() => '?').join(', ')})`, rows.map(row => row.id));
        }
      } else {
        return res.status(400).json({ error: 'Unknown maintenance action', action });
      }

      await audit(req, 'developer.maintenance_action', 'maintenance', action, result);
      res.json({ ok: true, result });
    } catch (error) {
      console.error('developer maintenance action failed:', error);
      res.status(500).json({ error: error.message || 'Failed to run maintenance action' });
    }
  }

  app.get('/api/developer/maintenance', auth, maintenanceSummary);
  app.get('/api/dev/maintenance', auth, maintenanceSummary);
  app.post('/api/developer/maintenance/run', auth, runMaintenanceAction);
  app.post('/api/dev/maintenance/run', auth, runMaintenanceAction);
  app.post('/api/developer/maintenance/:action', auth, runMaintenanceAction);
  app.post('/api/dev/maintenance/:action', auth, runMaintenanceAction);
}

module.exports = installDeveloperMaintenanceRoutes;
