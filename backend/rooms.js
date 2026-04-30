const { run, transaction } = require('./db');

const rooms = new Map();

function createRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function normalizeIds(ids) {
  return Array.from(new Set((ids || []).map(Number))).filter(Number.isFinite);
}

function normalizeIcAmount(value) {
  const raw = String(value || '').trim().replace(/^\$\s*/, '');
  if (!raw) return '';

  const withoutIc = raw.replace(/\bic\b/ig, '').trim();

  if (/^\d+(\.\d+)?$/.test(withoutIc.replace(/,/g, ''))) {
    const [whole, decimal] = withoutIc.replace(/,/g, '').split('.');
    const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${decimal !== undefined ? `${withCommas}.${decimal}` : withCommas} IC`;
  }

  if (/^\d+(\.\d+)?\s*[kmb]$/i.test(withoutIc)) {
    return `${withoutIc} IC`;
  }

  if (/\bic\b/i.test(raw)) {
    return raw.replace(/\bic\b/i, 'IC');
  }

  return `${raw} IC`;
}

function createRoom(user) {
  const roomId = createRoomId();

  const room = {
    roomId,
    players: [{ id: user.id, username: user.username }],
    offers: {},
    icOffers: {},
    accepted: {},
    confirmed: {},
    messages: [],
    acceptedTradeId: null,
    completed: false
  };

  room.offers[user.id] = [];
  room.icOffers[user.id] = '';

  rooms.set(roomId, room);
  return room;
}

function joinRoom(roomId, user) {
  const room = rooms.get(String(roomId || '').trim().toUpperCase());

  if (!room) {
    throw new Error('Room not found');
  }

  if (!room.players.some(player => Number(player.id) === Number(user.id))) {
    if (room.players.length >= 2) {
      throw new Error('Room is full');
    }

    room.players.push({ id: user.id, username: user.username });
  }

  room.offers[user.id] = room.offers[user.id] || [];
  room.icOffers[user.id] = room.icOffers[user.id] || '';
  room.accepted[user.id] = false;
  room.confirmed[user.id] = false;

  return room;
}

function leaveRoom(roomId, userId) {
  const room = rooms.get(String(roomId || '').trim().toUpperCase());

  if (!room) return;

  room.players = room.players.filter(player => Number(player.id) !== Number(userId));

  if (room.players.length === 0) {
    rooms.delete(room.roomId);
  }

  return room;
}

function assertPlayer(room, userId) {
  if (!room || !room.players.some(player => Number(player.id) === Number(userId))) {
    throw new Error('You are not in this room');
  }
}

function resetApprovals(room) {
  for (const player of room.players) {
    room.accepted[player.id] = false;
    room.confirmed[player.id] = false;
  }

  room.acceptedTradeId = null;
  room.completed = false;
}

function setOffer(roomId, userId, itemIds) {
  const room = rooms.get(String(roomId || '').trim().toUpperCase());
  assertPlayer(room, userId);

  room.offers[userId] = normalizeIds(itemIds);
  resetApprovals(room);

  return room;
}

function setIcOffer(roomId, userId, amount) {
  const room = rooms.get(String(roomId || '').trim().toUpperCase());
  assertPlayer(room, userId);

  room.icOffers[userId] = normalizeIcAmount(amount);
  resetApprovals(room);

  return room;
}

function removeIcOffer(roomId, userId) {
  const room = rooms.get(String(roomId || '').trim().toUpperCase());
  assertPlayer(room, userId);

  room.icOffers[userId] = '';
  resetApprovals(room);

  return room;
}

function acceptTrade(roomId, userId) {
  const room = rooms.get(String(roomId || '').trim().toUpperCase());
  assertPlayer(room, userId);

  room.accepted[userId] = true;

  return room;
}

function confirmTrade(roomId, userId) {
  const room = rooms.get(String(roomId || '').trim().toUpperCase());
  assertPlayer(room, userId);

  const everyoneAccepted = room.players.length === 2 && room.players.every(player => room.accepted[player.id]);

  if (!everyoneAccepted) {
    throw new Error('Both players must accept before confirming');
  }

  room.confirmed[userId] = true;

  return room;
}

function addChatMessage(roomId, user, message) {
  const room = rooms.get(String(roomId || '').trim().toUpperCase());
  assertPlayer(room, user.id);

  const cleanMessage = String(message || '').trim().slice(0, 500);

  if (!cleanMessage) {
    throw new Error('Message required');
  }

  const chatMessage = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    userId: user.id,
    username: user.username,
    message: cleanMessage,
    createdAt: new Date().toISOString()
  };

  room.messages.push(chatMessage);

  return { room, chatMessage };
}

function buildTradeMeta(room) {
  return {
    icOffers: room.icOffers || {}
  };
}

function addMetaMessage(room) {
  const meta = buildTradeMeta(room);

  if (!Object.values(meta.icOffers).some(Boolean)) {
    return room.messages || [];
  }

  return [
    ...(room.messages || []),
    {
      id: `meta-${Date.now()}`,
      type: 'trade-meta',
      message: JSON.stringify(meta),
      createdAt: new Date().toISOString()
    }
  ];
}

async function maybeSaveAcceptedSnapshot(room) {
  if (!room || room.acceptedTradeId || room.players.length !== 2) {
    return null;
  }

  const everyoneAccepted = room.players.every(player => room.accepted[player.id]);

  if (!everyoneAccepted) {
    return null;
  }

  const [fromPlayer, toPlayer] = room.players;
  const result = await run(
    `INSERT INTO trades (roomId, fromUser, toUser, fromItems, toItems, chatHistory, status)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      room.roomId,
      fromPlayer.id,
      toPlayer.id,
      JSON.stringify(room.offers[fromPlayer.id] || []),
      JSON.stringify(room.offers[toPlayer.id] || []),
      JSON.stringify(addMetaMessage(room)),
      'accepted'
    ]
  );

  room.acceptedTradeId = result.lastID;
  return result;
}

async function finalizeTrade(room) {
  if (!room || room.players.length !== 2) {
    throw new Error('Room must have two players');
  }

  const everyoneAccepted = room.players.every(player => room.accepted[player.id]);
  const everyoneConfirmed = room.players.every(player => room.confirmed[player.id]);

  if (!everyoneAccepted || !everyoneConfirmed) {
    return false;
  }

  const [fromPlayer, toPlayer] = room.players;
  const fromItems = normalizeIds(room.offers[fromPlayer.id] || []);
  const toItems = normalizeIds(room.offers[toPlayer.id] || []);

  await transaction(async tx => {
    for (const itemId of fromItems) {
      const item = await tx.get('SELECT id FROM items WHERE id = ? AND userId = ?', [itemId, fromPlayer.id]);
      if (!item) throw new Error(`Invalid item ownership for item ${itemId}`);
    }

    for (const itemId of toItems) {
      const item = await tx.get('SELECT id FROM items WHERE id = ? AND userId = ?', [itemId, toPlayer.id]);
      if (!item) throw new Error(`Invalid item ownership for item ${itemId}`);
    }

    for (const itemId of fromItems) {
      await tx.run('UPDATE items SET userId = ? WHERE id = ?', [toPlayer.id, itemId]);
    }

    for (const itemId of toItems) {
      await tx.run('UPDATE items SET userId = ? WHERE id = ?', [fromPlayer.id, itemId]);
    }

    if (room.acceptedTradeId) {
      await tx.run(
        'UPDATE trades SET status = ?, chatHistory = ? WHERE id = ?',
        ['completed', JSON.stringify(addMetaMessage(room)), room.acceptedTradeId]
      );
    } else {
      await tx.run(
        `INSERT INTO trades (roomId, fromUser, toUser, fromItems, toItems, chatHistory, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          room.roomId,
          fromPlayer.id,
          toPlayer.id,
          JSON.stringify(fromItems),
          JSON.stringify(toItems),
          JSON.stringify(addMetaMessage(room)),
          'completed'
        ]
      );
    }
  });

  room.completed = true;
  return true;
}

function publicRoomState(room) {
  if (!room) return null;

  return {
    roomId: room.roomId,
    players: room.players,
    offers: room.offers,
    icOffers: room.icOffers || {},
    accepted: room.accepted,
    confirmed: room.confirmed,
    messages: room.messages,
    acceptedTradeId: room.acceptedTradeId,
    completed: room.completed
  };
}

module.exports = {
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
};
