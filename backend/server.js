require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const { get, all, run } = require('./db');
const { createToken, authMiddleware } = require('./auth');
const { fetchImgurTitle } = require('./imgur');
const {
  createRoom,
  joinRoom,
  setOffer,
  acceptTrade,
  confirmTrade,
  finalizeTrade,
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

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const result = await run(
      'INSERT INTO users (username, password) VALUES (?, ?)',
      [username, passwordHash]
    );

    const user = { id: result.lastID, username };
    res.json({ token: createToken(user), user });
  } catch {
    res.status(400).json({ error: 'Username already exists' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await get('SELECT * FROM users WHERE username = ?', [username]);

  if (!user) {
    return res.status(401).json({ error: 'Invalid login' });
  }

  const valid = await bcrypt.compare(password, user.password);

  if (!valid) {
    return res.status(401).json({ error: 'Invalid login' });
  }

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

  if (!image || !image.startsWith('https://i.imgur.com/')) {
    return res.status(400).json({ error: 'Valid direct Imgur image link required' });
  }

  const title = await fetchImgurTitle(image);

  const result = await run(
    'INSERT INTO items (userId, title, image) VALUES (?, ?, ?)',
    [req.user.id, title, image]
  );

  res.json({
    item: {
      id: result.lastID,
      userId: req.user.id,
      title,
      image
    }
  });
});

app.get('/api/inventory/:username', async (req, res) => {
  const user = await get('SELECT id, username FROM users WHERE username = ?', [req.params.username]);

  if (!user) {
    return res.json({ user: null, items: [] });
  }

  const items = await all('SELECT id, title, image FROM items WHERE userId = ?', [user.id]);
  res.json({ user, items });
});

app.get('/api/trades', authMiddleware, async (req, res) => {
  const trades = await all(
    'SELECT * FROM trades WHERE fromUser = ? OR toUser = ? ORDER BY createdAt DESC',
    [req.user.id, req.user.id]
  );

  res.json({ trades });
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
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

  socket.on('trade:offer', ({ roomId, itemIds }) => {
    try {
      const room = setOffer(roomId, socket.user.id, itemIds);
      io.to(room.roomId).emit('room:update', publicRoomState(room));
    } catch (error) {
      socket.emit('room:error', error.message);
    }
  });

  socket.on('trade:accept', ({ roomId }) => {
    try {
      const room = acceptTrade(roomId, socket.user.id);
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
});

server.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
