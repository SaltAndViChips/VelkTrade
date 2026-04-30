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
    userOrUsername?.role === 'developer' ||
    userOrUsername?.highestBadge === 'developer' ||
    isDeveloperUsername(userOrUsername?.username)
  );
}

function isAdminUser(user) {
  return Boolean(
    user?.is_admin ||
    user?.isAdmin ||
    user?.role === 'admin' ||
    isProtectedDeveloperUser(user)
  );
}

function publicUser(user) {
  if (!user) return null;

  const isDeveloper = isProtectedDeveloperUser(user);
  const isAdmin = Boolean(user.is_admin || user.isAdmin || user.role === 'admin' || isDeveloper);
  const isVerified = Boolean(user.is_verified || user.isVerified || user.isTrusted || user.role === 'verified');
  const highestBadge = isDeveloper ? 'developer' : isAdmin ? 'admin' : isVerified ? 'verified' : 'none';

  return {
    id: user.id,
    username: user.username,
    isAdmin,
    isVerified,
    isTrusted: isVerified,
    isDeveloper,
    role: highestBadge,
    highestBadge,
    bio: user.bio || '',
    showBazaarInventory: user.show_bazaar_inventory !== false && user.showBazaarInventory !== false,
    showOnline: user.show_online !== false && user.showOnline !== false
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
