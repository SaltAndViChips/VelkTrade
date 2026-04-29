import { useState } from 'react';
import ChartsPanel from './ChartsPanel';

export default function Dashboard({ user, isAdmin, inventory, trades, onNavigate, onCreateRoom, onJoinRoom }) {
  const [roomId, setRoomId] = useState('');

  function join() {
    if (!roomId.trim()) return;
    onJoinRoom(roomId.trim());
  }

  return (
    <section className="dashboard-layout">
      <ChartsPanel inventory={inventory} trades={trades} />

      <div className="dashboard-menu">
        <div className="dashboard-welcome">
          <h2>Dashboard</h2>
          <p>Welcome back, {user.username}.</p>
        </div>

        <button className="dashboard-tile inventory-tile" onClick={() => onNavigate('inventory')}>My Inventory</button>
        <button className="dashboard-tile history-tile" onClick={() => onNavigate('trades')}>Trades</button>
        <button className="dashboard-tile offer-tile" onClick={() => onNavigate('offer')}>Make Offline Trade Offer</button>
        <button className="dashboard-tile create-tile" onClick={onCreateRoom}>Create Room</button>

        <div className="dashboard-tile join-tile join-card">
          <span>Join Room</span>
          <div className="inline-controls">
            <input value={roomId} onChange={e => setRoomId(e.target.value)} placeholder="Room ID" />
            <button onClick={join}>Join</button>
          </div>
        </div>

        {isAdmin && (
          <button className="dashboard-tile admin-tile" onClick={() => onNavigate('admin')}>Admin Panel</button>
        )}
      </div>
    </section>
  );
}
