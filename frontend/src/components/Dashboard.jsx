import { useMemo, useState } from 'react';

function StatLineChart({ inventory, trades }) {
  const points = useMemo(() => {
    const itemCount = inventory.length;
    const tradedCount = trades.filter(trade => trade.status === 'completed').length;

    return [
      { label: 'Inventory', value: itemCount },
      { label: 'Traded', value: tradedCount }
    ];
  }, [inventory, trades]);

  const max = Math.max(1, ...points.map(point => point.value));
  const coords = points
    .map((point, index) => {
      const x = 40 + index * 180;
      const y = 170 - (point.value / max) * 120;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <section className="card chart-card">
      <h3>Items</h3>
      <svg className="line-chart" viewBox="0 0 260 210" role="img" aria-label="Items chart">
        <line x1="30" y1="180" x2="240" y2="180" />
        <line x1="30" y1="30" x2="30" y2="180" />
        <polyline points={coords} />
        {points.map((point, index) => {
          const x = 40 + index * 180;
          const y = 170 - (point.value / max) * 120;

          return (
            <g key={point.label}>
              <circle cx={x} cy={y} r="5" />
              <text x={x - 20} y="202">{point.label}</text>
              <text x={x - 4} y={y - 10}>{point.value}</text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}

function TradesPieChart({ trades }) {
  const [hovered, setHovered] = useState(null);

  const counts = useMemo(() => {
    const accepted = trades.filter(trade => trade.status === 'accepted').length;
    const completed = trades.filter(trade => trade.status === 'completed').length;
    const declined = trades.filter(trade => trade.status === 'declined').length;

    return [
      { key: 'accepted', label: 'Accepted', value: accepted, className: 'pie-accepted' },
      { key: 'completed', label: 'Completed', value: completed, className: 'pie-completed' },
      { key: 'declined', label: 'Declined', value: declined, className: 'pie-declined' }
    ];
  }, [trades]);

  const total = Math.max(1, counts.reduce((sum, item) => sum + item.value, 0));
  let offset = 25;

  return (
    <section className="card chart-card">
      <h3>Trade Status</h3>

      <div className="pie-wrap">
        <svg className="pie-chart" viewBox="0 0 42 42" role="img" aria-label="Trade status chart">
          {counts.map(item => {
            const length = total === 0 ? 0 : (item.value / total) * 100;
            const dash = `${length} ${100 - length}`;
            const currentOffset = offset;
            offset -= length;

            return (
              <circle
                key={item.key}
                className={`pie-slice ${item.className} ${hovered === item.key ? 'hovered' : ''} ${hovered && hovered !== item.key ? 'dimmed' : ''}`}
                cx="21"
                cy="21"
                r="15.915"
                strokeDasharray={dash}
                strokeDashoffset={currentOffset}
                onMouseEnter={() => setHovered(item.key)}
                onMouseLeave={() => setHovered(null)}
              />
            );
          })}
        </svg>

        <div className="pie-center">
          <strong>{hovered ? counts.find(item => item.key === hovered)?.value ?? 0 : trades.length}</strong>
          <span>{hovered ? counts.find(item => item.key === hovered)?.label : 'Trades'}</span>
        </div>
      </div>

      <div className="chart-legend">
        {counts.map(item => (
          <span key={item.key}>{item.label}: {item.value}</span>
        ))}
      </div>
    </section>
  );
}

export default function Dashboard({
  user,
  isAdmin,
  inventory,
  trades,
  onNavigate,
  onCreateRoom,
  onJoinRoom
}) {
  const [roomId, setRoomId] = useState('');
  const [profileUsername, setProfileUsername] = useState('');

  function submitJoinRoom(event) {
    event.preventDefault();

    if (!roomId.trim()) return;

    onJoinRoom(roomId.trim());
    setRoomId('');
  }

  function submitViewInventory(event) {
    event.preventDefault();

    const cleanUsername = profileUsername.trim();
    if (!cleanUsername) return;

    const base = import.meta.env.BASE_URL || '/';
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    window.location.href = `${window.location.origin}${cleanBase}/user/${encodeURIComponent(cleanUsername)}`;
  }

  return (
    <section className="dashboard-layout">
      <div className="charts-panel">
        <StatLineChart inventory={inventory} trades={trades} />
        <TradesPieChart trades={trades} />
      </div>

      <div className="dashboard-menu">
        <div className="dashboard-welcome">
          <h2>Welcome, {user.username}</h2>
          <p className="muted">Manage inventory, trades, rooms, and player profiles.</p>
        </div>

        <button className="dashboard-tile" onClick={() => onNavigate('inventory')}>
          My Inventory
        </button>

        <button className="dashboard-tile" onClick={() => onNavigate('trades')}>
          Trades
        </button>

        <button className="dashboard-tile" onClick={onCreateRoom}>
          Create Room
        </button>

        <form className="join-card" onSubmit={submitJoinRoom}>
          <h3>Join Room</h3>
          <input
            value={roomId}
            onChange={event => setRoomId(event.target.value)}
            placeholder="Enter room ID"
          />
          <button type="submit">Join Room</button>
        </form>

        <form className="join-card" onSubmit={submitViewInventory}>
          <h3>View Player Inventory</h3>
          <input
            value={profileUsername}
            onChange={event => setProfileUsername(event.target.value)}
            placeholder="Enter username"
          />
          <button type="submit">View Inventory</button>
        </form>

        <button className="dashboard-tile offer-tile" onClick={() => onNavigate('offer')}>
          Make Offline Trade Offer
        </button>

        {isAdmin && (
          <button className="dashboard-tile" onClick={() => onNavigate('admin')}>
            Admin Panel
          </button>
        )}
      </div>
    </section>
  );
}
