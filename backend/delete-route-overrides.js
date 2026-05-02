/*
  VelkTrade hard delete route override + early compatibility route installer.

  Loaded with Node's -r flag before server.js. It patches Express route
  registration so every item-removal endpoint uses a consistent persistent
  delete handler instead of legacy listing-only handlers. It also installs the
  item-lock and buy-offer/audit/price-history route packs as soon as the Express
  app starts registering middleware.
*/

const express = require('express');
const { get, run } = require('./db');
const { authMiddleware } = require('./auth');
const installItemLockRoutes = require('./item-lock-routes');
const installBuyOfferAuditPriceRoutes = require('./buy-offer-audit-price-routes');

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

    if (!isIntegerId(itemId)) {
      return res.status(400).json({ error: 'Invalid item id', itemId: itemId || '' });
    }

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

function installFeatureRoutesOnce(app) {
  if (!app || app.__velktradeEarlyFeatureRoutesInstalled) return;
  app.__velktradeEarlyFeatureRoutesInstalled = true;
  installItemLockRoutes({ app, authMiddleware, run, get });
  installBuyOfferAuditPriceRoutes({ app, authMiddleware });
}

function installMethodOverride(methodName) {
  const original = express.application[methodName];

  express.application[methodName] = function patchedRoute(path, ...handlers) {
    if (shouldOverride(path)) {
      return original.call(this, path, authMiddleware, robustRemoveItem);
    }

    return original.call(this, path, ...handlers);
  };
}

function installUseHook() {
  const originalUse = express.application.use;

  express.application.use = function patchedUse(...args) {
    installFeatureRoutesOnce(this);
    return originalUse.call(this, ...args);
  };
}

installMethodOverride('delete');
installMethodOverride('post');
installMethodOverride('put');
installMethodOverride('patch');
installUseHook();

module.exports = { robustRemoveItem };
