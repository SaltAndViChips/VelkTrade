/*
  VelkTrade hard delete route override.

  This file is loaded with Node's -r flag before server.js. It patches Express
  route registration so every legacy item-removal endpoint uses one consistent
  persistent delete handler instead of the older handlers that only cleared price
  or marked trade_pending.
*/

const express = require('express');
const { get, run } = require('./db');
const { authMiddleware } = require('./auth');

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

function currentUserId(req) {
  return req.user?.id || req.userId || req.session?.user?.id || req.session?.userId;
}

function isAdminOrDeveloper(req) {
  const username = String(req.user?.username || req.session?.user?.username || '').trim().toLowerCase();
  return Boolean(
    req.user?.isAdmin ||
    req.user?.is_admin ||
    req.user?.admin ||
    req.user?.isDeveloper ||
    req.user?.is_developer ||
    req.user?.developer ||
    req.user?.role === 'admin' ||
    req.user?.role === 'developer' ||
    username === 'salt' ||
    username === 'velkon'
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

    if (!itemId) {
      return res.status(400).json({ error: 'Missing item id' });
    }

    const item = await get('SELECT * FROM items WHERE id = ?', [itemId]);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (!ownsItem(req, item) && !isAdminOrDeveloper(req)) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    await run('DELETE FROM buy_requests WHERE item_id = ?', [itemId]).catch(() => {});

    const deleted = await run('DELETE FROM items WHERE id = ? RETURNING id', [itemId]);
    const deletedCount = Number(deleted?.rowCount || deleted?.rows?.length || 0);

    if (deletedCount < 1) {
      return res.status(404).json({ error: 'Item not deleted' });
    }

    return res.json({
      ok: true,
      itemId: Number(itemId),
      removed: true,
      deleted: true,
      hardDeleted: true
    });
  } catch (error) {
    console.error('Hard item delete failed:', error);
    return res.status(500).json({ error: error.message || 'Failed to remove item' });
  }
}

function shouldOverride(path) {
  return typeof path === 'string' && TARGET_PATHS.has(path);
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

installMethodOverride('delete');
installMethodOverride('post');

module.exports = { robustRemoveItem };
