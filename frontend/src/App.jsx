import { useEffect, useMemo, useState } from 'react';
import { DndContext } from '@dnd-kit/core';

import { api, clearToken, getToken } from './api';
import { createSocket } from './socket';
import AuthForm from './components/AuthForm';
import RoomPanel from './components/RoomPanel';
import Inventory from './components/Inventory';
import TradeBoard from './components/TradeBoard';

export default function App() {
  const [user, setUser] = useState(null);
  const [socket, setSocket] = useState(null);

  const [inventory, setInventory] = useState([]);
  const [viewUsername, setViewUsername] = useState('');
  const [viewedInventory, setViewedInventory] = useState([]);

  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');

  const myOfferIds = useMemo(() => {
    if (!room || !user) return [];
    return room.offers?.[user.id] || [];
  }, [room, user]);

  const theirPlayer = useMemo(() => {
    if (!room || !user) return null;
    return room.players.find(player => player.id !== user.id) || null;
  }, [room, user]);

  const theirOfferIds = useMemo(() => {
    if (!room || !theirPlayer) return [];
    return room.offers?.[theirPlayer.id] || [];
  }, [room, theirPlayer]);

  const visibleInventory = useMemo(() => {
    return inventory.filter(item => !myOfferIds.includes(item.id));
  }, [inventory, myOfferIds]);

  const myOfferItems = useMemo(() => {
    return inventory.filter(item => myOfferIds.includes(item.id));
  }, [inventory, myOfferIds]);

  const theirOfferItems = useMemo(() => {
    return viewedInventory.filter(item => theirOfferIds.includes(item.id));
  }, [viewedInventory, theirOfferIds]);

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

    refreshInventory(user.username);

    const nextSocket = createSocket();
    setSocket(nextSocket);

    nextSocket.on('room:update', nextRoom => {
      setRoom(nextRoom);
      setError('');
    });

    nextSocket.on('room:error', message => {
      setError(message);
    });

    nextSocket.on('trade:completed', () => {
      refreshInventory(user.username);
      alert('Trade completed. Inventories updated.');
    });

    return () => {
      nextSocket.disconnect();
    };
  }, [user]);

  useEffect(() => {
    if (theirPlayer?.username) {
      loadViewedInventory(theirPlayer.username);
    }
  }, [theirPlayer?.username]);

  async function refreshInventory(username) {
    const data = await api(`/api/inventory/${username}`);
    setInventory(data.items || []);
  }

  async function loadViewedInventory(username = viewUsername) {
    if (!username) return;
    const data = await api(`/api/inventory/${username}`);
    setViewedInventory(data.items || []);
  }

  async function addImgurItem(image) {
    await api('/api/items', {
      method: 'POST',
      body: JSON.stringify({ image })
    });

    await refreshInventory(user.username);
  }

  function createRoom() {
    socket?.emit('room:create');
  }

  function joinRoom(roomId) {
    socket?.emit('room:join', { roomId });
  }

  function updateOffer(nextOfferIds) {
    if (!room) return;
    socket?.emit('trade:offer', {
      roomId: room.roomId,
      itemIds: nextOfferIds
    });
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over) return;

    const itemId = Number(active.id);

    if (over.id === 'my-offer') {
      if (!myOfferIds.includes(itemId)) {
        updateOffer([...myOfferIds, itemId]);
      }
    }

    if (over.id === 'inventory') {
      updateOffer(myOfferIds.filter(id => id !== itemId));
    }
  }

  function acceptTrade() {
    socket?.emit('trade:accept', { roomId: room.roomId });
  }

  function confirmTrade() {
    socket?.emit('trade:confirm', { roomId: room.roomId });
  }

  function logout() {
    clearToken();
    window.location.reload();
  }

  if (!user) {
    return <AuthForm onLogin={setUser} />;
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <main className="app-shell">
        <header className="topbar">
          <div>
            <h1>Realtime Trading App</h1>
            <p>Logged in as {user.username}</p>
          </div>
          <button onClick={logout}>Logout</button>
        </header>

        {error && <div className="error">{error}</div>}

        <RoomPanel room={room} onCreateRoom={createRoom} onJoinRoom={joinRoom} />

        <section className="grid two">
          <Inventory
            title="Your Inventory"
            items={visibleInventory}
            droppableId="inventory"
            onAddImgurItem={addImgurItem}
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
        />
      </main>
    </DndContext>
  );
}
