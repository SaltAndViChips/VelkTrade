/*
  VelkTrade hard delete route override + early compatibility route installer.

  Important: this file is preloaded before server.js. Some compatibility routes
  are registered before server.js reaches app.use(cors(...)), so this file also
  installs an early API CORS middleware for those preloaded routes.
*/

const express = require('express');
const { get, run } = require('./db');
const { authMiddleware } = require('./auth');
const installItemLockRoutes = require('./item-lock-routes');
const installBuyOfferAuditPriceRoutes = require('./buy-offer-audit-price-routes');
const installBazaarWatchlistFilterRoutes = require('./bazaar-watchlist-filter-routes');

const TARGET_PATHS = new Set([
  '/api/items/:itemId',
  '/api/items/:id',
  '/api/items/:itemId/remove',
  '/api/items/:id/remove',
  '/api/bazaar/items/:itemId',
  '/api/bazaar/items/:id',
  '/api/bazaar/items/:itemId/remove',
  '/api/bazaar/items/:id/remove'
]);

const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/nicecock\.ca$/i,
  /^https:\/\/www\.nicecock\.ca$/i,
  /^https:\/\/saltandvichips\.github\.io$/i,
  /^http:\/\/localhost:\d+$/i,
  /^http:\/\/127\.0\.0\.1:\d+$/i
];

function allowedOrigin(origin) {
  if (!origin) return '';

  const configured = [
    process.env.FRONTEND_ORIGIN,
    process.env.PUBLIC_FRONTEND_URL,
    process.env.CORS_ORIGIN
  ].filter(Boolean).map(value => String(value).replace(/\/$/, ''));

  const cleanOrigin = String(origin).replace(/\/$/, '');
  if (configured.includes(cleanOrigin)) return cleanOrigin;
  if (ALLOWED_ORIGIN_PATTERNS.some(pattern => pattern.test(cleanOrigin))) return cleanOrigin;
  return configured[0] || 'https://nicecock.ca';
}

function velktradeEarlyCors(req, res, next) {
  const origin = allowedOrigin(req.headers.origin);

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

function isIntegerId(value) {
  return /^\d+$/.test(String(value || '').trim());
}

function currentUserId(req) {
  return req.user?.id || req.userId || req.session?.user?.id || req.session?.userId;
}

function isAdminOrDeveloper(req) {
  const username = String(req.user?.username || req.session?.user?.username || '').trim().toLowerCase();
  return Boolean(
    req.user?.isAdmin || req.user?.is_admin || req.user?.admin ||
    req.user?.isDeveloper || req.user?.is_developer || req.user?.developer ||
    req.user?.role === 'admin' || req.user?.role === 'developer' ||
    username === 'salt' || username === 'velkon'
  );
}

function itemOwnerId(item) {
  return item?.user_id ?? item?.userid ?? item?.userId ?? item?.owner_id ?? item?.ownerId ?? null;
}

function ownsItem(req, item) {
  const userId = String(currentUserId(req) || '');
  const ownerId = String(itemOwnerId(item) || '');
  return Boolean(userId && ownerId && userId === ownerId);
}

async function robustRemoveItem(req, res) {
  try {
    const itemId = req.params.itemId || req.params.id;

    if (!isIntegerId(itemId)) return res.status(400).json({ error: 'Invalid item id', itemId: itemId || '' });

    const numericItemId = Number(itemId);
    const item = await get('SELECT * FROM items WHERE id = ?', [numericItemId]);

    if (!item) return res.status(404).json({ error: 'Item not found', itemId: numericItemId });
    if (!ownsItem(req, item) && !isAdminOrDeveloper(req)) return res.status(403).json({ error: 'Not allowed' });

    await run('DELETE FROM buy_requests WHERE item_id = ?', [numericItemId]).catch(() => {});

    const deleted = await run('DELETE FROM items WHERE id = ?', [numericItemId]);
    const count = Number(deleted?.rowCount || deleted?.changes || deleted?.affectedRows || 0);

    if (count < 1) {
      const stillExists = await get('SELECT id FROM items WHERE id = ?', [numericItemId]).catch(() => null);
      if (stillExists) return res.status(500).json({ error: 'Item delete did not persist', itemId: numericItemId });
    }

    return res.json({ ok: true, itemId: numericItemId, removed: true, deleted: true, hardDeleted: true, item });
  } catch (error) {
    console.error('Hard item delete failed:', error);
    return res.status(500).json({ error: error.message || 'Failed to remove item' });
  }
}

function shouldOverride(path) {
  return typeof path === 'string' && TARGET_PATHS.has(path);
}

function installFeatureRoutesOnce(app, originalUse) {
  if (!app || app.__velktradeEarlyFeatureRoutesInstalled) return;
  app.__velktradeEarlyFeatureRoutesInstalled = true;

  // Register CORS before preloaded API routes. This covers routes that are
  // installed before server.js reaches its normal app.use(cors(...)).
  if (typeof originalUse === 'function' && !app.__velktradeEarlyCorsInstalled) {
    app.__velktradeEarlyCorsInstalled = true;
    originalUse.call(app, '/api', velktradeEarlyCors);
  }

  installItemLockRoutes({ app, authMiddleware, run, get });
  installBuyOfferAuditPriceRoutes({ app, authMiddleware });
  installBazaarWatchlistFilterRoutes({ app, authMiddleware });
}

function installMethodOverride(methodName) {
  const original = express.application[methodName];
  express.application[methodName] = function patchedRoute(path, ...handlers) {
    if (shouldOverride(path)) return original.call(this, path, velktradeEarlyCors, authMiddleware, robustRemoveItem);
    return original.call(this, path, ...handlers);
  };
}

function installOptionsOverride() {
  const originalOptions = express.application.options;
  express.application.options = function patchedOptions(path, ...handlers) {
    return originalOptions.call(this, path, velktradeEarlyCors, ...handlers);
  };
}

function installUseHook() {
  const originalUse = express.application.use;
  express.application.use = function patchedUse(...args) {
    installFeatureRoutesOnce(this, originalUse);
    return originalUse.call(this, ...args);
  };
}

installMethodOverride('delete');
installMethodOverride('post');
installMethodOverride('put');
installMethodOverride('patch');
installOptionsOverride();
installUseHook();

module.exports = { robustRemoveItem, velktradeEarlyCors };