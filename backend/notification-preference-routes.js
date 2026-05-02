/*
  VelkTrade Notification Preferences routes.

  Fixes frontend 404s for:
  - /api/notifications/preferences
  - /api/me/notification-preferences
  - /api/notification-preferences
*/

const { get, run } = require('./db');

function installNotificationPreferenceRoutes({ app, authMiddleware }) {
  if (!app || app.__velktradeNotificationPreferenceRoutesInstalled) return;
  app.__velktradeNotificationPreferenceRoutesInstalled = true;

  const optionalAuth = (req, _res, next) => {
    if (typeof authMiddleware !== 'function') return next();
    authMiddleware(req, { status: () => ({ json: () => next() }), json: () => next() }, next);
  };

  function userId(req) {
    return Number(req.user?.id || req.userId || req.session?.user?.id || req.session?.userId || 0);
  }

  const defaults = {
    trades: true,
    buyOffers: true,
    roomInvites: true,
    onlineUsers: true,
    bazaarWatchlist: true,
    admin: true,
    sound: true,
    volume: 0.6,
    flashTitle: true,
    verifiedOnly: false,
    allowUnverified: false,
    unverifiedUsers: false
  };

  async function ensureTable() {
    await run(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        preferences TEXT DEFAULT '{}',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch(() => {});
  }

  function parsePreferences(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  async function readPrefs(req, res) {
    try {
      await ensureTable();
      const uid = userId(req);
      if (!uid) return res.json({ ok: true, preferences: defaults, defaults, guest: true });
      const row = await get('SELECT preferences FROM notification_preferences WHERE user_id = ?', [uid]).catch(() => null);
      const preferences = { ...defaults, ...parsePreferences(row?.preferences) };
      res.json({ ok: true, preferences, defaults });
    } catch (error) {
      console.error('read notification preferences failed:', error);
      res.json({ ok: true, preferences: defaults, defaults, fallback: true });
    }
  }

  async function savePrefs(req, res) {
    try {
      await ensureTable();
      const uid = userId(req);
      if (!uid) return res.status(401).json({ error: 'Not authenticated' });
      const next = { ...defaults, ...(req.body?.preferences || req.body || {}) };
      await run(`
        INSERT INTO notification_preferences (user_id, preferences, updated_at)
        VALUES (?, ?, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET preferences = EXCLUDED.preferences, updated_at = NOW()
      `, [uid, JSON.stringify(next)]);
      res.json({ ok: true, preferences: next });
    } catch (error) {
      console.error('save notification preferences failed:', error);
      res.status(500).json({ error: error.message || 'Failed to save notification preferences' });
    }
  }

  app.get('/api/notifications/preferences', optionalAuth, readPrefs);
  app.get('/api/me/notification-preferences', optionalAuth, readPrefs);
  app.get('/api/notification-preferences', optionalAuth, readPrefs);

  app.put('/api/notifications/preferences', optionalAuth, savePrefs);
  app.put('/api/me/notification-preferences', optionalAuth, savePrefs);
  app.put('/api/notification-preferences', optionalAuth, savePrefs);
  app.post('/api/notifications/preferences', optionalAuth, savePrefs);
  app.post('/api/me/notification-preferences', optionalAuth, savePrefs);
  app.post('/api/notification-preferences', optionalAuth, savePrefs);
}

module.exports = installNotificationPreferenceRoutes;
