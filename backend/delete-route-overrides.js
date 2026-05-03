/*
  VelkTrade safe preload.

  This file is loaded before server.js through Node's -r flag. Keep it defensive:
  a broken experimental route pack must never stop Render from starting the backend.
*/

const express = require('express');
const { get, run } = require('./db');
const { authMiddleware } = require('./auth');

function optionalInstaller(path, label) {
  try {
    const installer = require(path);
    if (typeof installer !== 'function') {
      console.warn(`[VelkTrade preload] ${label} did not export an installer function; skipped.`);
      return null;
    }
    return installer;
  } catch (error) {
    console.error(`[VelkTrade preload] Failed to load ${label}; skipped so backend can still start.`, error);
    return null;
  }
}

const routeInstallers = [
  ['item-lock-routes', optionalInstaller('./item-lock-routes', 'item-lock-routes')],
  ['buy-offer-audit-price-routes', optionalInstaller('./buy-offer-audit-price-routes', 'buy-offer-audit-price-routes')],
  ['bazaar-watchlist-filter-routes', optionalInstaller('./bazaar-watchlist-filter-routes', 'bazaar-watchlist-filter-routes')],
  ['item-folder-note-routes', optionalInstaller('./item-folder-note-routes', 'item-folder-note-routes')],
  ['item-folder-view-routes', optionalInstaller('./item-folder-view-routes', 'item-folder-view-routes')],
  ['inventory-bulk-cleanup-routes', optionalInstaller('./inventory-bulk-cleanup-routes', 'inventory-bulk-cleanup-routes')],
  ['developer-maintenance-routes', optionalInstaller('./developer-maintenance-routes', 'developer-maintenance-routes')],
  ['notification-preference-routes', optionalInstaller('./notification-preference-routes', 'notification-preference-routes')],
  ['notification-feed-routes', optionalInstaller('./notification-feed-routes', 'notification-feed-routes')],
  ['admin-verify-compat-routes', optionalInstaller('./admin-verify-compat-routes', 'admin-verify-compat-routes')]
].filter(([, installer]) => typeof installer === 'function');

const DELETE_PATHS = new Set([
  '/api/items/:itemId',
  '/api/items/:id',
  '/api/bazaar/items/:itemId',
  '/api/bazaar/items/:id'
]);

const REMOVE_ACTION_PATHS = new Set([
  '/api/items/:itemId/remove',
  '/api/items/:id/remove',
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
  const configured = [process.env.FRONTEND_ORIGIN, process.env.PUBLIC_FRONTEND_URL, process.env.CORS_ORIGIN]
    .filter(Boolean)
    .map(value => String(value).replace(/\/$/, ''));
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

function shouldOverride(methodName, path) {
  if (typeof path !== 'string') return false;
  const method = String(methodName || '').toLowerCase();
  if (method === 'delete') return DELETE_PATHS.has(path) || REMOVE_ACTION_PATHS.has(path);
  return REMOVE_ACTION_PATHS.has(path);
}

function installFeatureRoutesOnce(app, originalUse) {
  if (!app || app.__velktradeEarlyFeatureRoutesInstalled) return;
  app.__velktradeEarlyFeatureRoutesInstalled = true;

  if (typeof originalUse === 'function' && !app.__velktradeEarlyCorsInstalled) {
    app.__velktradeEarlyCorsInstalled = true;
    originalUse.call(app, '/api', velktradeEarlyCors);
  }

  if (typeof originalUse === 'function' && !app.__velktradeEarlyBodyParsersInstalled) {
    app.__velktradeEarlyBodyParsersInstalled = true;
    originalUse.call(app, express.json({ limit: '10mb' }));
    originalUse.call(app, express.urlencoded({ extended: true, limit: '10mb' }));
  }

  for (const [label, installer] of routeInstallers) {
    try {
      installer({ app, authMiddleware, run, get });
      console.log(`[VelkTrade preload] Installed ${label}.`);
    } catch (error) {
      console.error(`[VelkTrade preload] Failed while installing ${label}; skipped so backend can still start.`, error);
    }
  }
}

function installMethodOverride(methodName) {
  const original = express.application[methodName];
  if (typeof original !== 'function') return;
  express.application[methodName] = function patchedRoute(path, ...handlers) {
    if (shouldOverride(methodName, path)) return original.call(this, path, velktradeEarlyCors, authMiddleware, robustRemoveItem);
    return original.call(this, path, ...handlers);
  };
}

function installOptionsOverride() {
  const originalOptions = express.application.options;
  if (typeof originalOptions !== 'function') return;
  express.application.options = function patchedOptions(path, ...handlers) {
    return originalOptions.call(this, path, velktradeEarlyCors, ...handlers);
  };
}

function installUseHook() {
  const originalUse = express.application.use;
  if (typeof originalUse !== 'function') return;
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