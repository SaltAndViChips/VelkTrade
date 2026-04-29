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
  createRoom,
  joinRoom,
  setOffer,
  acceptTrade,
  confirmTrade,
  addChatMessage,
  maybeSaveAcceptedSnapshot,
  finalizeTrade,
  leaveRoom,
  publicRoomState
} = require('./rooms');

const app = express();
const server = http.createServer(app);

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(cors({ origin: FRONTEND_ORIGIN }));

const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGIN,
    methods: ['GET', 'POST']
  }
});

function normalizeUsername(username) {
  return String(username || '').trim();
}

function isSaltAdmin(user) {
  return normalizeUsername(user?.username).toLowerCase() === 'salt';
}

function requireSaltAdmin(req, res, next) {
  if (!isSaltAdmin(req.user)) {
    return res.status(403).json({ error: 'Admin only' });
  }

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
    `SELECT id, title, image, userId AS "userId"
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

    if (!item) {
      throw new Error(`Invalid item ownership for item ${itemId}`);
    }
  }
}

async function createStoredTrade({ fromUser, toUser, fromItems, toItems, status = 'pending', message = '' }) {
  const cleanFromItems = Array.from(new Set((fromItems || []).map(Number))).filter(Boolean);
  const cleanToItems = Array.from(new Set((toItems || []).map(Number))).filter(Boolean);

  const chatHistory = message
    ? [{
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        userId: fromUser.id,
        username: fromUser.username,
        message: String(message).trim().slice(0, 500),
        createdAt: new Date().toISOString()
      }]
    : [];

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

  if (trade.status !== 'accepted') {
    throw new Error('Trade must be accepted before confirming');
  }

  if (![trade.fromUser, trade.toUser].includes(Number(userId))) {
    throw new Error('You are not part of this trade');
  }

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
    const result = await run('INSERT INTO users (username, password) VALUES (?, ?) RETURNING id', [cleanUsername, passwordHash]);
    const user = { id: result.lastID, username: cleanUsername };
    res.json({ token: createToken(user), user });
  } catch {
    res.status(400).json({ error: 'Username already exists' });
  }
});

app.post('/api/login', async (req, res) => {
  const cleanUsername = normalizeUsername(req.body.username);
  const user = await get('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [cleanUsername]);

  if (!user) return res.status(401).json({ error: 'Invalid login' });

  const valid = await bcrypt.compare(req.body.password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid login' });

  res.json({ token: createToken(user), user: { id: user.id, username: user.username } });
});

app.get('/api/me', authMiddleware, async (req, res) => {
  const user = await get('SELECT id, username FROM users WHERE id = ?', [req.user.id]);
  res.json({ user });
});

app.post('/api/items', authMiddleware, async (req, res) => {
  const { image } = req.body;

  if (!image || !isImgurUrl(image)) {
    return res.status(400).json({ error: 'Valid Imgur link required' });
  }

  const imgurItem = await fetchImgurItem(image);

  const result = await run(
    'INSERT INTO items (userId, title, image) VALUES (?, ?, ?) RETURNING id',
    [req.user.id, imgurItem.title, imgurItem.image]
  );

  res.json({
    item: {
      id: result.lastID,
      userId: req.user.id,
      title: imgurItem.title,
      image: imgurItem.image
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

  res.json({ ok: true });
});

app.get('/api/inventory/:username', async (req, res) => {
  const user = await get('SELECT id, username FROM users WHERE LOWER(username) = LOWER(?)', [normalizeUsername(req.params.username)]);

  if (!user) return res.json({ user: null, items: [] });

  const items = await all(
    'SELECT id, title, image FROM items WHERE userId = ? ORDER BY id DESC',
    [user.id]
  );

  res.json({ user, items });
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

  res.json({ trades: await enrichTradeRows(rows) });
});

app.post('/api/trades/offers', authMiddleware, async (req, res) => {
  const { toUsername, fromItems = [], toItems = [], message = '' } = req.body;
  const target = await get('SELECT id, username FROM users WHERE LOWER(username) = LOWER(?)', [normalizeUsername(toUsername)]);

  if (!target) return res.status(404).json({ error: 'Target user not found' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot trade with yourself' });

  try {
    const result = await createStoredTrade({
      fromUser: req.user,
      toUser: target,
      fromItems,
      toItems,
      status: 'pending',
      message
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

  res.json({ ok: true });
});

app.get('/api/admin/trades', authMiddleware, requireSaltAdmin, async (req, res) => {
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

app.post('/api/admin/reset-password', authMiddleware, requireSaltAdmin, async (req, res) => {
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

io.use((socket, next) => {
  try {
    socket.user = jwt.verify(socket.handshake.auth.token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', socket => {
  socket.on('room:create', () => {
    const room = createRoom(socket.user);
    socket.join(room.roomId);
    socket.emit('room:update', publicRoomState(room));
  });

  socket.on('room:join', ({ roomId }) => {
    try {
      const room = joinRoom(roomId, socket.user);
      socket.join(room.roomId);
      io.to(room.roomId).emit('room:update', publicRoomState(room));
    } catch (error) {
      socket.emit('room:error', error.message);
    }
  });

  socket.on('room:leave', async ({ roomId }) => {
    try {
      await leaveRoom(roomId, socket.user.id);
      io.to(roomId).emit('room:closed');
    } catch (error) {
      socket.emit('room:error', error.message);
    }
  });

  socket.on('trade:offer', ({ roomId, itemIds }) => {
    try {
      const room = setOffer(roomId, socket.user.id, itemIds);
      io.to(room.roomId).emit('room:update', publicRoomState(room));
    } catch (error) {
      socket.emit('room:error', error.message);
    }
  });

  socket.on('trade:accept', async ({ roomId }) => {
    try {
      const room = acceptTrade(roomId, socket.user.id);
      await maybeSaveAcceptedSnapshot(room);
      io.to(room.roomId).emit('room:update', publicRoomState(room));
    } catch (error) {
      socket.emit('room:error', error.message);
    }
  });

  socket.on('trade:confirm', async ({ roomId }) => {
    try {
      const room = confirmTrade(roomId, socket.user.id);
      await finalizeTrade(room);
      io.to(room.roomId).emit('room:update', publicRoomState(room));
      if (room.completed) io.to(room.roomId).emit('trade:completed');
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
