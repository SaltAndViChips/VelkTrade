function normalizeUsername(value) {
  return String(value || '').trim();
}

function isSaltUsername(value) {
  return normalizeUsername(value).toLowerCase() === 'salt';
}

function isAdminUser(user) {
  return Boolean(user?.is_admin || user?.isAdmin || isSaltUsername(user?.username));
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    isAdmin: Boolean(user.is_admin || user.isAdmin || isSaltUsername(user.username)),
    isVerified: Boolean(user.is_verified || user.isVerified)
  };
}

module.exports = {
  normalizeUsername,
  isSaltUsername,
  isAdminUser,
  publicUser
};
