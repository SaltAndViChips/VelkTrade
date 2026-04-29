import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors
} from '@dnd-kit/core';

import { api, clearToken, getToken } from './api';
import { createSocket } from './socket';
import AuthForm from './components/AuthForm';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import TradeBoard from './components/TradeBoard';
import TradeChat from './components/TradeChat';
import AdminPanel from './components/AdminPanel';
import Trades from './components/Trades';
import TradeOfferPanel from './components/TradeOfferPanel';

function parseDraggedItemId(active) {
  const dataItemId = active?.data?.current?.itemId;

  if (dataItemId !== undefined && dataItemId !== null) {
    const itemId = Number(dataItemId);
    return Number.isFinite(itemId) ? itemId : null;
  }

  const raw = String(active?.id || '');
  const cleaned = raw.replace(/^(inventory-item|offer-item|inv|offer|own|their|selected)-/, '');
  const itemId = Number(cleaned);

  return Number.isFinite(itemId) ? itemId : null;
}

function normalizeIds(ids) {
  return Array.from(new Set((ids || []).map(Number))).filter(Number.isFinite);
}

function tradeCollisionDetection(args) {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return rectIntersection(args);
}

function getInitialRoomIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const queryRoom = params.get('room');

  if (queryRoom) return queryRoom.trim();

  const pathMatch = window.location.pathname.match(/(?:\/VelkTrade)?\/room\/([a-zA-Z0-9_-]+)/i);
  if (pathMatch?.[1]) return pathMatch[1];

  return '';
}

function makeRoomPath(roomId) {
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;

  return `${window.location.origin}${cleanBase}/room/${roomId}`;
}

export default function App() {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 2 }
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 90, tolerance: 8 }
    })
  );

  const [view, setView] = useState('dashboard');
  const [user, setUser] = useState(null);
  const [socket, setSocket] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [viewUsername, setViewUsername] = useState('');
  const [viewedInventory, setViewedInventory] = useState([]);
  const [trades, setTrades] = useState([]);
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [activeDragItem, setActiveDragItem] = useState(null);
  const [counterTrade, setCounterTrade] = useState(null);
  const [pendingRoomId, setPendingRoomId] = useState(getInitialRoomIdFromUrl());

  const userRef = useRef(null);
  const roomRef = useRef(null);
  const socketRef = useRef(null);
  const joinedInitialRoomRef = useRef(false);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  const isAdmin = Boolean(user?.isAdmin);

  const myOfferIds = useMemo(
    () => normalizeIds(room && user ? room.offers?.[user.id] || [] : []),
    [room, user]
  );

  const theirPlayer = useMemo(
    () => room && user ? room.players.find(player => Number(player.id) !== Number(user.id)) || null : null,
    [room, user]
  );

  const theirOfferIds = useMemo(
    () => normalizeIds(room && theirPlayer ? room.offers?.[theirPlayer.id] || [] : []),
    [room, theirPlayer]
  );

  const visibleInventory = useMemo(
    () => inventory.filter(item => !myOfferIds.includes(Number(item.id))),
    [inventory, myOfferIds]
  );

  const myOfferItems = useMemo(
    () => inventory.filter(item => myOfferIds.includes(Number(item.id))),
    [inventory, myOfferIds]
  );

  const theirOfferItems = useMemo(
    () => viewedInventory.filter(item => theirOfferIds.includes(Number(item.id))),
    [viewedInventory, theirOfferIds]
  );

  const myAccepted = Boolean(room && user && room.accepted?.[user.id]);
  const theirAccepted = Boolean(room && theirPlayer && room.accepted?.[theirPlayer.id]);
  const myConfirmed = Boolean(room && user && room.confirmed?.[user.id]);
  const theirConfirmed = Boolean(room && theirPlayer && room.confirmed?.[theirPlayer.id]);

  useEffect(() => {
    if (!getToken()) return;

    api('/api/me')
      .then(data => setUser(data.user))
      .catch(() => clearToken());
  }, []);

  useEffect(() => {
    if (!user) return;

    refreshAllForUser(user);

    const nextSocket = createSocket();
    socketRef.current = nextSocket;
    setSocket(nextSocket);

    nextSocket.on('connect', () => {
      if (pendingRoomId && !joinedInitialRoomRef.current) {
        joinedInitialRoomRef.current = true;
        nextSocket.emit('room:join', { roomId: pendingRoomId });
      }
    });

    nextSocket.on('room:update', nextRoom => {
      setRoom(nextRoom);
      roomRef.current = nextRoom;
      setError('');
      setView('trade');
      refreshRoomInventories(nextRoom, userRef.current);
      loadTrades();
    });

    nextSocket.on('trade:offer-updated', ({ room: nextRoom }) => {
      if (nextRoom) {
        setRoom(nextRoom);
        roomRef.current = nextRoom;
        setView('trade');
      }

      refreshRoomInventories(nextRoom || roomRef.current, userRef.current);
      loadTrades();
    });

    nextSocket.on('inventory:refresh', () => {
      refreshRoomInventories(roomRef.current, userRef.current);
      loadTrades();
    });

    nextSocket.on('inventory:updated', ({ username }) => {
      const currentUser = userRef.current;
      const activeRoom = roomRef.current;

      if (!username || !currentUser) return;

      if (username === currentUser.username) {
        refreshInventory(username);
      }

      const otherPlayer = activeRoom?.players?.find(player => Number(player.id) !== Number(currentUser.id));

      if (otherPlayer?.username && username === otherPlayer.username) {
        loadViewedInventory(otherPlayer.username);
      }
    });

    nextSocket.on('room:error', message => {
      setError(message || 'Room error');
    });

    nextSocket.on('room:closed', () => {
      setRoom(null);
      roomRef.current = null;
      setView('dashboard');
      refreshAllForUser(userRef.current);
    });

    nextSocket.on('trade:accepted-saved', () => {
      loadTrades();
    });

    nextSocket.on('trade:completed', () => {
      setRoom(null);
      roomRef.current = null;
      setView('dashboard');
      refreshAllForUser(userRef.current);
      alert('Trade completed. Inventories updated.');
    });

    nextSocket.on('chat:message', message => {
      setRoom(current => {
        if (!current) return current;
        const existing = current.messages || [];
        if (existing.some(item => item.id === message.id)) return current;
        const nextRoomState = { ...current, messages: [...existing, message] };
        roomRef.current = nextRoomState;
        return nextRoomState;
      });
    });

    return () => {
      nextSocket.disconnect();
      socketRef.current = null;
    };
  }, [user?.id]);

  useEffect(() => {
    if (theirPlayer?.username) {
      loadViewedInventory(theirPlayer.username);
    }
  }, [theirPlayer?.username]);

  async function refreshAllForUser(targetUser = user) {
    if (!targetUser) return;

    const data = await api('/api/me');
    if (data.user) {
      setUser(data.user);
    }

    await Promise.all([
      refreshInventory(targetUser.username),
      loadTrades()
    ]);
  }

  async function refreshRoomInventories(activeRoom = roomRef.current, activeUser = userRef.current) {
    if (!activeUser) return;

    const otherPlayer = activeRoom?.players?.find(player => Number(player.id) !== Number(activeUser.id));

    await refreshInventory(activeUser.username);

    if (otherPlayer?.username) {
      await loadViewedInventory(otherPlayer.username);
    }
  }

  async function refreshInventory(username) {
    const data = await api(`/api/inventory/${username}`);
    setInventory(data.items || []);
  }

  async function loadViewedInventory(username = viewUsername) {
    if (!username) return;
    const data = await api(`/api/inventory/${username}`);
    setViewedInventory(data.items || []);
  }

  async function loadTrades() {
    const data = await api('/api/trades');
    setTrades(data.trades || []);
  }

  function notifyRoomInventoryUpdated() {
    const activeRoom = roomRef.current;

    if (activeRoom?.roomId) {
      socketRef.current?.emit('inventory:updated', { roomId: activeRoom.roomId });
    }
  }

  async function addImgurItem(image) {
    await api('/api/items', {
      method: 'POST',
      body: JSON.stringify({ image })
    });

    await refreshInventory(user.username);
    notifyRoomInventoryUpdated();
  }

  async function deleteItem(itemId) {
    await api(`/api/items/${itemId}`, {
      method: 'DELETE'
    });

    await refreshInventory(user.username);
    notifyRoomInventoryUpdated();
  }

  function createRoom() {
    socketRef.current?.emit('room:create');
  }

  function joinRoom(roomId) {
    const cleanRoomId = String(roomId || '').trim();
    if (!cleanRoomId) return;

    setPendingRoomId(cleanRoomId);
    joinedInitialRoomRef.current = true;
    socketRef.current?.emit('room:join', { roomId: cleanRoomId });
  }

  function leaveRoom() {
    if (roomRef.current) {
      socketRef.current?.emit('room:leave', { roomId: roomRef.current.roomId });
    }

    setRoom(null);
    roomRef.current = null;
    setView('dashboard');
  }

  function returnToDashboard() {
    setView('dashboard');
  }

  function updateOffer(nextOfferIds) {
    const activeRoom = roomRef.current;

    if (!activeRoom) {
      setError('You are not in a room.');
      return;
    }

    const cleanOfferIds = normalizeIds(nextOfferIds);

    socketRef.current?.emit('trade:offer', {
      roomId: activeRoom.roomId,
      itemIds: cleanOfferIds
    });
  }

  function moveToOffer(itemId) {
    const id = Number(itemId);
    if (!roomRef.current || !Number.isFinite(id)) return;
    if (myOfferIds.includes(id)) return;

    updateOffer([...myOfferIds, id]);
  }

  function moveToInventory(itemId) {
    const id = Number(itemId);
    if (!roomRef.current || !Number.isFinite(id)) return;

    updateOffer(myOfferIds.filter(existingId => Number(existingId) !== id));
  }

  function handleDragStart(event) {
    const itemId = parseDraggedItemId(event.active);

    if (!itemId) {
      setActiveDragItem(null);
      return;
    }

    setActiveDragItem(
      inventory.find(item => Number(item.id) === itemId) ||
      viewedInventory.find(item => Number(item.id) === itemId) ||
      trades.flatMap(trade => [
        ...(trade.fromItemDetails || []),
        ...(trade.toItemDetails || [])
      ]).find(item => Number(item.id) === itemId) ||
      null
    );
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    setActiveDragItem(null);

    if (!over) return;

    const itemId = parseDraggedItemId(active);
    if (!itemId) return;

    if (over.id === 'my-offer-drop') {
      moveToOffer(itemId);
      return;
    }

    if (over.id === 'inventory-drop') {
      moveToInventory(itemId);
    }
  }

  function acceptTrade() {
    socketRef.current?.emit('trade:accept', { roomId: roomRef.current?.roomId });
  }

  function confirmTrade() {
    socketRef.current?.emit('trade:confirm', { roomId: roomRef.current?.roomId });
  }

  function sendChatMessage(message) {
    if (!roomRef.current) return;

    socketRef.current?.emit('chat:send', {
      roomId: roomRef.current.roomId,
      message
    });
  }

  function logout() {
    clearToken();
    window.location.reload();
  }

  function openCounter(trade) {
    setCounterTrade(trade);
    setView('offer');
  }

  const roomUrl = room?.roomId ? makeRoomPath(room.roomId) : '';

  if (!user) {
    return <AuthForm onLogin={setUser} />;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={tradeCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragItem(null)}
    >
      <main className="app-shell">
        <header className="topbar">
          <div>
            <h1>VelkTrade</h1>
            <p>Logged in as {user.username}{user.isAdmin ? ' · Admin' : ''}</p>
          </div>

          <div className="inline-controls">
            {view !== 'dashboard' && (
              <button className="ghost" onClick={returnToDashboard}>Dashboard</button>
            )}

            {room && (
              <button className="ghost danger" onClick={leaveRoom}>Exit Room</button>
            )}

            <button onClick={logout}>Logout</button>
          </div>
        </header>

        {error && <div className="error">{error}</div>}

        {view === 'dashboard' && (
          <Dashboard
            user={user}
            isAdmin={isAdmin}
            inventory={inventory}
            trades={trades}
            onNavigate={setView}
            onCreateRoom={createRoom}
            onJoinRoom={joinRoom}
          />
        )}

        {view === 'inventory' && (
          <Inventory
            title="My Inventory"
            items={inventory}
            droppableId="inventory-drop"
            onAddImgurItem={addImgurItem}
            onDeleteItem={deleteItem}
            onDoubleClickItem={moveToOffer}
            onOfferItem={room ? moveToOffer : undefined}
          />
        )}

        {view === 'trades' && (
          <Trades
            trades={trades}
            currentUser={user}
            onRefresh={() => refreshAllForUser(user)}
            onCounter={openCounter}
          />
        )}

        {view === 'offer' && (
          <TradeOfferPanel
            currentUser={user}
            inventory={inventory}
            counterTrade={counterTrade}
            onClose={() => {
              setCounterTrade(null);
              setView('dashboard');
              refreshAllForUser(user);
            }}
          />
        )}

        {view === 'admin' && isAdmin && <AdminPanel />}

        {view === 'trade' && (
          <>
            <section className="card room-info-card">
              <div>
                <h2>Live Room</h2>
                <p>Room ID: <strong>{room?.roomId || 'Not in a room'}</strong></p>
                {roomUrl && <p className="muted">Room link: {roomUrl}</p>}
                {room?.acceptedTradeId && (
                  <p className="muted">Accepted trade saved as #{room.acceptedTradeId}</p>
                )}
              </div>

              <div className="inline-controls">
                {roomUrl && (
                  <button onClick={() => navigator.clipboard?.writeText(roomUrl)}>
                    Copy Room Link
                  </button>
                )}
                {room?.roomId && (
                  <button onClick={() => navigator.clipboard?.writeText(room.roomId)}>
                    Copy Room ID
                  </button>
                )}
              </div>
            </section>

            <section className="grid two">
              <Inventory
                title="Your Inventory"
                items={visibleInventory}
                droppableId="inventory-drop"
                onAddImgurItem={addImgurItem}
                onDeleteItem={deleteItem}
                onDoubleClickItem={moveToOffer}
                onOfferItem={moveToOffer}
              />

              <Inventory
                title="View Player Inventory"
                items={viewedInventory}
                readOnly
                usernameValue={viewUsername}
                onUsernameChange={setViewUsername}
                onSearch={() => loadViewedInventory()}
              />
            </section>

            <TradeBoard
              myOfferItems={myOfferItems}
              theirOfferItems={theirOfferItems}
              myAccepted={myAccepted}
              theirAccepted={theirAccepted}
              myConfirmed={myConfirmed}
              theirConfirmed={theirConfirmed}
              canAccept={Boolean(room && theirPlayer)}
              canConfirm={Boolean(room && theirPlayer && myAccepted && theirAccepted)}
              onAccept={acceptTrade}
              onConfirm={confirmTrade}
              onDoubleClickOfferItem={moveToInventory}
            />

            <TradeChat
              disabled={!room || !theirPlayer}
              messages={room?.messages || []}
              currentUser={user}
              onSend={sendChatMessage}
            />
          </>
        )}
      </main>

      <DragOverlay dropAnimation={null}>
        {activeDragItem ? (
          <div className="item-card drag-overlay">
            <img src={activeDragItem.image} alt={activeDragItem.title} />
            <span>{activeDragItem.title}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
