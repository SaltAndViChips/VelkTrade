const { get, run } = require('./db');

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
    completed: false
  });

  return rooms.get(roomId);
}

function joinRoom(roomId, player) {
  const room = rooms.get(roomId);

  if (!room) throw new Error('Room not found');
  if (room.completed) throw new Error('Trade already completed');
  if (room.players.length >= 2 && !room.players.some(p => p.id === player.id)) {
    throw new Error('Room is full');
  }

  if (room.players.some(p => p.id === player.id)) return room;

  room.players.push(player);
  room.offers[player.id] = [];
  room.accepted[player.id] = false;
  room.confirmed[player.id] = false;

  return room;
}

function assertPlayerInRoom(room, userId) {
  if (!room.players.some(player => player.id === userId)) {
    throw new Error('You are not in this room');
  }
}

function resetApprovals(room) {
  for (const player of room.players) {
    room.accepted[player.id] = false;
    room.confirmed[player.id] = false;
  }
}

function setOffer(roomId, userId, itemIds) {
  const room = rooms.get(roomId);
  if (!room) throw new Error('Room not found');
  if (room.completed) throw new Error('Trade already completed');

  assertPlayerInRoom(room, userId);

  room.offers[userId] = Array.from(new Set(itemIds.map(Number)));
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

  const everyoneAccepted = room.players.length === 2 && room.players.every(p => room.accepted[p.id]);
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

function isFullyConfirmed(room) {
  return room.players.length === 2 && room.players.every(p => room.confirmed[p.id]);
}

async function finalizeTrade(room) {
  if (!isFullyConfirmed(room)) return room;

  const [playerA, playerB] = room.players;
  const playerAItems = room.offers[playerA.id] || [];
  const playerBItems = room.offers[playerB.id] || [];

  await run('BEGIN TRANSACTION');

  try {
    for (const itemId of playerAItems) {
      const item = await get('SELECT * FROM items WHERE id = ? AND userId = ?', [itemId, playerA.id]);
      if (!item) throw new Error('Invalid item ownership detected');
    }

    for (const itemId of playerBItems) {
      const item = await get('SELECT * FROM items WHERE id = ? AND userId = ?', [itemId, playerB.id]);
      if (!item) throw new Error('Invalid item ownership detected');
    }

    for (const itemId of playerAItems) {
      await run('UPDATE items SET userId = ? WHERE id = ?', [playerB.id, itemId]);
    }

    for (const itemId of playerBItems) {
      await run('UPDATE items SET userId = ? WHERE id = ?', [playerA.id, itemId]);
    }

    await run(
      `INSERT INTO trades (roomId, fromUser, toUser, fromItems, toItems, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [room.roomId, playerA.id, playerB.id, JSON.stringify(playerAItems), JSON.stringify(playerBItems), 'completed']
    );

    await run('COMMIT');

    room.completed = true;
    return room;
  } catch (error) {
    await run('ROLLBACK');
    throw error;
  }
}

function publicRoomState(room) {
  return {
    roomId: room.roomId,
    players: room.players.map(p => ({ id: p.id, username: p.username })),
    offers: room.offers,
    accepted: room.accepted,
    confirmed: room.confirmed,
    messages: room.messages || [],
    completed: Boolean(room.completed)
  };
}

module.exports = {
  createRoom,
  joinRoom,
  setOffer,
  acceptTrade,
  confirmTrade,
  addChatMessage,
  finalizeTrade,
  publicRoomState
};
