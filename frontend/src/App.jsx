import { useEffect, useMemo, useState } from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';

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

function parseDraggedItemId(value) {
  const raw = String(value || '');
  const cleaned = raw.replace(/^(inv|offer|own|their|selected)-/, '');
  const itemId = Number(cleaned);
  return Number.isFinite(itemId) ? itemId : null;
}

export default function App() {
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

  const isAdmin = String(user?.username || '').trim().toLowerCase() === 'salt';

  const myOfferIds = useMemo(() => (room && user ? room.offers?.[user.id] || [] : []), [room, user]);

  const theirPlayer = useMemo(
    () => room && user ? room.players.find(player => Number(player.id) !== Number(user.id)) || null : null,
    [room, user]
  );

  const theirOfferIds = useMemo(
    () => room && theirPlayer ? room.offers?.[theirPlayer.id] || [] : [],
    [room, theirPlayer]
  );

  const visibleInventory = useMemo(
    () => inventory.filter(item => !myOfferIds.includes(item.id)),
    [inventory, myOfferIds]
  );

  const myOfferItems = useMemo(
    () => inventory.filter(item => myOfferIds.includes(item.id)),
    [inventory, myOfferIds]
  );

  const theirOfferItems = useMemo(
    () => viewedInventory.filter(item => theirOfferIds.includes(item.id)),
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

    refreshAll();

    const nextSocket = createSocket();
    setSocket(nextSocket);

    nextSocket.on('room:update', nextRoom => {
      setRoom(nextRoom);
      setError('');
      setView('trade');
    });

    nextSocket.on('room:error', setError);

    nextSocket.on('room:closed', () => {
      setRoom(null);
      setView('dashboard');
      refreshAll();
    });

    nextSocket.on('inventory:updated', ({ username }) => {
      if (!username) return;

      if (username === user.username) {
        refreshInventory(user.username);
      }

      if (theirPlayer?.username && username === theirPlayer.username) {
        loadViewedInventory(username);
      }
    });

    nextSocket.on('trade:accepted-saved', () => {
      loadTrades();
    });

    nextSocket.on('trade:completed', () => {
      setRoom(null);
      setView('dashboard');
      refreshAll();
      alert('Trade completed. Inventories updated.');
    });

    nextSocket.on('chat:message', message => {
      setRoom(current => {
        if (!current) return current;

        const existing = current.messages || [];

        if (existing.some(item => item.id === message.id)) return current;

        return {
          ...current,
          messages: [...existing, message]
        };
      });
    });

    return () => nextSocket.disconnect();
  }, [user, theirPlayer?.username]);

  useEffect(() => {
    if (theirPlayer?.username) {
      loadViewedInventory(theirPlayer.username);
    }
  }, [theirPlayer?.username]);

  async function refreshAll() {
    if (!user) return;

    await Promise.all([
      refreshInventory(user.username),
      loadTrades()
    ]);
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
    if (room?.roomId) {
      socket?.emit('inventory:updated', { roomId: room.roomId });
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
    socket?.emit('room:create');
  }

  function joinRoom(roomId) {
    socket?.emit('room:join', { roomId });
  }

  function leaveRoom() {
    if (room) {
      socket?.emit('room:leave', { roomId: room.roomId });
    }

    setRoom(null);
    setView('dashboard');
  }

  function returnToDashboard() {
    setView('dashboard');
  }

  function updateOffer(nextOfferIds) {
    if (!room) return;

    socket?.emit('trade:offer', {
      roomId: room.roomId,
      itemIds: nextOfferIds
    });
  }

  function moveToOffer(itemId) {
    const id = Number(itemId);
    if (!room || !Number.isFinite(id)) return;
    if (myOfferIds.includes(id)) return;

    updateOffer([...myOfferIds, id]);
  }

  function moveToInventory(itemId) {
    const id = Number(itemId);
    if (!room || !Number.isFinite(id)) return;

    updateOffer(myOfferIds.filter(existingId => existingId !== id));
  }

  function handleDragStart(event) {
    const itemId = parseDraggedItemId(event.active.id);

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

    const itemId = parseDraggedItemId(active.id);

    if (!itemId) return;

    if (over.id === 'my-offer') {
      moveToOffer(itemId);
      return;
    }

    if (over.id === 'inventory') {
      moveToInventory(itemId);
    }
  }

  function acceptTrade() {
    socket?.emit('trade:accept', { roomId: room.roomId });
  }

  function confirmTrade() {
    socket?.emit('trade:confirm', { roomId: room.roomId });
  }

  function sendChatMessage(message) {
    if (!room) return;

    socket?.emit('chat:send', {
      roomId: room.roomId,
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

  if (!user) {
    return <AuthForm onLogin={setUser} />;
  }

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <main className="app-shell">
        <header className="topbar">
          <div>
            <h1>VelkTrade</h1>
            <p>Logged in as {user.username}</p>
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
            droppableId="inventory"
            onAddImgurItem={addImgurItem}
            onDeleteItem={deleteItem}
            onDoubleClickItem={moveToOffer}
          />
        )}

        {view === 'trades' && (
          <Trades
            trades={trades}
            currentUser={user}
            onRefresh={refreshAll}
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
              refreshAll();
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
                {room?.acceptedTradeId && (
                  <p className="muted">Accepted trade saved as #{room.acceptedTradeId}</p>
                )}
              </div>

              {room?.roomId && (
                <button onClick={() => navigator.clipboard?.writeText(room.roomId)}>
                  Copy Room ID
                </button>
              )}
            </section>

            <section className="grid two">
              <Inventory
                title="Your Inventory"
                items={visibleInventory}
                droppableId="inventory"
                onAddImgurItem={addImgurItem}
                onDeleteItem={deleteItem}
                onDoubleClickItem={moveToOffer}
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
