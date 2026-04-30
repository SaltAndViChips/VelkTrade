require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const { get, all, run, transaction, getDatabaseDiagnostics } = require('./db');
const { createToken, authMiddleware } = require('./auth');
const { fetchImgurItem, isImgurUrl } = require('./imgur');
const {
  normalizeUsername,
  isSaltUsername,
  isAdminUser,
  publicUser
} = require('./admin');
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
  normalizeIcAmount
} = require('./rooms');

const app = express();
const server = http.createServer(app);

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const PORT = process.env.PORT || 3001;
const PUBLIC_FRONTEND_URL = (process.env.PUBLIC_FRONTEND_URL || FRONTEND_ORIGIN || 'https://nicecock.ca/VelkTrade').replace(/\/$/, '');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function profileUrl(username) {
  return `${PUBLIC_FRONTEND_URL}/user/${encodeURIComponent(username)}`;
}

function socialPreviewImageUrl() {
  if (PUBLIC_FRONTEND_URL.includes('nicecock.ca')) {
    return `${PUBLIC_FRONTEND_URL}/social-preview.png`;
  }

  return 'https://nicecock.ca/VelkTrade/social-preview.png';
}

function isCrawlerRequest(req) {
  const userAgent = String(req.get('user-agent') || '').toLowerCase();

  return [
    'discordbot',
    'twitterbot',
    'facebookexternalhit',
    'facebot',
    'slackbot',
    'linkedinbot',
    'telegrambot',
    'whatsapp',
    'embedly',
    'quora link preview',
    'pinterest',
    'vkshare'
  ].some(bot => userAgent.includes(bot));
}

function sharePageHtml({
  req,
  title,
  description,
  image,
  destination,
  shouldRedirect
}) {
  const canonicalShareUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="theme-color" content="#8d63ff">

  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Salts Trading Board">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonicalShareUrl)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta property="og:image:secure_url" content="${escapeHtml(image)}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="1200">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">

  <link rel="canonical" href="${escapeHtml(destination)}">
  ${shouldRedirect ? `<meta http-equiv="refresh" content="0; url=${escapeHtml(destination)}">` : ''}
</head>
<body style="background:#09070f;color:#f2efff;font-family:Arial,sans-serif">
  <main style="max-width:720px;margin:40px auto;padding:24px;border:1px solid #6f5ca8;border-radius:16px;background:#171522">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(description)}</p>
    <p><a style="color:#b99dff" href="${escapeHtml(destination)}">Open profile</a></p>
  </main>
  ${shouldRedirect ? `<script>window.location.replace(${JSON.stringify(destination)});</script>` : ''}
</body>
</html>`;
}

app.use(express.json());
app.use(cors({ origin: FRONTEND_ORIGIN }));

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
  flash_tab: true
};

function isUserOnline(userId) {
  return onlineUsers.has(Number(userId));
}

function onlineUserList() {
  return Array.from(onlineUsers.values()).map(user => ({
    id: user.id,
    username: user.username
  }));
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
      flash_tab
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
    flashTab: prefs?.flash_tab ?? DEFAULT_NOTIFICATION_PREFS.flash_tab
  };
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
    `SELECT id, username, is_admin, bio
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
      to_user.username AS "toUsername"
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



app.get('/u/:username', async (req, res) => {
  const username = normalizeUsername(req.params.username);
  const image = socialPreviewImageUrl();

  const profileUser = await get(
    `SELECT id, username, bio
     FROM users
     WHERE LOWER(username) = LOWER(?)`,
    [username]
  );

  if (!profileUser) {
    const fallbackUrl = `${PUBLIC_FRONTEND_URL}/`;
    const title = 'Player not found - Salts Trading Board';
    const description = 'This VelkTrade profile could not be found.';

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    return res.status(404).send(sharePageHtml({
      req,
      title,
      description,
      image,
      destination: fallbackUrl,
      shouldRedirect: !isCrawlerRequest(req)
    }));
  }

  const itemCountRow = await get(
    `SELECT COUNT(*)::int AS count
     FROM items
     WHERE userId = ?`,
    [profileUser.id]
  );

  const sellingCount = Number(itemCountRow?.count || 0);
  const itemWord = sellingCount === 1 ? 'item' : 'items';
  const bio = cleanBio(profileUser.bio || '');
  const title = `${profileUser.username}'s Trading Board`;
  const description = bio
    ? `${bio} • Selling ${sellingCount} ${itemWord} on Salts Trading Board.`
    : `Selling ${sellingCount} ${itemWord} on Salts Trading Board.`;
  const destination = profileUrl(profileUser.username);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  res.send(sharePageHtml({
    req,
    title,
    description,
    image,
    destination,
    shouldRedirect: !isCrawlerRequest(req)
  }));
});

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

    res.json({ token: createToken(publicUser(user)), user: publicUser(user) });
  } catch {
    res.status(400).json({ error: 'Username already exists' });
  }
});

app.post('/api/login', async (req, res) => {
  const cleanUsername = normalizeUsername(req.body.username);

  const user = await get(
    `SELECT id, username, password, is_admin, bio
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

  await createLoginTradeSummaryNotification(user.id);

  res.json({
    token: createToken(publicUser(user)),
    user: publicUser(user)
  });
});

app.get('/api/me', authMiddleware, async (req, res) => {
  const user = await get(
    `SELECT id, username, is_admin, bio
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

app.put('/api/me/profile', authMiddleware, async (req, res) => {
  const bio = cleanBio(req.body.bio);

  await run(
    'UPDATE users SET bio = ? WHERE id = ?',
    [bio, req.user.id]
  );

  const user = await get(
    `SELECT id, username, is_admin, bio
     FROM users
     WHERE id = ?`,
    [req.user.id]
  );

  res.json({
    ok: true,
    user: { ...publicUser(user), bio: user.bio || '' }
  });
});

app.get('/api/profile/:username', optionalAuth, async (req, res) => {
  const profileUser = await get(
    `SELECT id, username, is_admin, bio
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
      price
    }
  });
});

app.patch('/api/items/:id', authMiddleware, async (req, res) => {
  const item = await get('SELECT * FROM items WHERE id = ? AND userId = ?', [req.params.id, req.user.id]);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const price = cleanPrice(req.body.price);

  await run(
    'UPDATE items SET price = ? WHERE id = ? AND userId = ?',
    [price, req.params.id, req.user.id]
  );

  const updated = await get(
    'SELECT id, title, image, price, userId AS "userId" FROM items WHERE id = ?',
    [req.params.id]
  );

  res.json({ ok: true, item: updated });
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

  res.json({ user: { ...user, bio: user.bio || '', online: isUserOnline(user.id) }, items });
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
      to_user.username AS "toUsername"
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

app.get('/api/admin/users', authMiddleware, requireAdmin, async (req, res) => {
  const rows = await all(
    `SELECT id, username, is_admin, bio
     FROM users
     ORDER BY LOWER(username) ASC`
  );

  res.json({
    users: rows.map(user => ({ ...publicUser(user), bio: user.bio || '' }))
  });
});

app.post('/api/admin/set-admin', authMiddleware, requireAdmin, async (req, res) => {
  const { username, isAdmin } = req.body;
  const cleanUsername = normalizeUsername(username);

  if (!cleanUsername) return res.status(400).json({ error: 'Username required' });

  const target = await get(
    `SELECT id, username, is_admin
     FROM users
     WHERE LOWER(username) = LOWER(?)`,
    [cleanUsername]
  );

  if (!target) return res.status(404).json({ error: 'User not found' });

  if (isSaltUsername(target.username) && isAdmin === false) {
    return res.status(400).json({ error: 'Salt cannot lose admin access' });
  }

  await run('UPDATE users SET is_admin = ? WHERE id = ?', [Boolean(isAdmin), target.id]);

  const updated = await get(
    `SELECT id, username, is_admin
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
      to_user.username AS "toUsername"
    FROM trades t
    JOIN users AS from_user ON from_user.id = t.fromUser
    JOIN users AS to_user ON to_user.id = t.toUser
    ORDER BY t.createdAt DESC`
  );

  res.json({ trades: await enrichTradeRows(rows) });
});

app.post('/api/admin/reset-password', authMiddleware, requireAdmin, async (req, res) => {
  const { username, newPassword } = req.body;
  const cleanUsername = normalizeUsername(username);

  if (!cleanUsername || !newPassword) return res.status(400).json({ error: 'Username and new password required' });
  if (String(newPassword).length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

  const target = await get('SELECT id, username FROM users WHERE LOWER(username) = LOWER(?)', [cleanUsername]);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await run('UPDATE users SET password = ? WHERE id = ?', [passwordHash, target.id]);

  res.json({ ok: true, message: `Password reset for ${target.username}` });
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
      (user_id, offline_trades, counters, room_invites, invite_responses, sound_volume, flash_tab)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET
      offline_trades = EXCLUDED.offline_trades,
      counters = EXCLUDED.counters,
      room_invites = EXCLUDED.room_invites,
      invite_responses = EXCLUDED.invite_responses,
      sound_volume = EXCLUDED.sound_volume,
      flash_tab = EXCLUDED.flash_tab`,
    [
      req.user.id,
      Boolean(req.body.offlineTrades),
      Boolean(req.body.counters),
      Boolean(req.body.roomInvites),
      Boolean(req.body.inviteResponses),
      soundVolume,
      Boolean(req.body.flashTab)
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
  const existing = onlineUsers.get(userId) || {
    id: userId,
    username: socket.user.username,
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
