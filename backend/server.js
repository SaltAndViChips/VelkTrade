require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const { get, all, run, transaction, getDatabaseDiagnostics } = require('./db');
const { registerProfileShareRoute } = require('./profileShareRoute');
const { createToken, authMiddleware } = require('./auth');
const { fetchImgurItem, isImgurUrl } = require('./imgur');
const { normalizeUsername, isSaltUsername, isDeveloperUsername, isProtectedDeveloperUser, isAdminUser, publicUser } = require('./admin');

function isRequesterDeveloper(user) {
  return isProtectedDeveloperUser(user);
}

function canModifyDeveloperTarget(requester, target) {
  if (!isProtectedDeveloperUser(target)) return true;
  return isRequesterDeveloper(requester);
}

function developerAwareUser(user) {
  if (!user) return null;

  const isDeveloper = isProtectedDeveloperUser(user);
  const isAdmin = Boolean(user.is_admin || user.isAdmin || isDeveloper);
  const isVerified = Boolean(user.is_verified || user.isVerified);

  return {
    ...publicUser(user),
    isAdmin,
    isVerified,
    isDeveloper,
    highestBadge: isDeveloper ? 'developer' : isAdmin ? 'admin' : isVerified ? 'trusted' : 'none',
    showBazaarInventory: user.show_bazaar_inventory !== false && user.showBazaarInventory !== false,
    showOnline: user.show_online !== false && user.showOnline !== false,
    bio: user.bio || ''
  };
}



function isProtectedDeveloperAccount(value) {
  const username = typeof value === 'string' ? value : value?.username;
  return ['salt', 'velkon'].includes(String(username || '').trim().toLowerCase());
}



const {
  createRoom,
  joinRoom,
  setOffer,
  setIcOffer,
  removeIcOffer,
  acceptTrade,
  confirmTrade,
  addChatMessage,
  maybeSaveAcceptedSnapshot,
  finalizeTrade,
  leaveRoom,
  publicRoomState,
  listPublicRooms,
  normalizeIcAmount
} = require('./rooms');

const app = express();
const server = http.createServer(app);

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const PORT = process.env.PORT || 3001;
const PUBLIC_FRONTEND_URL = (process.env.PUBLIC_FRONTEND_URL || FRONTEND_ORIGIN || 'https://nicecock.ca/VelkTrade').replace(/\/$/, '');

app.use(express.json());
app.use(cors({ origin: FRONTEND_ORIGIN }));

registerProfileShareRoute(app, {
  get,
  publicFrontendUrl: PUBLIC_FRONTEND_URL
});



const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGIN,
    methods: ['GET', 'POST']
  }
});


const onlineUsers = new Map(); // userId -> { id, username, sockets:Set<string> }

const DEFAULT_NOTIFICATION_PREFS = {
  offline_trades: true,
  counters: true,
  room_invites: true,
  invite_responses: true,
  sound_volume: 0.5,
  flash_tab: true,
  non_verified_notifications: false
};

function isUserOnline(userId) {
  return onlineUsers.has(Number(userId));
}


async function hydrateOnlinePresenceUser(userId, fallbackUser) {
  try {
    const row = await get(
      `SELECT id, username, is_admin, is_verified, show_online
       FROM users
       WHERE id = ?`,
      [userId]
    );

    if (!row) return fallbackUser;

    const isDeveloper = isProtectedDeveloperAccount(row);
    const isAdmin = Boolean(row.is_admin || isDeveloper);

    return {
      id: row.id,
      username: row.username,
      isDeveloper,
      isAdmin,
      isVerified: Boolean(row.is_verified),
      showOnline: row.show_online !== false,
      status: fallbackUser?.status || 'online',
      highestBadge: isDeveloper ? 'developer' : isAdmin ? 'admin' : row.is_verified ? 'verified' : 'none'
    };
  } catch {
    return fallbackUser;
  }
}


function isProtectedDeveloperAccount(value) {
  const username = typeof value === 'string' ? value : value?.username;
  return ['salt', 'velkon'].includes(String(username || '').trim().toLowerCase());
}


function onlineUserList() {
  return Array.from(onlineUsers.values())
    .filter(user => user.showOnline !== false)
    .map(user => {
      const isDeveloper = Boolean(user.isDeveloper || user.is_developer || isProtectedDeveloperAccount?.(user));
      const isAdmin = Boolean(isDeveloper || user.isAdmin || user.is_admin);
      const isVerified = Boolean(user.isVerified || user.is_verified);
      const now = Date.now();
      const since = user.statusSince || now;

      return {
        id: user.id,
        username: user.username,
        isDeveloper,
        isAdmin,
        isVerified,
        isTrusted: isVerified,
        highestBadge: isDeveloper ? 'developer' : isAdmin ? 'admin' : isVerified ? 'trusted' : 'none',
        status: user.status || 'online',
        statusSince: since,
        awayForMs: (user.status || 'online') === 'away' ? Math.max(0, now - since) : 0
      };
    });
}

function socketRoomForUser(userId) {
  return `user:${userId}`;
}

function parsePayload(value) {
  try {
    if (!value) return {};
    if (typeof value === 'object') return value;
    return JSON.parse(value);
  } catch {
    return {};
  }
}


async function markUserSeen(userId) {
  if (!userId) return;

  try {
    await run(
      `UPDATE users
       SET last_seen_at = NOW()
       WHERE id = ?`,
      [userId]
    );
  } catch {
    // Migration may not have finished on first boot.
  }
}













function parseValidIcPrice(value) {
  const clean = String(value || '').trim();

  if (!/^\d[\d,]*(\.\d+)?\s*IC$/i.test(clean)) {
    return null;
  }

  const amount = Number(clean.replace(/\s*IC$/i, '').replace(/,/g, ''));

  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return amount;
}

function normalizeBazaarItem(row, viewerId) {
  const price = String(row.price || '').trim();
  const priceAmount = parseValidIcPrice(price);

  return {
    id: row.id,
    title: row.title,
    image: row.image,
    price,
    priceAmount,
    createdAt: row.createdAt ?? row.createdat,
    ownerId: row.ownerId ?? row.ownerid,
    ownerUsername: row.ownerUsername ?? row.ownerusername,
    ownerVerified: Boolean(row.ownerVerified ?? row.ownerverified),
    interestCount: Number(row.interestCount ?? row.interestcount ?? 0),
    viewerInterested: Boolean(row.viewerInterested ?? row.viewerinterested),
    isOwnItem: Number(row.ownerId ?? row.ownerid) === Number(viewerId)
  };
}

async function isCurrentUserAdminForBazaar(user) {
  if (user?.isAdmin || user?.is_admin) return true;

  const username = String(user?.username || '').trim().toLowerCase();
  if (username === 'salt') return true;

  const row = await get(
    `SELECT username, is_admin
     FROM users
     WHERE id = ?`,
    [user.id]
  );

  return Boolean(row?.is_admin || String(row?.username || '').trim().toLowerCase() === 'salt');
}

async function getBazaarItemForInterest(itemId, userId) {
  const item = await get(
    `SELECT id, userId
     FROM items
     WHERE id = ?`,
    [itemId]
  );

  if (!item) {
    const error = new Error('Item not found');
    error.status = 404;
    throw error;
  }

  if (Number(item.userId) === Number(userId)) {
    const error = new Error('You cannot mark interest in your own item');
    error.status = 400;
    throw error;
  }

  return item;
}

async function addBazaarInterest(itemId, user) {
  const item = await getBazaarItemForInterest(itemId, user.id);

  await run(
    `DELETE FROM buy_requests
     WHERE item_id = ? AND requester_id = ?`,
    [itemId, user.id]
  );

  await run(
    `INSERT INTO buy_requests (item_id, requester_id, owner_id)
     VALUES (?, ?, ?)`,
    [itemId, user.id, item.userId]
  );

  return { ok: true, interested: true };
}

async function removeBazaarInterest(itemId, user) {
  await run(
    `DELETE FROM buy_requests
     WHERE item_id = ? AND requester_id = ?`,
    [itemId, user.id]
  );

  return { ok: true, interested: false };
}

async function toggleBazaarInterest(itemId, user) {
  await getBazaarItemForInterest(itemId, user.id);

  const existing = await get(
    `SELECT 1
     FROM buy_requests
     WHERE item_id = ? AND requester_id = ?
     LIMIT 1`,
    [itemId, user.id]
  );

  if (existing) {
    return removeBazaarInterest(itemId, user);
  }

  return addBazaarInterest(itemId, user);
}

async function handleBazaarInterestError(res, error) {
  res.status(error.status || 500).json({
    error: error.message || 'Could not update Bazaar interest'
  });
}

function normalizeNotification(row) {
  return {
    id: row.id,
    userId: row.user_id ?? row.userId,
    type: row.type,
    title: row.title,
    message: row.message,
    payload: parsePayload(row.payload),
    seen: Boolean(row.seen),
    createdAt: row.created_at ?? row.createdAt
  };
}

async function ensureNotificationPrefs(userId) {
  await run(
    `INSERT INTO notification_preferences (user_id)
     VALUES (?)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );

  const prefs = await get(
    `SELECT
      user_id,
      offline_trades,
      counters,
      room_invites,
      invite_responses,
      sound_volume,
      flash_tab,
      non_verified_notifications
     FROM notification_preferences
     WHERE user_id = ?`,
    [userId]
  );

  return {
    offlineTrades: prefs?.offline_trades ?? DEFAULT_NOTIFICATION_PREFS.offline_trades,
    counters: prefs?.counters ?? DEFAULT_NOTIFICATION_PREFS.counters,
    roomInvites: prefs?.room_invites ?? DEFAULT_NOTIFICATION_PREFS.room_invites,
    inviteResponses: prefs?.invite_responses ?? DEFAULT_NOTIFICATION_PREFS.invite_responses,
    soundVolume: Number(prefs?.sound_volume ?? DEFAULT_NOTIFICATION_PREFS.sound_volume),
    flashTab: prefs?.flash_tab ?? DEFAULT_NOTIFICATION_PREFS.flash_tab,
    nonVerifiedNotifications: prefs?.non_verified_notifications ?? DEFAULT_NOTIFICATION_PREFS.non_verified_notifications
  };
}


async function shouldSendNotificationFromSender({ recipientId, payload }) {
  const senderId = Number(payload?.fromUserId || 0);

  if (!senderId || Number(senderId) === Number(recipientId)) {
    return true;
  }

  const prefs = await ensureNotificationPrefs(recipientId);

  if (prefs.nonVerifiedNotifications) {
    return true;
  }

  const sender = await get(
    `SELECT id, is_verified
     FROM users
     WHERE id = ?`,
    [senderId]
  );

  return Boolean(sender?.is_verified);
}

function prefKeyForNotificationType(type) {
  return {
    offline_trade: 'offlineTrades',
    counter_offer: 'counters',
    room_invite: 'roomInvites',
    invite_response: 'inviteResponses'
  }[type];
}

async function createNotification({ userId, type, title, message, payload = {} }) {
  const prefs = await ensureNotificationPrefs(userId);
  const allowedBySenderVerification = await shouldSendNotificationFromSender({ recipientId: userId, payload });

  if (!allowedBySenderVerification) {
    return null;
  }

  const prefKey = prefKeyForNotificationType(type);

  if (prefKey && prefs[prefKey] === false) {
    return null;
  }

  const result = await run(
    `INSERT INTO notifications (user_id, type, title, message, payload)
     VALUES (?, ?, ?, ?, ?) RETURNING id`,
    [userId, type, title, message, JSON.stringify(payload)]
  );

  const notification = await get(
    `SELECT id, user_id, type, title, message, payload, seen, created_at
     FROM notifications
     WHERE id = ?`,
    [result.lastID]
  );

  const normalized = normalizeNotification(notification);

  io.to(socketRoomForUser(userId)).emit('notification:new', {
    notification: normalized
  });

  return normalized;
}


async function updateNotificationPayload(notificationId, payloadPatch) {
  const row = await get(
    `SELECT id, payload
     FROM notifications
     WHERE id = ?`,
    [notificationId]
  );

  if (!row) return null;

  const nextPayload = {
    ...parsePayload(row.payload),
    ...payloadPatch
  };

  await run(
    `UPDATE notifications
     SET payload = ?
     WHERE id = ?`,
    [JSON.stringify(nextPayload), notificationId]
  );

  return nextPayload;
}

async function expireRoomInviteNotifications(roomId) {
  const cleanRoomId = String(roomId || '').trim().toUpperCase();
  if (!cleanRoomId) return;

  const rows = await all(
    `SELECT id, user_id, type, title, message, payload, seen, created_at
     FROM notifications
     WHERE type = 'room_invite'`,
    []
  );

  for (const row of rows) {
    const payload = parsePayload(row.payload);

    if (String(payload.roomId || '').toUpperCase() !== cleanRoomId) continue;
    if (payload.expired || payload.accepted || payload.declined) continue;

    const nextPayload = {
      ...payload,
      expired: true,
      expiredAt: new Date().toISOString(),
      expiryReason: 'room_closed'
    };

    await run(
      `UPDATE notifications
       SET message = ?, payload = ?
       WHERE id = ?`,
      [
        'This room invite expired because the room was closed.',
        JSON.stringify(nextPayload),
        row.id
      ]
    );

    const updated = normalizeNotification({
      ...row,
      message: 'This room invite expired because the room was closed.',
      payload: JSON.stringify(nextPayload)
    });

    io.to(socketRoomForUser(row.user_id)).emit('notification:updated', {
      notification: updated
    });
  }
}

async function getTradeStatusesByIds(tradeIds) {
  const ids = Array.from(new Set((tradeIds || []).map(Number))).filter(Number.isFinite);

  if (ids.length === 0) return {};

  const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
  const rows = await all(
    `SELECT id, status
     FROM trades
     WHERE id IN (${placeholders})`,
    ids
  );

  return Object.fromEntries(rows.map(row => [String(row.id), row.status]));
}


function broadcastPresence() {
  io.emit('presence:update', {
    users: onlineUserList()
  });
}



function cleanBio(value) {
  return String(value || '').trim().slice(0, 1000);
}

function addThousandsCommas(numberText) {
  const [whole, decimal] = String(numberText).replace(/,/g, '').split('.');
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimal !== undefined ? `${withCommas}.${decimal}` : withCommas;
}

function cleanPrice(value) {
  const raw = String(value || '').trim().slice(0, 80);
  if (!raw) return '';

  const withoutDollar = raw.replace(/^\$\s*/, '').trim();
  const withoutIc = withoutDollar.replace(/\bic\b/ig, '').trim();

  if (/^\d+(\.\d+)?$/.test(withoutIc.replace(/,/g, ''))) {
    return `${addThousandsCommas(withoutIc)} IC`;
  }

  if (/^\d+(\.\d+)?\s*[kmb]$/i.test(withoutIc)) {
    return `${withoutIc} IC`;
  }

  if (/\bIC\b/i.test(withoutDollar)) {
    return withoutDollar.replace(/\bic\b/i, 'IC');
  }

  return withoutDollar;
}

async function hydrateAuthUser(user) {
  if (!user?.id) return user;

  const dbUser = await get(
    `SELECT id, username, is_admin, is_verified, show_bazaar_inventory, bio
     FROM users
     WHERE id = ?`,
    [user.id]
  );

  return dbUser || user;
}

async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) return next();

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    req.user = null;
  }

  next();
}

async function requireAdmin(req, res, next) {
  const dbUser = await hydrateAuthUser(req.user);

  if (!isAdminUser(dbUser)) {
    return res.status(403).json({ error: 'Admin only' });
  }

  req.user = dbUser;
  next();
}

function safeParse(value, fallback) {
  try {
    if (Array.isArray(value)) return value;
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}

function normalizeRawTrade(row) {
  return {
    id: row.id,
    roomId: row.roomId ?? row.roomid,
    fromUser: Number(row.fromUser ?? row.fromuser),
    toUser: Number(row.toUser ?? row.touser),
    fromUsername: row.fromUsername ?? row.fromusername,
    toUsername: row.toUsername ?? row.tousername,
    fromVerified: Boolean(row.fromVerified ?? row.fromverified),
    toVerified: Boolean(row.toVerified ?? row.toverified),
    fromItems: safeParse(row.fromItems ?? row.fromitems, []),
    toItems: safeParse(row.toItems ?? row.toitems, []),
    chatHistory: safeParse(row.chatHistory ?? row.chathistory, []),
    status: row.status,
    createdAt: row.createdAt ?? row.createdat
  };
}

async function getItemsByIds(itemIds) {
  const ids = Array.from(new Set((itemIds || []).map(Number))).filter(Boolean);
  if (ids.length === 0) return [];

  const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
  const rows = await all(
    `SELECT id, title, image, price, userId AS "userId"
     FROM items
     WHERE id IN (${placeholders})`,
    ids
  );

  const byId = new Map(rows.map(item => [Number(item.id), item]));
  return ids.map(id => byId.get(id)).filter(Boolean);
}

async function enrichTradeRows(rows) {
  const normalized = rows.map(normalizeRawTrade);

  return Promise.all(
    normalized.map(async trade => ({
      ...trade,
      fromItemDetails: await getItemsByIds(trade.fromItems),
      toItemDetails: await getItemsByIds(trade.toItems)
    }))
  );
}

async function getTradeById(tradeId) {
  const row = await get(
    `SELECT
      t.id,
      t.roomId AS "roomId",
      t.fromUser AS "fromUser",
      t.toUser AS "toUser",
      t.fromItems AS "fromItems",
      t.toItems AS "toItems",
      t.chatHistory AS "chatHistory",
      t.status,
      t.createdAt AS "createdAt",
      from_user.username AS "fromUsername",
      from_user.is_verified AS "fromVerified",
      to_user.username AS "toUsername",
      to_user.is_verified AS "toVerified"
    FROM trades t
    JOIN users AS from_user ON from_user.id = t.fromUser
    JOIN users AS to_user ON to_user.id = t.toUser
    WHERE t.id = ?`,
    [tradeId]
  );

  return row ? normalizeRawTrade(row) : null;
}

async function assertItemOwnership(tx, itemIds, userId) {
  for (const itemId of itemIds) {
    const item = await tx.get('SELECT id FROM items WHERE id = ? AND userId = ?', [itemId, userId]);
    if (!item) throw new Error(`Invalid item ownership for item ${itemId}`);
  }
}

async function createStoredTrade({ fromUser, toUser, fromItems, toItems, fromIc = '', toIc = '', status = 'pending', message = '' }) {
  const cleanFromItems = Array.from(new Set((fromItems || []).map(Number))).filter(Boolean);
  const cleanToItems = Array.from(new Set((toItems || []).map(Number))).filter(Boolean);

  const chatHistory = [];

  if (message) {
    chatHistory.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: fromUser.id,
      username: fromUser.username,
      message: String(message).trim().slice(0, 500),
      createdAt: new Date().toISOString()
    });
  }

  const icOffers = {
    [fromUser.id]: normalizeIcAmount(fromIc),
    [toUser.id]: normalizeIcAmount(toIc)
  };

  if (Object.values(icOffers).some(Boolean)) {
    chatHistory.push({
      id: `meta-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: 'trade-meta',
      message: JSON.stringify({ icOffers }),
      createdAt: new Date().toISOString()
    });
  }

  return transaction(async tx => {
    await assertItemOwnership(tx, cleanFromItems, fromUser.id);
    await assertItemOwnership(tx, cleanToItems, toUser.id);

    return tx.run(
      `INSERT INTO trades (roomId, fromUser, toUser, fromItems, toItems, chatHistory, status)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        fromUser.id,
        toUser.id,
        JSON.stringify(cleanFromItems),
        JSON.stringify(cleanToItems),
        JSON.stringify(chatHistory),
        status
      ]
    );
  });
}

async function completeStoredTrade(tradeId, userId) {
  const trade = await getTradeById(tradeId);
  if (!trade) throw new Error('Trade not found');
  if (trade.status !== 'accepted') throw new Error('Trade must be accepted before confirming');
  if (![trade.fromUser, trade.toUser].includes(Number(userId))) throw new Error('You are not part of this trade');

  await transaction(async tx => {
    await assertItemOwnership(tx, trade.fromItems, trade.fromUser);
    await assertItemOwnership(tx, trade.toItems, trade.toUser);

    for (const itemId of trade.fromItems) {
      await tx.run('UPDATE items SET userId = ? WHERE id = ?', [trade.toUser, itemId]);
    }

    for (const itemId of trade.toItems) {
      await tx.run('UPDATE items SET userId = ? WHERE id = ?', [trade.fromUser, itemId]);
    }

    await tx.run('UPDATE trades SET status = ? WHERE id = ?', ['completed', tradeId]);
  });
}

async function getBuyRequestRowsForUser(userId) {
  return all(
    `SELECT
      br.id,
      br.item_id AS "itemId",
      br.requester_id AS "requesterId",
      br.owner_id AS "ownerId",
      br.created_at AS "createdAt",
      requester.username AS "requesterUsername",
      owner.username AS "ownerUsername",
      i.title AS "itemTitle",
      i.image AS "itemImage",
      i.price AS "itemPrice"
    FROM buy_requests br
    JOIN users requester ON requester.id = br.requester_id
    JOIN users owner ON owner.id = br.owner_id
    JOIN items i ON i.id = br.item_id
    WHERE br.requester_id = ? OR br.owner_id = ?
    ORDER BY br.created_at DESC`,
    [userId, userId]
  );
}


async function createLoginTradeSummaryNotification(userId) {
  const rows = await all(
    `SELECT id, status, createdAt AS "createdAt"
     FROM trades
     WHERE toUser = ?
       AND status IN ('pending', 'countered', 'accepted')
     ORDER BY createdAt DESC`,
    [userId]
  );

  if (!rows.length) return null;

  const tradeIds = rows.map(row => Number(row.id));

  const notificationRows = await all(
    `SELECT id, payload, seen, created_at
     FROM notifications
     WHERE user_id = ?
       AND type IN ('offline_trade', 'counter_offer')`,
    [userId]
  );

  const viewedTradeIds = new Set();

  notificationRows.forEach(notification => {
    const payload = parsePayload(notification.payload);
    if (payload.tradeId && notification.seen) {
      viewedTradeIds.add(Number(payload.tradeId));
    }
  });

  const unviewed = rows.filter(row => !viewedTradeIds.has(Number(row.id)));

  if (!unviewed.length) return null;

  const newestTrade = unviewed[0];
  const existingSummaryRows = await all(
    `SELECT id, payload, created_at
     FROM notifications
     WHERE user_id = ?
       AND type = 'trade_summary'
     ORDER BY created_at DESC
     LIMIT 5`,
    [userId]
  );

  const newestSetKey = tradeIds.slice(0, 20).join(',');
  const alreadySummarized = existingSummaryRows.some(row => {
    const payload = parsePayload(row.payload);
    return payload.tradeSetKey === newestSetKey && Number(payload.count || 0) === Number(unviewed.length);
  });

  if (alreadySummarized) return null;

  return createNotification({
    userId,
    type: 'trade_summary',
    title: 'Unviewed trade requests',
    message: `You have ${unviewed.length} unviewed trade request${unviewed.length === 1 ? '' : 's'}.`,
    payload: {
      tradeId: newestTrade.id,
      count: unviewed.length,
      tradeIds: unviewed.map(row => Number(row.id)),
      tradeSetKey: newestSetKey
    }
  });
}


app.get('/api/health', async (req, res) => {
  res.json({
    ok: true,
    database: await getDatabaseDiagnostics()
  });
});

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  const cleanUsername = normalizeUsername(username);

  if (!cleanUsername || !password) return res.status(400).json({ error: 'Username and password required' });
  if (cleanUsername.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (String(password).length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

  const existingUser = await get('SELECT id, username FROM users WHERE LOWER(username) = LOWER(?)', [cleanUsername]);
  if (existingUser) return res.status(400).json({ error: `Username already exists as ${existingUser.username}` });

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const result = await run(
      'INSERT INTO users (username, password, is_admin, bio) VALUES (?, ?, ?, ?) RETURNING id',
      [cleanUsername, passwordHash, isSaltUsername(cleanUsername), '']
    );

    const user = {
      id: result.lastID,
      username: cleanUsername,
      is_admin: isSaltUsername(cleanUsername),
      bio: ''
    };

    res.json({ token: createToken(developerAwareUser(user)), user: developerAwareUser(user) });
  } catch {
    res.status(400).json({ error: 'Username already exists' });
  }
});

app.post('/api/login', async (req, res) => {
  const cleanUsername = normalizeUsername(req.body.username);

  const user = await get(
    `SELECT id, username, password, is_admin, is_verified, show_bazaar_inventory, show_online, bio, show_bazaar_inventory, bio
     FROM users
     WHERE LOWER(username) = LOWER(?)`,
    [cleanUsername]
  );

  if (!user) return res.status(401).json({ error: 'Invalid login' });

  if (isSaltUsername(user.username) && !user.is_admin) {
    await run('UPDATE users SET is_admin = TRUE WHERE id = ?', [user.id]);
    user.is_admin = true;
  }

  const valid = await bcrypt.compare(req.body.password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid login' });

  await markUserSeen(user.id);
  await createLoginTradeSummaryNotification(user.id);

  res.json({
    token: createToken(developerAwareUser(user)),
    user: developerAwareUser(user)
  });
});

app.get('/api/me', authMiddleware, async (req, res) => {
  const user = await get(
    `SELECT id, username, is_admin, is_verified, show_bazaar_inventory, bio
     FROM users
     WHERE id = ?`,
    [req.user.id]
  );

  if (user && isSaltUsername(user.username) && !user.is_admin) {
    await run('UPDATE users SET is_admin = TRUE WHERE id = ?', [user.id]);
    user.is_admin = true;
  }

  res.json({ user: user ? { ...publicUser(user), bio: user.bio || '' } : null });
});


app.put('/api/me/bazaar-visibility', authMiddleware, async (req, res) => {
  const showBazaarInventory = Boolean(req.body.showBazaarInventory);

  await run(
    'UPDATE users SET show_bazaar_inventory = ? WHERE id = ?',
    [showBazaarInventory, req.user.id]
  );

  const user = await get(
    `SELECT id, username, is_admin, is_verified, show_bazaar_inventory, bio
     FROM users
     WHERE id = ?`,
    [req.user.id]
  );

  res.json({
    ok: true,
    user: {
      ...publicUser(user),
      bio: user.bio || '',
      showBazaarInventory: user.show_bazaar_inventory !== false
    }
  });
});

app.put('/api/me/profile', authMiddleware, async (req, res) => {
  const bio = cleanBio(req.body.bio);

  await run(
    'UPDATE users SET bio = ? WHERE id = ?',
    [bio, req.user.id]
  );

  const user = await get(
    `SELECT id, username, is_admin, is_verified, show_bazaar_inventory, bio
     FROM users
     WHERE id = ?`,
    [req.user.id]
  );

  res.json({
    ok: true,
    user: { ...developerAwareUser(user), bio: user.bio || '' }
  });
});

app.get('/api/profile/:username', optionalAuth, async (req, res) => {
  const profileUser = await get(
    `SELECT id, username, is_admin, is_verified, show_bazaar_inventory, bio
     FROM users
     WHERE LOWER(username) = LOWER(?)`,
    [normalizeUsername(req.params.username)]
  );

  if (!profileUser) {
    return res.json({ user: null, items: [] });
  }

  const items = await all(
    `SELECT
      i.id,
      i.title,
      i.image,
      i.price,
      i.userId AS "userId",
      EXISTS (
        SELECT 1 FROM buy_requests br
        WHERE br.item_id = i.id
          AND br.requester_id = ?
      ) AS "viewerWouldBuy",
      (
        SELECT COUNT(*)::int FROM buy_requests br
        WHERE br.item_id = i.id
      ) AS "buyRequestCount"
    FROM items i
    WHERE i.userId = ?
    ORDER BY i.id DESC`,
    [req.user?.id || 0, profileUser.id]
  );

  res.json({
    user: {
      id: profileUser.id,
      username: profileUser.username,
      bio: profileUser.bio || '',
      isVerified: Boolean(profileUser.is_verified),
      showBazaarInventory: profileUser.show_bazaar_inventory !== false,
      online: isUserOnline(profileUser.id)
    },
    items
  });
});

app.post('/api/items', authMiddleware, async (req, res) => {
  const { image } = req.body;

  if (!image || !isImgurUrl(image)) {
    return res.status(400).json({ error: 'Valid Imgur link required' });
  }

  const imgurItem = await fetchImgurItem(image);

  const result = await run(
    'INSERT INTO items (userId, title, image, price) VALUES (?, ?, ?, ?) RETURNING id',
    [req.user.id, imgurItem.title, imgurItem.image, cleanPrice(req.body.price)]
  );

  res.json({
    item: {
      id: result.lastID,
      userId: req.user.id,
      title: imgurItem.title,
      image: imgurItem.image,
      price: cleanPrice(req.body.price)
    }
  });
});


app.post('/api/items/restore', authMiddleware, async (req, res) => {
  const title = String(req.body.title || '').trim().slice(0, 200);
  const image = String(req.body.image || '').trim();
  const price = cleanPrice(req.body.price);

  if (!title || !image) {
    return res.status(400).json({ error: 'Title and image are required to restore an item' });
  }

  const result = await run(
    'INSERT INTO items (userId, title, image, price) VALUES (?, ?, ?, ?) RETURNING id',
    [req.user.id, title, image, price]
  );

  res.json({
    ok: true,
    item: {
      id: result.lastID,
      userId: req.user.id,
      title,
      image,
      price,
      showBazaar: true
    }
  });
});

app.patch('/api/items/:id', authMiddleware, async (req, res) => {
  const existing = await get(
    'SELECT id, userId, title, image, price, show_bazaar AS "showBazaar" FROM items WHERE id = ? AND userId = ?',
    [req.params.id, req.user.id]
  );

  if (!existing) {
    return res.status(404).json({ error: 'Item not found' });
  }

  const nextPrice = Object.prototype.hasOwnProperty.call(req.body, 'price')
    ? cleanPrice(req.body.price)
    : existing.price || '';

  const nextShowBazaar = Object.prototype.hasOwnProperty.call(req.body, 'showBazaar')
    ? Boolean(req.body.showBazaar)
    : Boolean(existing.showBazaar ?? true);

  await run(
    'UPDATE items SET price = ?, show_bazaar = ? WHERE id = ? AND userId = ?',
    [nextPrice, nextShowBazaar, req.params.id, req.user.id]
  );

  res.json({
    ok: true,
    item: {
      ...existing,
      price: nextPrice,
      showBazaar: nextShowBazaar
    }
  });
});

app.post('/api/items/:id/refresh-imgur', authMiddleware, async (req, res) => {
  const item = await get('SELECT * FROM items WHERE id = ? AND userId = ?', [req.params.id, req.user.id]);

  if (!item) return res.status(404).json({ error: 'Item not found' });
  if (!isImgurUrl(item.image)) return res.status(400).json({ error: 'Item image is not an Imgur URL' });

  const imgurItem = await fetchImgurItem(item.image);

  await run(
    'UPDATE items SET title = ?, image = ? WHERE id = ? AND userId = ?',
    [imgurItem.title, imgurItem.image, req.params.id, req.user.id]
  );

  res.json({ item: { ...item, title: imgurItem.title, image: imgurItem.image } });
});

app.delete('/api/items/:id', authMiddleware, async (req, res) => {
  const item = await get('SELECT * FROM items WHERE id = ? AND userId = ?', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  await run('DELETE FROM items WHERE id = ? AND userId = ?', [req.params.id, req.user.id]);
  res.json({ ok: true, item });
});

app.post('/api/items/:id/buy-request', authMiddleware, async (req, res) => {
  const item = await get(
    'SELECT id, title, image, price, userId AS "userId" FROM items WHERE id = ?',
    [req.params.id]
  );

  if (!item) return res.status(404).json({ error: 'Item not found' });

  if (Number(item.userId) === Number(req.user.id)) {
    return res.status(400).json({ error: 'You cannot mark your own item as something you would buy' });
  }

  const result = await run(
    `INSERT INTO buy_requests (item_id, requester_id, owner_id)
     VALUES (?, ?, ?)
     ON CONFLICT (item_id, requester_id) DO NOTHING
     RETURNING id`,
    [item.id, req.user.id, item.userId]
  );

  res.json({
    ok: true,
    created: Boolean(result.lastID)
  });
});

app.delete('/api/items/:id/buy-request', authMiddleware, async (req, res) => {
  await run(
    'DELETE FROM buy_requests WHERE item_id = ? AND requester_id = ?',
    [req.params.id, req.user.id]
  );

  res.json({ ok: true });
});

app.get('/api/buy-requests', authMiddleware, async (req, res) => {
  const requests = await getBuyRequestRowsForUser(req.user.id);
  res.json({ requests });
});

app.get('/api/inventory/:username', optionalAuth, async (req, res) => {
  const user = await get(
    `SELECT id, username, bio
     FROM users
     WHERE LOWER(username) = LOWER(?)`,
    [normalizeUsername(req.params.username)]
  );

  if (!user) return res.json({ user: null, items: [] });

  const items = await all(
    `SELECT
      i.id,
      i.title,
      i.image,
      i.price,
      i.userId AS "userId",
      EXISTS (
        SELECT 1 FROM buy_requests br
        WHERE br.item_id = i.id
          AND br.requester_id = ?
      ) AS "viewerWouldBuy",
      (
        SELECT COUNT(*)::int FROM buy_requests br
        WHERE br.item_id = i.id
      ) AS "buyRequestCount"
    FROM items i
    WHERE i.userId = ?
    ORDER BY i.id DESC`,
    [req.user?.id || 0, user.id]
  );

  res.json({ user: { ...user, bio: user.bio || '', isVerified: Boolean(user.is_verified), showBazaarInventory: user.show_bazaar_inventory !== false, online: isUserOnline(user.id) }, items });
});

app.get('/api/trades', authMiddleware, async (req, res) => {
  const rows = await all(
    `SELECT
      t.id,
      t.roomId AS "roomId",
      t.fromUser AS "fromUser",
      t.toUser AS "toUser",
      t.fromItems AS "fromItems",
      t.toItems AS "toItems",
      t.chatHistory AS "chatHistory",
      t.status,
      t.createdAt AS "createdAt",
      from_user.username AS "fromUsername",
      from_user.is_verified AS "fromVerified",
      to_user.username AS "toUsername",
      to_user.is_verified AS "toVerified"
    FROM trades t
    JOIN users AS from_user ON from_user.id = t.fromUser
    JOIN users AS to_user ON to_user.id = t.toUser
    WHERE t.fromUser = ? OR t.toUser = ?
    ORDER BY t.createdAt DESC`,
    [req.user.id, req.user.id]
  );

  res.json({
    trades: await enrichTradeRows(rows),
    buyRequests: await getBuyRequestRowsForUser(req.user.id)
  });
});

app.post('/api/trades/offers', authMiddleware, async (req, res) => {
  const { toUsername, fromItems = [], toItems = [], fromIc = '', toIc = '', message = '' } = req.body;
  const target = await get('SELECT id, username FROM users WHERE LOWER(username) = LOWER(?)', [normalizeUsername(toUsername)]);

  if (!target) return res.status(404).json({ error: 'Target user not found' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot trade with yourself' });

  try {
    const result = await createStoredTrade({
      fromUser: req.user,
      toUser: target,
      fromItems,
      toItems,
      fromIc,
      toIc,
      status: 'pending',
      message
    });

    await createNotification({
      userId: target.id,
      type: 'offline_trade',
      title: 'New offline trade request',
      message: `${req.user.username} sent you an offline trade request.`,
      payload: {
        tradeId: result.lastID,
        fromUserId: req.user.id,
        fromUsername: req.user.username
      }
    });

    await createNotification({
      userId: target.id,
      type: 'offline_trade',
      title: 'New offline trade request',
      message: `${req.user.username} sent you an offline trade request.`,
      payload: {
        tradeId: result.lastID,
        fromUserId: req.user.id,
        fromUsername: req.user.username
      }
    });

    res.json({ ok: true, tradeId: result.lastID });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/trades/:id/counter', authMiddleware, async (req, res) => {
  const original = await getTradeById(req.params.id);

  if (!original) return res.status(404).json({ error: 'Trade not found' });

  const currentUserId = Number(req.user.id);

  if (![original.fromUser, original.toUser].includes(currentUserId)) {
    return res.status(403).json({ error: 'You are not part of this trade' });
  }

  if (original.status === 'completed') {
    return res.status(400).json({ error: 'Completed trades cannot be countered' });
  }

  const otherUserId = original.fromUser === currentUserId ? original.toUser : original.fromUser;
  const otherUser = await get('SELECT id, username FROM users WHERE id = ?', [otherUserId]);

  try {
    await run('UPDATE trades SET status = ? WHERE id = ?', ['declined', req.params.id]);

    const result = await createStoredTrade({
      fromUser: req.user,
      toUser: otherUser,
      fromItems: req.body.fromItems || [],
      toItems: req.body.toItems || [],
      fromIc: req.body.fromIc || '',
      toIc: req.body.toIc || '',
      status: 'countered',
      message: req.body.message || `Counter offer for trade #${original.id}`
    });

    res.json({ ok: true, tradeId: result.lastID });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/trades/:id/accept', authMiddleware, async (req, res) => {
  const trade = await getTradeById(req.params.id);

  if (!trade) return res.status(404).json({ error: 'Trade not found' });
  if (![trade.fromUser, trade.toUser].includes(Number(req.user.id))) return res.status(403).json({ error: 'You are not part of this trade' });
  if (trade.status === 'completed') return res.status(400).json({ error: 'Trade already completed' });
  if (trade.status === 'declined') return res.status(400).json({ error: 'Trade already declined' });

  await run('UPDATE trades SET status = ? WHERE id = ?', ['accepted', req.params.id]);

  res.json({ ok: true });
});

app.post('/api/trades/:id/confirm', authMiddleware, async (req, res) => {
  try {
    await completeStoredTrade(req.params.id, req.user.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/trades/:id/decline', authMiddleware, async (req, res) => {
  const trade = await getTradeById(req.params.id);

  if (!trade) return res.status(404).json({ error: 'Trade not found' });
  if (![trade.fromUser, trade.toUser].includes(Number(req.user.id))) return res.status(403).json({ error: 'You are not part of this trade' });
  if (trade.status === 'completed') return res.status(400).json({ error: 'Completed trades cannot be declined' });

  await run('UPDATE trades SET status = ? WHERE id = ?', ['declined', req.params.id]);

  const otherUserId = Number(trade.fromUser) === Number(req.user.id)
    ? trade.toUser
    : trade.fromUser;

  await createNotification({
    userId: otherUserId,
    type: 'trade_declined',
    title: 'Trade request declined',
    message: `${req.user.username} declined your trade request.`,
    payload: {
      tradeId: Number(req.params.id),
      fromUsername: req.user.username
    }
  });

  res.json({ ok: true });
});


app.get('/api/admin/rooms', authMiddleware, requireAdmin, async (req, res) => {
  const rooms = listPublicRooms()
    .filter(room => Array.isArray(room.players) && room.players.length === 2)
    .map(room => ({
      roomId: room.roomId,
      players: room.players,
      offers: room.offers || {},
      icOffers: room.icOffers || {},
      accepted: room.accepted || {},
      confirmed: room.confirmed || {},
      acceptedTradeId: room.acceptedTradeId || null,
      completed: Boolean(room.completed),
      messagesCount: Array.isArray(room.messages) ? room.messages.length : 0
    }));

  res.json({ rooms });
});

app.get('/api/admin/users', authMiddleware, requireAdmin, async (req, res) => {
  const rows = await all(
    `SELECT id, username, is_admin, is_verified, show_bazaar_inventory, bio
     FROM users
     ORDER BY LOWER(username) ASC`
  );

  res.json({
    users: rows.map(user => ({ ...publicUser(user), bio: user.bio || '', isVerified: Boolean(user.is_verified), online: typeof isUserOnline === 'function' ? isUserOnline(user.id) : false }))
  });
});

app.post('/api/admin/set-admin', authMiddleware, requireAdmin, async (req, res) => {
  const { username, isAdmin } = req.body;
  const cleanUsername = normalizeUsername(username);

  if (!cleanUsername) return res.status(400).json({ error: 'Username required' });

  const target = await get(
    `SELECT id, username, is_admin, is_verified, show_bazaar_inventory
     FROM users
     WHERE LOWER(username) = LOWER(?)`,
    [cleanUsername]
  );

  if (!target) return res.status(404).json({ error: 'User not found' });
  if (isProtectedDeveloperAccount(target)) {
    return res.status(403).json({ error: 'Developer accounts cannot be modified by admins' });
  }
if (isSaltUsername(target.username) && isAdmin === false) {
    return res.status(400).json({ error: 'Salt cannot lose admin access' });
  }

  await run('UPDATE users SET is_admin = ? WHERE id = ?', [Boolean(isAdmin), target.id]);

  const updated = await get(
    `SELECT id, username, is_admin, is_verified, show_bazaar_inventory
     FROM users
     WHERE id = ?`,
    [target.id]
  );

  res.json({
    ok: true,
    user: publicUser(updated),
    message: `${updated.username} is ${publicUser(updated).isAdmin ? 'now an admin' : 'no longer an admin'}`
  });
});

app.get('/api/admin/trades', authMiddleware, requireAdmin, async (req, res) => {
  const rows = await all(
    `SELECT
      t.id,
      t.roomId AS "roomId",
      t.fromUser AS "fromUser",
      t.toUser AS "toUser",
      t.fromItems AS "fromItems",
      t.toItems AS "toItems",
      t.chatHistory AS "chatHistory",
      t.status,
      t.createdAt AS "createdAt",
      from_user.username AS "fromUsername",
      from_user.is_verified AS "fromVerified",
      to_user.username AS "toUsername",
      to_user.is_verified AS "toVerified"
    FROM trades t
    JOIN users AS from_user ON from_user.id = t.fromUser
    JOIN users AS to_user ON to_user.id = t.toUser
    ORDER BY t.createdAt DESC`
  );

  res.json({ trades: await enrichTradeRows(rows) });
});


app.post('/api/admin/set-verified', authMiddleware, requireAdmin, async (req, res) => {
  const { username, isVerified } = req.body;
  const cleanUsername = normalizeUsername(username);

  if (!cleanUsername) return res.status(400).json({ error: 'Username required' });

  const target = await get(
    `SELECT id, username, is_verified
     FROM users
     WHERE LOWER(username) = LOWER(?)`,
    [cleanUsername]
  );

  if (!target) return res.status(404).json({ error: 'User not found' });


  if (isProtectedDeveloperAccount(target)) {
    return res.status(403).json({ error: 'Developer accounts cannot be modified by admins' });
  }
await run('UPDATE users SET is_verified = ? WHERE id = ?', [Boolean(isVerified), target.id]);

  const updated = await get(
    `SELECT id, username, is_admin, is_verified, show_bazaar_inventory
     FROM users
     WHERE id = ?`,
    [target.id]
  );

  res.json({
    ok: true,
    user: publicUser(updated),
    message: `${updated.username} is ${Boolean(updated.is_verified) ? 'now verified' : 'no longer verified'}`
  });
});

app.post('/api/admin/reset-password', authMiddleware, requireAdmin, async (req, res) => {
  const { username, newPassword } = req.body;
  const cleanUsername = normalizeUsername(username);

  if (!cleanUsername || !newPassword) return res.status(400).json({ error: 'Username and new password required' });
  if (String(newPassword).length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

  const target = await get('SELECT id, username FROM users WHERE LOWER(username) = LOWER(?)', [cleanUsername]);
  if (!target) return res.status(404).json({ error: 'User not found' });


  if (isProtectedDeveloperAccount(target)) {
    return res.status(403).json({ error: 'Developer accounts cannot be modified by admins' });
  }
const passwordHash = await bcrypt.hash(newPassword, 10);

  await run('UPDATE users SET password = ? WHERE id = ?', [passwordHash, target.id]);

  res.json({ ok: true, message: `Password reset for ${target.username}` });
});















app.get('/api/bazaar', authMiddleware, async (req, res) => {
  const search = String(req.query.search || '').trim().toLowerCase();
  const sort = String(req.query.sort || 'newest');
  const verifiedFilter = String(req.query.verified || 'all');
  const min = req.query.min !== undefined && req.query.min !== '' ? Number(req.query.min) : null;
  const max = req.query.max !== undefined && req.query.max !== '' ? Number(req.query.max) : null;
  const minInterest = req.query.minInterest !== undefined && req.query.minInterest !== '' ? Number(req.query.minInterest) : null;
  const viewerIsAdmin = await isCurrentUserAdminForBazaar(req.user);

  const rows = await all(
    `SELECT
      items.id,
      items.title,
      items.image,
      COALESCE(items.price, '') AS price,
      COALESCE(items.createdAt, NOW()) AS "createdAt",
      items.userId AS "ownerId",
      users.username AS "ownerUsername",
      COALESCE(users.is_verified, FALSE) AS "ownerVerified",
      COALESCE(COUNT(CASE WHEN interested_users.is_verified = TRUE THEN buy_requests.id END), 0)::int AS "interestCount",
      COALESCE(MAX(CASE WHEN buy_requests.requester_id = ? THEN 1 ELSE 0 END), 0)::int AS "viewerInterested"
     FROM items
     JOIN users ON users.id = items.userId
     LEFT JOIN buy_requests ON buy_requests.item_id = items.id
     LEFT JOIN users AS interested_users ON interested_users.id = buy_requests.requester_id
     WHERE COALESCE(users.show_bazaar_inventory, TRUE) = TRUE
       AND COALESCE(users.last_seen_at, NOW()) >= NOW() - INTERVAL '7 days'
     GROUP BY items.id, items.title, items.image, items.price, items.createdAt, items.userId, users.username, users.is_verified
     ORDER BY COALESCE(items.createdAt, NOW()) DESC`,
    [req.user.id]
  );

  let items = rows
    .map(row => normalizeBazaarItem(row, req.user.id))
    .filter(item => item.priceAmount !== null);

  if (verifiedFilter === 'verified') {
    items = items.filter(item => item.ownerVerified);
  } else if (verifiedFilter === 'nonverified') {
    items = items.filter(item => !item.ownerVerified);
  }

  if (search) {
    items = items.filter(item => {
      return [
        item.title,
        item.price,
        String(item.priceAmount),
        viewerIsAdmin ? item.ownerUsername : ''
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(search);
    });
  }

  if (Number.isFinite(min)) {
    items = items.filter(item => item.priceAmount >= min);
  }

  if (Number.isFinite(max)) {
    items = items.filter(item => item.priceAmount <= max);
  }

  if (Number.isFinite(minInterest)) {
    items = items.filter(item => item.interestCount >= minInterest);
  }

  if (sort === 'interest') {
    items.sort((a, b) => b.interestCount - a.interestCount || new Date(b.createdAt) - new Date(a.createdAt));
  } else if (sort === 'highest') {
    items.sort((a, b) => b.priceAmount - a.priceAmount || new Date(b.createdAt) - new Date(a.createdAt));
  } else if (sort === 'lowest') {
    items.sort((a, b) => a.priceAmount - b.priceAmount || new Date(b.createdAt) - new Date(a.createdAt));
  } else {
    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  res.json({
    items: items.map(item => {
      const publicItem = {
        id: item.id,
        title: item.title,
        image: item.image,
        price: item.price,
        priceAmount: item.priceAmount,
        createdAt: item.createdAt,
        interestCount: item.interestCount,
        viewerInterested: item.viewerInterested,
        isOwnItem: item.isOwnItem,
        ownerVerified: item.ownerVerified
      };

      if (viewerIsAdmin) {
        publicItem.ownerUsername = item.ownerUsername;
      }

      return publicItem;
    })
  });
});

app.get('/api/bazaar/items/:id/interest', authMiddleware, async (req, res) => {
  try {
    const result = await toggleBazaarInterest(req.params.id, req.user);
    res.json(result);
  } catch (error) {
    await handleBazaarInterestError(res, error);
  }
});

app.post('/api/bazaar/items/:id/interest', authMiddleware, async (req, res) => {
  try {
    const result = await addBazaarInterest(req.params.id, req.user);
    res.json(result);
  } catch (error) {
    await handleBazaarInterestError(res, error);
  }
});

app.delete('/api/bazaar/items/:id/interest', authMiddleware, async (req, res) => {
  try {
    const result = await removeBazaarInterest(req.params.id, req.user);
    res.json(result);
  } catch (error) {
    await handleBazaarInterestError(res, error);
  }
});


app.get('/api/online-users', authMiddleware, async (req, res) => {
  const socketUsers = onlineUserList();

  if (socketUsers.length) {
    return res.json({ users: socketUsers });
  }

  const rows = await all(
    `SELECT id, username, is_admin, is_verified, show_online, last_seen_at
     FROM users
     WHERE COALESCE(show_online, TRUE) = TRUE
       AND COALESCE(last_seen_at, NOW()) >= NOW() - INTERVAL '15 minutes'
     ORDER BY
       CASE WHEN LOWER(username) IN ('salt', 'velkon') THEN 0
            WHEN is_admin = TRUE THEN 1
            WHEN is_verified = TRUE THEN 2
            ELSE 3
       END,
       LOWER(username) ASC`
  );

  res.json({
    users: rows.map(row => {
      const isDeveloper = isProtectedDeveloperAccount(row);
      const isAdmin = Boolean(row.is_admin || isDeveloper);
      const isVerified = Boolean(row.is_verified);

      return {
        id: row.id,
        username: row.username,
        isDeveloper,
        isAdmin,
        isVerified,
        highestBadge: isDeveloper ? 'developer' : isAdmin ? 'admin' : isVerified ? 'trusted' : 'none',
        isTrusted: isVerified,
        status: 'online',
        statusSince: row.last_seen_at ? new Date(row.last_seen_at).getTime() : Date.now()
      };
    })
  });
});

app.get('/api/notifications', authMiddleware, async (req, res) => {
  const prefs = await ensureNotificationPrefs(req.user.id);
  const rows = await all(
    `SELECT id, user_id, type, title, message, payload, seen, created_at
     FROM notifications
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 100`,
    [req.user.id]
  );

  const normalizedNotifications = rows.map(normalizeNotification);
  const tradeIds = normalizedNotifications
    .filter(notification => ['offline_trade', 'counter_offer'].includes(notification.type))
    .map(notification => notification.payload?.tradeId);

  res.json({
    notifications: normalizedNotifications,
    preferences: prefs,
    onlineUsers: onlineUserList(),
    tradeStatuses: await getTradeStatusesByIds(tradeIds)
  });
});

app.put('/api/notification-preferences', authMiddleware, async (req, res) => {
  const soundVolume = Math.max(0, Math.min(1, Number(req.body.soundVolume ?? 0.5)));

  await run(
    `INSERT INTO notification_preferences
      (user_id, offline_trades, counters, room_invites, invite_responses, sound_volume, flash_tab, non_verified_notifications)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET
      offline_trades = EXCLUDED.offline_trades,
      counters = EXCLUDED.counters,
      room_invites = EXCLUDED.room_invites,
      invite_responses = EXCLUDED.invite_responses,
      sound_volume = EXCLUDED.sound_volume,
      flash_tab = EXCLUDED.flash_tab,
      non_verified_notifications = EXCLUDED.non_verified_notifications`,
    [
      req.user.id,
      Boolean(req.body.offlineTrades),
      Boolean(req.body.counters),
      Boolean(req.body.roomInvites),
      Boolean(req.body.inviteResponses),
      soundVolume,
      Boolean(req.body.flashTab),
      Boolean(req.body.nonVerifiedNotifications)
    ]
  );

  res.json({
    ok: true,
    preferences: await ensureNotificationPrefs(req.user.id)
  });
});

app.post('/api/notifications/:id/read', authMiddleware, async (req, res) => {
  await run(
    'UPDATE notifications SET seen = TRUE WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id]
  );

  res.json({ ok: true });
});

app.post('/api/notifications/read-all', authMiddleware, async (req, res) => {
  await run(
    'UPDATE notifications SET seen = TRUE WHERE user_id = ?',
    [req.user.id]
  );

  res.json({ ok: true });
});

app.get('/api/presence', authMiddleware, async (req, res) => {
  res.json({
    onlineUsers: onlineUserList()
  });
});


io.use((socket, next) => {
  try {
    socket.user = jwt.verify(socket.handshake.auth.token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', socket => {
  const userId = Number(socket.user.id);
  markUserSeen(userId);
  const existing = onlineUsers.get(userId) || {
    id: userId,
    username: socket.user.username,
    isDeveloper: Boolean(socket.user.isDeveloper || socket.user.is_developer || isProtectedDeveloperAccount(socket.user)),
    isAdmin: Boolean(socket.user.isAdmin || socket.user.is_admin || isProtectedDeveloperAccount(socket.user)),
    isVerified: Boolean(socket.user.isVerified || socket.user.is_verified),
    showOnline: socket.user.showOnline !== false && socket.user.show_online !== false,
    status: 'online',
    highestBadge: isProtectedDeveloperAccount(socket.user) ? 'developer' : (socket.user.isAdmin || socket.user.is_admin) ? 'admin' : (socket.user.isVerified || socket.user.is_verified) ? 'verified' : 'none',
    sockets: new Set()
  };

  existing.sockets.add(socket.id);
  onlineUsers.set(userId, existing);
  socket.join(socketRoomForUser(userId));
  broadcastPresence();

  socket.on('disconnect', () => {
    const current = onlineUsers.get(userId);

    if (!current) return;

    current.sockets.delete(socket.id);

    if (current.sockets.size === 0) {
      onlineUsers.delete(userId);
    } else {
      onlineUsers.set(userId, current);
    }

    broadcastPresence();
  });

  socket.on('room:create', () => {
    const room = createRoom(socket.user);
    socket.join(room.roomId);
    socket.emit('room:update', publicRoomState(room));
  });


  socket.on('room:invite', async ({ roomId, username }) => {
    try {
      const cleanRoomId = String(roomId || '').trim().toUpperCase();
      const target = await get(
        'SELECT id, username FROM users WHERE LOWER(username) = LOWER(?)',
        [normalizeUsername(username)]
      );

      if (!target) {
        return socket.emit('room:error', 'Player not found');
      }

      if (Number(target.id) === Number(socket.user.id)) {
        return socket.emit('room:error', 'You cannot invite yourself');
      }

      await createNotification({
        userId: target.id,
        type: 'room_invite',
        title: 'Room invite',
        message: `${socket.user.username} invited you to join room ${cleanRoomId}.`,
        payload: {
          roomId: cleanRoomId,
          fromUserId: socket.user.id,
          fromUsername: socket.user.username
        }
      });
    } catch (error) {
      socket.emit('room:error', error.message || 'Could not send invite');
    }
  });

  socket.on('room:invite-response', async ({ roomId, inviterId, accepted, notificationId }) => {
    try {
      const cleanRoomId = String(roomId || '').trim().toUpperCase();

      if (notificationId) {
        const nextPayload = await updateNotificationPayload(notificationId, {
          accepted: Boolean(accepted),
          declined: !accepted,
          respondedAt: new Date().toISOString()
        });

        if (nextPayload) {
          const updatedRow = await get(
            `SELECT id, user_id, type, title, message, payload, seen, created_at
             FROM notifications
             WHERE id = ?`,
            [notificationId]
          );

          if (updatedRow) {
            io.to(socketRoomForUser(socket.user.id)).emit('notification:updated', {
              notification: normalizeNotification(updatedRow)
            });
          }
        }
      }

      if (!inviterId) return;

      await createNotification({
        userId: Number(inviterId),
        type: 'invite_response',
        title: accepted ? 'Room invite accepted' : 'Room invite declined',
        message: `${socket.user.username} ${accepted ? 'accepted' : 'declined'} your invite to room ${cleanRoomId}.`,
        payload: {
          roomId: cleanRoomId,
          fromUserId: socket.user.id,
          fromUsername: socket.user.username,
          accepted: Boolean(accepted)
        }
      });
    } catch (error) {
      socket.emit('room:error', error.message || 'Could not send invite response');
    }
  });

  socket.on('room:join', ({ roomId }) => {
    try {
      const room = joinRoom(roomId, socket.user);
      socket.join(room.roomId);
      io.to(room.roomId).emit('room:update', publicRoomState(room));
      io.to(room.roomId).emit('inventory:refresh', { reason: 'room-join' });
    } catch (error) {
      socket.emit('room:error', error.message);
    }
  });

  socket.on('room:leave', async ({ roomId }) => {
    try {
      const cleanRoomId = String(roomId || '').trim().toUpperCase();
      await expireRoomInviteNotifications(cleanRoomId);
      await leaveRoom(cleanRoomId, socket.user.id);
      io.to(cleanRoomId).emit('room:closed');
    } catch (error) {
      socket.emit('room:error', error.message);
    }
  });

  socket.on('inventory:updated', ({ roomId }) => {
    if (!roomId) return;

    io.to(roomId).emit('inventory:refresh', {
      reason: 'inventory-updated',
      userId: socket.user.id,
      username: socket.user.username
    });
  });

  socket.on('trade:offer', ({ roomId, itemIds }) => {
    try {
      const room = setOffer(roomId, socket.user.id, itemIds);
      const state = publicRoomState(room);

      io.to(room.roomId).emit('room:update', state);
      io.to(room.roomId).emit('trade:offer-updated', {
        room: state,
        userId: socket.user.id,
        username: socket.user.username
      });
      io.to(room.roomId).emit('inventory:refresh', {
        reason: 'offer-updated',
        userId: socket.user.id,
        username: socket.user.username
      });
    } catch (error) {
      socket.emit('room:error', error.message || 'Could not update offer');
    }
  });


  socket.on('trade:ic-offer', ({ roomId, amount }) => {
    try {
      const room = setIcOffer(roomId, socket.user.id, amount);
      const state = publicRoomState(room);

      io.to(room.roomId).emit('room:update', state);
      io.to(room.roomId).emit('trade:offer-updated', {
        room: state,
        userId: socket.user.id,
        username: socket.user.username
      });
    } catch (error) {
      socket.emit('room:error', error.message || 'Could not update IC offer');
    }
  });

  socket.on('trade:ic-remove', ({ roomId }) => {
    try {
      const room = removeIcOffer(roomId, socket.user.id);
      const state = publicRoomState(room);

      io.to(room.roomId).emit('room:update', state);
      io.to(room.roomId).emit('trade:offer-updated', {
        room: state,
        userId: socket.user.id,
        username: socket.user.username
      });
    } catch (error) {
      socket.emit('room:error', error.message || 'Could not remove IC offer');
    }
  });

  socket.on('trade:accept', async ({ roomId }) => {
    try {
      const room = acceptTrade(roomId, socket.user.id);
      const acceptedSnapshot = await maybeSaveAcceptedSnapshot(room);

      io.to(room.roomId).emit('room:update', publicRoomState(room));

      if (acceptedSnapshot) {
        io.to(room.roomId).emit('trade:accepted-saved', {
          tradeId: acceptedSnapshot.lastID
        });
      }
    } catch (error) {
      socket.emit('room:error', error.message);
    }
  });

  socket.on('trade:confirm', async ({ roomId }) => {
    try {
      const room = confirmTrade(roomId, socket.user.id);
      await finalizeTrade(room);
      io.to(room.roomId).emit('room:update', publicRoomState(room));

      if (room.completed) {
        io.to(room.roomId).emit('trade:completed');
        io.to(room.roomId).emit('inventory:refresh', { reason: 'trade-completed' });
      }
    } catch (error) {
      socket.emit('room:error', error.message);
    }
  });

  socket.on('chat:send', ({ roomId, message }) => {
    try {
      const { room, chatMessage } = addChatMessage(roomId, socket.user, message);
      io.to(room.roomId).emit('chat:message', chatMessage);
      io.to(room.roomId).emit('room:update', publicRoomState(room));
    } catch (error) {
      socket.emit('room:error', error.message);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
