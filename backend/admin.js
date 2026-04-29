function normalizeUsername(username) {
  return String(username || '').trim();
}

function isSaltUsername(username) {
  return normalizeUsername(username).toLowerCase() === 'salt';
}

function boolFromDb(value) {
  return value === true || value === 'true' || value === 't' || value === 1 || value === '1';
}

function isAdminUser(user) {
  return isSaltUsername(user?.username) || boolFromDb(user?.is_admin) || boolFromDb(user?.isAdmin) || boolFromDb(user?.isadmin);
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    isAdmin: isAdminUser(user)
  };
}

module.exports = {
  normalizeUsername,
  isSaltUsername,
  boolFromDb,
  isAdminUser,
  publicUser
};
