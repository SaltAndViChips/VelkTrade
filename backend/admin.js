function normalizeUsername(value) {
  return String(value || '').trim();
}

function isDeveloperUsername(value) {
  const username = normalizeUsername(value).toLowerCase();
  return username === 'salt' || username === 'velkon';
}

function isSaltUsername(value) {
  return normalizeUsername(value).toLowerCase() === 'salt';
}

function isProtectedDeveloperUser(userOrUsername) {
  if (typeof userOrUsername === 'string') {
    return isDeveloperUsername(userOrUsername);
  }

  return Boolean(
    userOrUsername?.is_developer ||
    userOrUsername?.isDeveloper ||
    isDeveloperUsername(userOrUsername?.username)
  );
}

function isAdminUser(user) {
  return Boolean(
    user?.is_admin ||
    user?.isAdmin ||
    isProtectedDeveloperUser(user)
  );
}

function publicUser(user) {
  if (!user) return null;

  const isDeveloper = isProtectedDeveloperUser(user);
  const isAdmin = Boolean(user.is_admin || user.isAdmin || isDeveloper);
  const isVerified = Boolean(user.is_verified || user.isVerified);

  return {
    id: user.id,
    username: user.username,
    isAdmin,
    isVerified,
    isDeveloper,
    highestBadge: isDeveloper ? 'developer' : isAdmin ? 'admin' : isVerified ? 'verified' : 'none'
  };
}

module.exports = {
  normalizeUsername,
  isSaltUsername,
  isDeveloperUsername,
  isProtectedDeveloperUser,
  isAdminUser,
  publicUser
};
