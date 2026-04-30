import { useMemo, useState } from 'react';

function shortDate(value) {
  if (!value) return 'Now';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Trade';

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
}

function getTradeNetForUser(trade, userId) {
  const fromCount = Array.isArray(trade.fromItems) ? trade.fromItems.length : 0;
  const toCount = Array.isArray(trade.toItems) ? trade.toItems.length : 0;

  if (Number(trade.fromUser) === Number(userId)) {
    return {
      inventoryDelta: toCount - fromCount,
      tradedCount: fromCount + toCount
    };
  }

  if (Number(trade.toUser) === Number(userId)) {
    return {
      inventoryDelta: fromCount - toCount,
      tradedCount: fromCount + toCount
    };
  }

  return {
    inventoryDelta: 0,
    tradedCount: 0
  };
}

function buildChartPoints({ inventory, trades, user }) {
  const completedTrades = [...(trades || [])]
    .filter(trade => trade.status === 'completed')
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

  if (completedTrades.length === 0) {
    return [
      {
        label: 'Now',
        inventoryCount: inventory.length,
        tradedCount: 0
      }
    ];
  }

  const totalInventoryDelta = completedTrades.reduce((sum, trade) => {
    return sum + getTradeNetForUser(trade, user.id).inventoryDelta;
  }, 0);

  let inventoryCount = Math.max(0, inventory.length - totalInventoryDelta);
  let tradedCount = 0;

  const points = [
    {
      label: 'Start',
      inventoryCount,
      tradedCount
    }
  ];

  completedTrades.forEach(trade => {
    const delta = getTradeNetForUser(trade, user.id);
    inventoryCount = Math.max(0, inventoryCount + delta.inventoryDelta);
    tradedCount += delta.tradedCount;

    points.push({
      label: shortDate(trade.createdAt),
      inventoryCount,
      tradedCount
    });
  });

  return points;
}

function StatLineChart({ inventory, trades, user }) {
  const points = useMemo(
    () => buildChartPoints({ inventory, trades, user }),
    [inventory, trades, user]
  );

  const max = Math.max(
    1,
    ...points.map(point => point.inventoryCount),
    ...points.map(point => point.tradedCount)
  );

  const width = 520;
  const height = 260;
  const padX = 46;
  const padTop = 26;
  const padBottom = 52;
  const chartWidth = width - padX * 2;
  const chartHeight = height - padTop - padBottom;

  function xFor(index) {
    if (points.length === 1) return padX + chartWidth / 2;
    return padX + (index / (points.length - 1)) * chartWidth;
  }

  function yFor(value) {
    return padTop + chartHeight - (value / max) * chartHeight;
  }

  function lineFor(key) {
    return points.map((point, index) => `${xFor(index)},${yFor(point[key])}`).join(' ');
  }

  return (
    <section className="card chart-card">
      <h3>Inventory & Trades Over Time</h3>

      <svg className="line-chart dashboard-time-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Inventory and traded items over time">
        <line className="chart-axis" x1={padX} y1={height - padBottom} x2={width - padX} y2={height - padBottom} />
        <line className="chart-axis" x1={padX} y1={padTop} x2={padX} y2={height - padBottom} />

        <polyline className="line-inventory" points={lineFor('inventoryCount')} />
        <polyline className="line-traded" points={lineFor('tradedCount')} />

        {points.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            <circle className="point-inventory" cx={xFor(index)} cy={yFor(point.inventoryCount)} r="4.5" />
            <circle className="point-traded" cx={xFor(index)} cy={yFor(point.tradedCount)} r="4.5" />

            {(index === 0 || index === points.length - 1 || points.length <= 5) && (
              <text className="chart-label" x={xFor(index) - 18} y={height - 18}>{point.label}</text>
            )}
          </g>
        ))}
      </svg>

      <div className="chart-legend horizontal-legend">
        <span><i className="legend-dot inventory-dot" /> Inventory over time</span>
        <span><i className="legend-dot traded-dot" /> Traded items over time</span>
      </div>
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

  const rawTotal = counts.reduce((sum, item) => sum + item.value, 0);
  const total = Math.max(1, rawTotal);
  let offset = 25;

  return (
    <section className="card chart-card">
      <h3>Trade Status</h3>

      <div className="pie-wrap">
        <svg className="pie-chart" viewBox="0 0 42 42" role="img" aria-label="Trade status chart">
          {counts.map(item => {
            const length = rawTotal === 0 ? 100 / counts.length : (item.value / total) * 100;
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
        <StatLineChart inventory={inventory} trades={trades} user={user} />
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
