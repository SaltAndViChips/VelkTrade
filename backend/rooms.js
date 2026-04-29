const { get, run, transaction } = require('./db');

const rooms = new Map();

function createRoom(owner) {
  const roomId = Math.random().toString(36).slice(2, 9);

  rooms.set(roomId, {
    roomId,
    players: [owner],
    offers: { [owner.id]: [] },
    accepted: { [owner.id]: false },
    confirmed: { [owner.id]: false },
    messages: [],
    acceptedSnapshotSaved: false,
    acceptedTradeId: null,
    completed: false
  });

  return rooms.get(roomId);
}

function joinRoom(roomId, player) {
  const room = rooms.get(roomId);

  if (!room) throw new Error('Room not found');
  if (room.completed) throw new Error('Trade already completed');
  if (room.players.length >= 2 && !room.players.some(p => Number(p.id) === Number(player.id))) {
    throw new Error('Room is full');
  }

  if (room.players.some(p => Number(p.id) === Number(player.id))) return room;

  room.players.push(player);
  room.offers[player.id] = [];
  room.accepted[player.id] = false;
  room.confirmed[player.id] = false;

  return room;
}

function getRoom(roomId) {
  return rooms.get(roomId);
}

function assertPlayerInRoom(room, userId) {
  if (!room.players.some(player => Number(player.id) === Number(userId))) {
    throw new Error('You are not in this room');
  }
}

function resetApprovals(room) {
  for (const player of room.players) {
    room.accepted[player.id] = false;
    room.confirmed[player.id] = false;
  }

  room.acceptedSnapshotSaved = false;
  room.acceptedTradeId = null;
}

async function validateItemOwnership(userId, itemIds) {
  for (const itemId of itemIds) {
    const item = await get('SELECT id FROM items WHERE id = ? AND userId = ?', [itemId, userId]);

    if (!item) {
      throw new Error(`Item ${itemId} does not belong to you`);
    }
  }
}

async function setOffer(roomId, userId, itemIds) {
  const room = rooms.get(roomId);
  if (!room) throw new Error('Room not found');
  if (room.completed) throw new Error('Trade already completed');

  assertPlayerInRoom(room, userId);

  const cleanItemIds = Array.from(new Set((itemIds || []).map(Number))).filter(Number.isFinite);

  await validateItemOwnership(userId, cleanItemIds);

  room.offers[userId] = cleanItemIds;
  resetApprovals(room);

  return room;
}

function acceptTrade(roomId, userId) {
  const room = rooms.get(roomId);
  if (!room) throw new Error('Room not found');
  if (room.completed) throw new Error('Trade already completed');

  assertPlayerInRoom(room, userId);

  room.accepted[userId] = true;
  return room;
}

function confirmTrade(roomId, userId) {
  const room = rooms.get(roomId);
  if (!room) throw new Error('Room not found');
  if (room.completed) throw new Error('Trade already completed');

  assertPlayerInRoom(room, userId);

  const everyoneAccepted = room.players.length === 2 && room.players.every(player => room.accepted[player.id]);
  if (!everyoneAccepted) throw new Error('Both players must accept before confirming');

  room.confirmed[userId] = true;
  return room;
}

function addChatMessage(roomId, user, message) {
  const room = rooms.get(roomId);

  if (!room) throw new Error('Room not found');
  if (room.completed) throw new Error('Trade already completed');

  assertPlayerInRoom(room, user.id);

  const cleanMessage = String(message || '').trim().slice(0, 500);
  if (!cleanMessage) throw new Error('Message cannot be empty');

  const chatMessage = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    userId: user.id,
    username: user.username,
    message: cleanMessage,
    createdAt: new Date().toISOString()
  };

  room.messages.push(chatMessage);
  room.messages = room.messages.slice(-100);

  return { room, chatMessage };
}

function everyoneAccepted(room) {
  return room.players.length === 2 && room.players.every(player => room.accepted[player.id]);
}

function isFullyConfirmed(room) {
  return room.players.length === 2 && room.players.every(player => room.confirmed[player.id]);
}

async function saveTradeSnapshot(room, status) {
  if (!room || room.players.length < 2) return null;

  const [playerA, playerB] = room.players;

  return run(
    `INSERT INTO trades (roomId, fromUser, toUser, fromItems, toItems, chatHistory, status)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      room.roomId,
      playerA.id,
      playerB.id,
      JSON.stringify(room.offers[playerA.id] || []),
      JSON.stringify(room.offers[playerB.id] || []),
      JSON.stringify(room.messages || []),
      status
    ]
  );
}

async function maybeSaveAcceptedSnapshot(room) {
  if (!everyoneAccepted(room) || room.acceptedSnapshotSaved) return null;

  const result = await saveTradeSnapshot(room, 'accepted');
  room.acceptedSnapshotSaved = true;
  room.acceptedTradeId = result?.lastID || null;

  return result;
}

async function finalizeTrade(room) {
  if (!isFullyConfirmed(room)) return room;

  const [playerA, playerB] = room.players;
  const playerAItems = room.offers[playerA.id] || [];
  const playerBItems = room.offers[playerB.id] || [];

  await transaction(async tx => {
    for (const itemId of playerAItems) {
      const item = await tx.get(
        'SELECT * FROM items WHERE id = ? AND userId = ?',
        [itemId, playerA.id]
      );

      if (!item) throw new Error('Invalid item ownership detected');
    }

    for (const itemId of playerBItems) {
      const item = await tx.get(
        'SELECT * FROM items WHERE id = ? AND userId = ?',
        [itemId, playerB.id]
      );

      if (!item) throw new Error('Invalid item ownership detected');
    }

    for (const itemId of playerAItems) {
      await tx.run('UPDATE items SET userId = ? WHERE id = ?', [playerB.id, itemId]);
    }

    for (const itemId of playerBItems) {
      await tx.run('UPDATE items SET userId = ? WHERE id = ?', [playerA.id, itemId]);
    }

    await tx.run(
      `INSERT INTO trades (roomId, fromUser, toUser, fromItems, toItems, chatHistory, status)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        room.roomId,
        playerA.id,
        playerB.id,
        JSON.stringify(playerAItems),
        JSON.stringify(playerBItems),
        JSON.stringify(room.messages || []),
        'completed'
      ]
    );
  });

  room.completed = true;
  rooms.delete(room.roomId);

  return room;
}

async function leaveRoom(roomId, userId) {
  const room = rooms.get(roomId);

  if (!room) throw new Error('Room not found');

  assertPlayerInRoom(room, userId);

  if (!room.completed && room.players.length === 2) {
    await saveTradeSnapshot(room, 'declined');
  }

  rooms.delete(roomId);

  return room;
}

function publicRoomState(room) {
  return {
    roomId: room.roomId,
    players: room.players.map(player => ({ id: player.id, username: player.username })),
    offers: room.offers,
    accepted: room.accepted,
    confirmed: room.confirmed,
    messages: room.messages || [],
    acceptedTradeId: room.acceptedTradeId || null,
    completed: Boolean(room.completed)
  };
}

module.exports = {
  createRoom,
  joinRoom,
  getRoom,
  setOffer,
  acceptTrade,
  confirmTrade,
  addChatMessage,
  maybeSaveAcceptedSnapshot,
  finalizeTrade,
  leaveRoom,
  publicRoomState
};
