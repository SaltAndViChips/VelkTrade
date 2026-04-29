const { run, transaction } = require('./db');

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

  const alreadyInRoom = room.players.some(p => Number(p.id) === Number(player.id));

  if (room.players.length >= 2 && !alreadyInRoom) {
    throw new Error('Room is full');
  }

  if (alreadyInRoom) return room;

  room.players.push(player);
  room.offers[player.id] = [];
  room.accepted[player.id] = false;
  room.confirmed[player.id] = false;

  return room;
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

function cleanItemIds(itemIds) {
  return Array.from(new Set((itemIds || []).map(Number))).filter(Number.isFinite);
}

function setOffer(roomId, userId, itemIds) {
  const room = rooms.get(roomId);

  if (!room) throw new Error('Room not found');
  if (room.completed) throw new Error('Trade already completed');

  assertPlayerInRoom(room, userId);

  // Do not block live room updates with database ownership validation.
  // Ownership is still validated in finalizeTrade() before items transfer.
  // This keeps live offering responsive even when DB schemas differ between SQLite/Postgres patches.
  room.offers[userId] = cleanItemIds(itemIds);
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

async function getOwnedItem(tx, itemId, userId) {
  // Postgres folds userId to userid, but older/generated code may differ.
  // Try both query forms so final confirmation remains safe.
  let item = await tx.get('SELECT * FROM items WHERE id = ? AND userId = ?', [itemId, userId]);

  if (item) return item;

  try {
    item = await tx.get('SELECT * FROM items WHERE id = ? AND userid = ?', [itemId, userId]);
  } catch {
    // Ignore and let caller throw standard ownership error.
  }

  return item;
}

async function updateItemOwner(tx, itemId, userId) {
  try {
    await tx.run('UPDATE items SET userId = ? WHERE id = ?', [userId, itemId]);
  } catch {
    await tx.run('UPDATE items SET userid = ? WHERE id = ?', [userId, itemId]);
  }
}

async function finalizeTrade(room) {
  if (!isFullyConfirmed(room)) return room;

  const [playerA, playerB] = room.players;
  const playerAItems = room.offers[playerA.id] || [];
  const playerBItems = room.offers[playerB.id] || [];

  await transaction(async tx => {
    for (const itemId of playerAItems) {
      const item = await getOwnedItem(tx, itemId, playerA.id);
      if (!item) throw new Error(`Item ${itemId} is no longer owned by ${playerA.username}`);
    }

    for (const itemId of playerBItems) {
      const item = await getOwnedItem(tx, itemId, playerB.id);
      if (!item) throw new Error(`Item ${itemId} is no longer owned by ${playerB.username}`);
    }

    for (const itemId of playerAItems) {
      await updateItemOwner(tx, itemId, playerB.id);
    }

    for (const itemId of playerBItems) {
      await updateItemOwner(tx, itemId, playerA.id);
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
  setOffer,
  acceptTrade,
  confirmTrade,
  addChatMessage,
  maybeSaveAcceptedSnapshot,
  finalizeTrade,
  leaveRoom,
  publicRoomState
};
