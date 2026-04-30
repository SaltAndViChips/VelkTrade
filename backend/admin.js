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

function isAdminUser(user) {
  return Boolean(
    user?.is_admin ||
    user?.isAdmin ||
    user?.is_developer ||
    user?.isDeveloper ||
    isDeveloperUsername(user?.username)
  );
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

function publicUser(user) {
  const isDeveloper = isProtectedDeveloperUser(user);

  return {
    id: user.id,
    username: user.username,
    isAdmin: Boolean(user.is_admin || user.isAdmin || isDeveloper),
    isVerified: Boolean(user.is_verified || user.isVerified),
    isDeveloper,
    highestBadge: isDeveloper ? 'developer' : (user.is_admin || user.isAdmin) ? 'admin' : (user.is_verified || user.isVerified) ? 'verified' : 'none'
  };
}

module.exports = {
  normalizeUsername,
  isSaltUsername,
  isDeveloperUsername,
  isAdminUser,
  isProtectedDeveloperUser,
  publicUser
};
