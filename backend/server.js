require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const { get, all, run, getDatabaseDiagnostics } = require('./db');
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
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}

function normalizeTradeRows(rows) {
  return rows.map(row => ({
    id: row.id,
    roomId: row.roomId,
    fromUser: row.fromUser,
    toUser: row.toUser,
    fromUsername: row.fromUsername,
    toUsername: row.toUsername,
    fromItems: safeParse(row.fromItems, []),
    toItems: safeParse(row.toItems, []),
    chatHistory: safeParse(row.chatHistory, []),
    status: row.status,
    createdAt: row.createdAt
  }));
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

  if (!cleanUsername || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  if (cleanUsername.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  }

  if (String(password).length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  const existingUser = await get(
    'SELECT id, username FROM users WHERE LOWER(username) = LOWER(?)',
    [cleanUsername]
  );

  if (existingUser) {
    return res.status(400).json({
      error: `Username already exists as ${existingUser.username}`
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const result = await run(
      'INSERT INTO users (username, password) VALUES (?, ?) RETURNING id',
      [cleanUsername, passwordHash]
    );

    const user = { id: result.lastID, username: cleanUsername };

    res.json({ token: createToken(user), user });
  } catch (error) {
    res.status(400).json({ error: 'Username already exists' });
  }
});

app.post('/api/login', async (req, res) => {
  const cleanUsername = normalizeUsername(req.body.username);

  const user = await get(
    'SELECT * FROM users WHERE LOWER(username) = LOWER(?)',
    [cleanUsername]
  );

  if (!user) return res.status(401).json({ error: 'Invalid login' });

  const valid = await bcrypt.compare(req.body.password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid login' });

  res.json({
    token: createToken(user),
    user: { id: user.id, username: user.username }
  });
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

app.delete('/api/items/:id', authMiddleware, async (req, res) => {
  const item = await get(
    'SELECT * FROM items WHERE id = ? AND userId = ?',
    [req.params.id, req.user.id]
  );

  if (!item) return res.status(404).json({ error: 'Item not found' });

  await run('DELETE FROM items WHERE id = ? AND userId = ?', [req.params.id, req.user.id]);

  res.json({ ok: true });
});

app.get('/api/inventory/:username', async (req, res) => {
  const user = await get(
    'SELECT id, username FROM users WHERE LOWER(username) = LOWER(?)',
    [normalizeUsername(req.params.username)]
  );

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

  res.json({ trades: normalizeTradeRows(rows) });
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

  res.json({ trades: normalizeTradeRows(rows) });
});

app.post('/api/admin/reset-password', authMiddleware, requireSaltAdmin, async (req, res) => {
  const { username, newPassword } = req.body;
  const cleanUsername = normalizeUsername(username);

  if (!cleanUsername || !newPassword) {
    return res.status(400).json({ error: 'Username and new password required' });
  }

  if (String(newPassword).length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  const target = await get(
    'SELECT id, username FROM users WHERE LOWER(username) = LOWER(?)',
    [cleanUsername]
  );

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

      if (room.completed) {
        io.to(room.roomId).emit('trade:completed');
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
