/* Admin verification/admin flag compatibility routes for VelkTrade. */

function installAdminVerifyCompatRoutes({ app, authMiddleware, get, run }) {
  if (!app || app.__adminVerifyCompatRoutesInstalled) return;
  app.__adminVerifyCompatRoutesInstalled = true;

  const auth = authMiddleware || ((_req, _res, next) => next());

  function usernameOf(user) {
    return String(user?.username || user?.name || '').trim();
  }

  function isDeveloper(user) {
    const username = usernameOf(user).toLowerCase();
    return Boolean(
      user?.isDeveloper || user?.is_developer || user?.developer ||
      user?.role === 'developer' || user?.rank === 'developer' ||
      username === 'salt' || username === 'velkon'
    );
  }

  function isAdmin(user) {
    return Boolean(isDeveloper(user) || user?.isAdmin || user?.is_admin || user?.admin || user?.role === 'admin' || user?.rank === 'admin');
  }

  async function loadRequester(req) {
    if (req.user?.id && typeof get === 'function') {
      const found = await get('SELECT * FROM users WHERE id = ?', [req.user.id]).catch(() => null);
      if (found) return found;
    }
    if (req.user?.username && typeof get === 'function') {
      const found = await get('SELECT * FROM users WHERE lower(username) = lower(?)', [req.user.username]).catch(() => null);
      if (found) return found;
    }
    return req.user || null;
  }

  async function loadTarget(username) {
    if (!username || typeof get !== 'function') return null;
    return get('SELECT * FROM users WHERE lower(username) = lower(?)', [username]).catch(() => null);
  }

  async function ensureUserColumns() {
    try { await run('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE'); } catch {}
    try { await run('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE'); } catch {}
  }

  async function setUserFlag(req, res, flag) {
    try {
      const requester = await loadRequester(req);
      if (!isAdmin(requester)) return res.status(403).json({ error: 'Admin only' });

      const username = req.params.username || req.body?.username || req.body?.targetUsername;
      if (!username) return res.status(400).json({ error: 'Missing username' });

      const target = await loadTarget(username);
      if (!target) return res.status(404).json({ error: 'User not found' });
      if (isDeveloper(target) && !isDeveloper(requester)) return res.status(403).json({ error: 'Developer users can only be changed by developers' });

      await ensureUserColumns();

      const rawValue = flag === 'verified'
        ? (req.body?.isVerified ?? req.body?.is_verified ?? req.body?.verified ?? req.body?.enabled ?? true)
        : (req.body?.isAdmin ?? req.body?.is_admin ?? req.body?.admin ?? req.body?.enabled ?? true);
      const nextValue = rawValue === true || rawValue === 'true' || rawValue === 1 || rawValue === '1';
      const column = flag === 'verified' ? 'is_verified' : 'is_admin';

      await run(`UPDATE users SET ${column} = ? WHERE id = ?`, [nextValue, target.id]);
      const updated = await loadTarget(target.username);
      res.json({
        ok: true,
        username: updated?.username || target.username,
        user: {
          id: updated?.id || target.id,
          username: updated?.username || target.username,
          isAdmin: Boolean(updated?.is_admin || updated?.isAdmin),
          is_admin: Boolean(updated?.is_admin || updated?.isAdmin),
          isVerified: Boolean(updated?.is_verified || updated?.isVerified),
          is_verified: Boolean(updated?.is_verified || updated?.isVerified)
        }
      });
    } catch (error) {
      console.error(`Admin ${flag} route failed:`, error);
      res.status(500).json({ error: error.message || `Failed to update ${flag} flag` });
    }
  }

  async function setVerified(req, res) { return setUserFlag(req, res, 'verified'); }
  async function setAdmin(req, res) { return setUserFlag(req, res, 'admin'); }

  for (const method of ['put', 'post', 'patch']) {
    app[method]('/api/admin/users/:username/verified', auth, setVerified);
    app[method]('/api/admin/users/verified', auth, setVerified);
    app[method]('/api/admin/users/:username/admin', auth, setAdmin);
    app[method]('/api/admin/users/admin', auth, setAdmin);
  }
}

module.exports = installAdminVerifyCompatRoutes;
