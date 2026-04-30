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
  if (typeof userOrUsername === 'string') return isDeveloperUsername(userOrUsername);

  return Boolean(
    userOrUsername?.is_developer ||
    userOrUsername?.isDeveloper ||
    isDeveloperUsername(userOrUsername?.username)
  );
}

function isAdminUser(user) {
  return Boolean(user?.is_admin || user?.isAdmin || isProtectedDeveloperUser(user));
}

function roleForUser(user) {
  const isDeveloper = isProtectedDeveloperUser(user);
  const isAdmin = Boolean(user?.is_admin || user?.isAdmin || isDeveloper);
  const isVerified = Boolean(user?.is_verified || user?.isVerified || user?.isTrusted);

  return {
    isDeveloper,
    isAdmin,
    isVerified,
    isTrusted: isVerified,
    highestBadge: isDeveloper ? 'developer' : isAdmin ? 'admin' : isVerified ? 'trusted' : 'none'
  };
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    ...roleForUser(user)
  };
}

module.exports = {
  normalizeUsername,
  isSaltUsername,
  isDeveloperUsername,
  isProtectedDeveloperUser,
  isAdminUser,
  roleForUser,
  publicUser
};
