/* Compatibility routes for AdminPanel user role actions. */

function installAdminUserRoleCompatRoutes({ app, authMiddleware, run, get }) {
  if (!app || app.__adminUserRoleCompatRoutesInstalled) return;
  app.__adminUserRoleCompatRoutesInstalled = true;

  const auth = authMiddleware || ((_req, _res, next) => next());

  async function tryDb(attempts) {
    let lastError;
    for (const attempt of attempts) {
      try {
        const result = await attempt();
        if (result !== false && result !== undefined) return result;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('No compatible database helper succeeded.');
  }

  async function one(sqlPg, sqlSqlite, params = []) {
    const result = await tryDb([
      () => typeof get === 'function' && get(sqlPg, params),
      () => typeof get === 'function' && get(sqlSqlite || sqlPg, params),
      () => typeof run === 'function' && run(sqlPg, params),
      () => typeof run === 'function' && run(sqlSqlite || sqlPg, params)
    ]);
    if (Array.isArray(result?.rows)) return result.rows[0];
    if (Array.isArray(result)) return result[0];
    return result;
  }

  async function exec(sqlPg, sqlSqlite, params = []) {
    return tryDb([
      () => typeof run === 'function' && run(sqlPg, params),
      () => typeof run === 'function' && run(sqlSqlite || sqlPg, params)
    ]);
  }

  function currentUserId(req) {
    return req.user?.id || req.userId || req.session?.user?.id || req.session?.userId;
  }

  function currentUsername(req) {
    return req.user?.username || req.user?.name || req.session?.user?.username || req.session?.user?.name || '';
  }

  function isDeveloperUser(user) {
    const username = String(user?.username || user?.name || '').toLowerCase();
    return Boolean(user?.isDeveloper || user?.is_developer || user?.developer || user?.role === 'developer' || user?.rank === 'developer' || username === 'salt' || username === 'velkon');
  }

  function isAdminUser(user) {
    const username = String(user?.username || user?.name || '').toLowerCase();
    return Boolean(isDeveloperUser(user) || user?.isAdmin || user?.is_admin || user?.admin || user?.role === 'admin' || user?.rank === 'admin' || username === 'salt' || username === 'velkon');
  }

  async function loadCurrentUser(req) {
    const id = currentUserId(req);
    const username = currentUsername(req);
    if (id) {
      const found = await one('SELECT * FROM users WHERE id = $1', 'SELECT * FROM users WHERE id = ?', [id]).catch(() => null);
      if (found) return found;
    }
    if (username) {
      const found = await one('SELECT * FROM users WHERE lower(username) = lower($1)', 'SELECT * FROM users WHERE lower(username) = lower(?)', [username]).catch(() => null);
      if (found) return found;
    }
    return req.user || req.session?.user || null;
  }

  async function ensureUserRoleColumns() {
    const attempts = [
      async () => exec('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE', 'ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT FALSE'),
      async () => exec('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE', 'ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE'),
      async () => exec('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_developer BOOLEAN DEFAULT FALSE', 'ALTER TABLE users ADD COLUMN is_developer BOOLEAN DEFAULT FALSE')
    ];
    for (const attempt of attempts) {
      try { await attempt(); } catch {}
    }
  }

  async function requireAdmin(req, res) {
    const requester = await loadCurrentUser(req);
    if (!isAdminUser(requester)) {
      res.status(403).json({ error: 'Admin only' });
      return null;
    }
    return requester;
  }

  async function loadTarget(username) {
    if (!username) return null;
    return one('SELECT * FROM users WHERE lower(username) = lower($1)', 'SELECT * FROM users WHERE lower(username) = lower(?)', [username]).catch(() => null);
  }

  function canModifyTarget(requester, target) {
    if (!target) return false;
    if (!isDeveloperUser(target)) return true;
    if (isDeveloperUser(requester)) return true;
    const sameId = requester?.id && target?.id && Number(requester.id) === Number(target.id);
    const sameName = String(requester?.username || '').toLowerCase() === String(target?.username || '').toLowerCase();
    return Boolean(sameId || sameName);
  }

  async function updateUserFlag(req, res, flag) {
    try {
      await ensureUserRoleColumns();
      const requester = await requireAdmin(req, res);
      if (!requester) return;

      const username = req.params.username || req.body?.username || req.body?.targetUsername;
      const target = await loadTarget(username);
      if (!target) return res.status(404).json({ error: 'User not found' });
      if (!canModifyTarget(requester, target)) return res.status(403).json({ error: 'Developer accounts can only be modified by developers' });

      const rawValue = flag === 'verified'
        ? (req.body?.isVerified ?? req.body?.is_verified ?? req.body?.verified ?? req.body?.value)
        : (req.body?.isAdmin ?? req.body?.is_admin ?? req.body?.admin ?? req.body?.value);
      const enabled = rawValue === true || rawValue === 'true' || rawValue === 1 || rawValue === '1';
      const column = flag === 'verified' ? 'is_verified' : 'is_admin';

      await exec(`UPDATE users SET ${column} = $1 WHERE lower(username) = lower($2)`, `UPDATE users SET ${column} = ? WHERE lower(username) = lower(?)`, [enabled, username]);
      const updated = await loadTarget(username);

      res.json({
        ok: true,
        username: updated?.username || username,
        user: updated || { username, [column]: enabled },
        isVerified: Boolean(updated?.is_verified ?? updated?.isVerified ?? enabled),
        isAdmin: Boolean(updated?.is_admin ?? updated?.isAdmin ?? enabled)
      });
    } catch (error) {
      res.status(500).json({ error: error.message || `Failed to update ${flag} flag` });
    }
  }

  async function verified(req, res) { return updateUserFlag(req, res, 'verified'); }
  async function admin(req, res) { return updateUserFlag(req, res, 'admin'); }

  for (const method of ['put', 'post', 'patch']) {
    app[method]('/api/admin/users/:username/verified', auth, verified);
    app[method]('/api/admin/users/verified', auth, verified);
    app[method]('/api/admin/users/:username/admin', auth, admin);
    app[method]('/api/admin/users/admin', auth, admin);
  }
}

module.exports = installAdminUserRoleCompatRoutes;
