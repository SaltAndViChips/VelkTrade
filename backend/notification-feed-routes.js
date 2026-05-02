/*
  VelkTrade Notification Feed fallback routes.

  Prevents frontend notification polling from generating 404s on deployments where
  the full notification system is not installed yet. These routes are intentionally
  conservative and return an empty feed instead of failing unrelated UI screens.
*/

function installNotificationFeedRoutes({ app, authMiddleware }) {
  if (!app || app.__velktradeNotificationFeedRoutesInstalled) return;
  app.__velktradeNotificationFeedRoutesInstalled = true;

  const optionalAuth = (req, _res, next) => {
    if (typeof authMiddleware !== 'function') return next();
    authMiddleware(req, { status: () => ({ json: () => next() }), json: () => next() }, next);
  };

  function emptyFeed(_req, res) {
    res.json({ ok: true, notifications: [], data: [], unreadCount: 0, fallback: true });
  }

  function ok(_req, res) {
    res.json({ ok: true, fallback: true });
  }

  app.get('/api/notifications', optionalAuth, emptyFeed);
  app.get('/api/me/notifications', optionalAuth, emptyFeed);

  app.post('/api/notifications/read-all', optionalAuth, ok);
  app.post('/api/notifications/mark-all-read', optionalAuth, ok);
  app.post('/api/notifications/:id/read', optionalAuth, ok);
  app.patch('/api/notifications/:id', optionalAuth, ok);
}

module.exports = installNotificationFeedRoutes;
