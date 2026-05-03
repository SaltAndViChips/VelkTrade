import { useEffect, useMemo, useState } from 'react';

const RANGE_OPTIONS = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'ytd', label: 'YTD' },
  { key: 'yearly', label: 'Yearly' }
];

const DASHBOARD_FAQ_KEY = 'velktrade:dashboard-faq-seen:v1';

function shortDate(value, range) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Now';

  if (range === 'yearly') {
    return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  }

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getRangeStart(range, now = new Date()) {
  const start = new Date(now);

  if (range === 'weekly') {
    start.setDate(now.getDate() - 7);
  } else if (range === 'monthly') {
    start.setMonth(now.getMonth() - 1);
  } else if (range === 'ytd') {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setFullYear(now.getFullYear() - 1);
  }

  return start;
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

function buildFiveBuckets(range) {
  const now = new Date();
  const start = getRangeStart(range, now);
  const startMs = start.getTime();
  const endMs = now.getTime();
  const step = (endMs - startMs) / 4;

  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date(startMs + step * index);

    return {
      date,
      label: shortDate(date, range),
      inventoryDelta: 0,
      tradedCount: 0
    };
  });
}

function buildChartPoints({ inventory, trades, user, range }) {
  const now = new Date();
  const start = getRangeStart(range, now);
  const buckets = buildFiveBuckets(range);

  const completedTrades = [...(trades || [])]
    .filter(trade => trade.status === 'completed')
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

  const currentInventoryCount = inventory.length;

  const totalInventoryDeltaAllTime = completedTrades.reduce((sum, trade) => {
    return sum + getTradeNetForUser(trade, user.id).inventoryDelta;
  }, 0);

  const inventoryBeforeAllCompleted = Math.max(0, currentInventoryCount - totalInventoryDeltaAllTime);

  const tradesBeforeRange = completedTrades.filter(trade => {
    const date = new Date(trade.createdAt || 0);
    return !Number.isNaN(date.getTime()) && date < start;
  });

  let inventoryAtRangeStart = inventoryBeforeAllCompleted;

  tradesBeforeRange.forEach(trade => {
    inventoryAtRangeStart = Math.max(
      0,
      inventoryAtRangeStart + getTradeNetForUser(trade, user.id).inventoryDelta
    );
  });

  const tradesInRange = completedTrades.filter(trade => {
    const date = new Date(trade.createdAt || 0);
    return !Number.isNaN(date.getTime()) && date >= start && date <= now;
  });

  const startMs = start.getTime();
  const endMs = now.getTime();
  const step = Math.max(1, (endMs - startMs) / 4);

  tradesInRange.forEach(trade => {
    const date = new Date(trade.createdAt || 0);
    const bucketIndex = Math.min(4, Math.max(0, Math.round((date.getTime() - startMs) / step)));
    const delta = getTradeNetForUser(trade, user.id);

    buckets[bucketIndex].inventoryDelta += delta.inventoryDelta;
    buckets[bucketIndex].tradedCount += delta.tradedCount;
  });

  let runningInventory = inventoryAtRangeStart;
  let runningTraded = 0;

  return buckets.map((bucket, index) => {
    runningInventory = Math.max(0, runningInventory + bucket.inventoryDelta);
    runningTraded += bucket.tradedCount;

    return {
      ...bucket,
      index,
      inventoryCount: runningInventory,
      tradedCount: runningTraded
    };
  });
}

function StatLineChart({ inventory, trades, user }) {
  const [range, setRange] = useState('monthly');
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const points = useMemo(
    () => buildChartPoints({ inventory, trades, user, range }),
    [inventory, trades, user, range]
  );

  const max = Math.max(
    1,
    ...points.map(point => point.inventoryCount),
    ...points.map(point => point.tradedCount)
  );

  const width = 520;
  const height = 280;
  const padX = 48;
  const padTop = 28;
  const padBottom = 58;
  const chartWidth = width - padX * 2;
  const chartHeight = height - padTop - padBottom;

  function xFor(index) {
    return padX + (index / 4) * chartWidth;
  }

  function yFor(value) {
    return padTop + chartHeight - (value / max) * chartHeight;
  }

  function lineFor(key) {
    return points.map((point, index) => `${xFor(index)},${yFor(point[key])}`).join(' ');
  }

  return (
    <section className="card chart-card">
      <div className="panel-title-row chart-title-row">
        <div>
          <h3>Inventory & Trades Over Time</h3>
          <p className="muted">Five points across the selected period.</p>
        </div>

        <div className="segmented-control compact chart-range-tabs">
          {RANGE_OPTIONS.map(option => (
            <button
              type="button"
              key={option.key}
              className={range === option.key ? 'active' : ''}
              onClick={() => {
                setRange(option.key);
                setHoveredPoint(null);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-hover-wrap">
        <svg
          className="line-chart dashboard-time-chart"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Inventory and traded items over time"
          onMouseLeave={() => setHoveredPoint(null)}
        >
          <line className="chart-axis" x1={padX} y1={height - padBottom} x2={width - padX} y2={height - padBottom} />
          <line className="chart-axis" x1={padX} y1={padTop} x2={padX} y2={height - padBottom} />

          {[0, 0.25, 0.5, 0.75, 1].map(mark => {
            const y = padTop + chartHeight - mark * chartHeight;
            const label = Math.round(mark * max);

            return (
              <g key={mark}>
                <line className="chart-grid-line" x1={padX} y1={y} x2={width - padX} y2={y} />
                <text className="chart-y-label" x="8" y={y + 4}>{label}</text>
              </g>
            );
          })}

          <polyline className="line-inventory" points={lineFor('inventoryCount')} />
          <polyline className="line-traded" points={lineFor('tradedCount')} />

          {points.map((point, index) => {
            const x = xFor(index);
            const inventoryY = yFor(point.inventoryCount);
            const tradedY = yFor(point.tradedCount);
            const isHovered = hoveredPoint?.index === index;

            return (
              <g key={`${point.label}-${index}`}>
                {isHovered && (
                  <line className="chart-hover-line" x1={x} y1={padTop} x2={x} y2={height - padBottom} />
                )}

                <circle
                  className={`point-inventory ${isHovered ? 'hovered' : ''}`}
                  cx={x}
                  cy={inventoryY}
                  r={isHovered ? '6' : '4.5'}
                  onMouseEnter={() => setHoveredPoint(point)}
                />
                <circle
                  className={`point-traded ${isHovered ? 'hovered' : ''}`}
                  cx={x}
                  cy={tradedY}
                  r={isHovered ? '6' : '4.5'}
                  onMouseEnter={() => setHoveredPoint(point)}
                />

                <rect
                  className="chart-hover-target"
                  x={x - chartWidth / 10}
                  y={padTop}
                  width={chartWidth / 5}
                  height={chartHeight}
                  onMouseEnter={() => setHoveredPoint(point)}
                />

                <text className="chart-label" x={x - 18} y={height - 20}>{point.label}</text>
              </g>
            );
          })}
        </svg>

        {hoveredPoint && (
          <div className="chart-tooltip">
            <strong>{hoveredPoint.label}</strong>
            <span><i className="legend-dot inventory-dot" /> Inventory: {hoveredPoint.inventoryCount}</span>
            <span><i className="legend-dot traded-dot" /> Traded: {hoveredPoint.tradedCount}</span>
          </div>
        )}
      </div>

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

function DashboardFaqModal({ onClose }) {
  return (
    <div className="dashboard-faq-backdrop" onMouseDown={onClose}>
      <section className="dashboard-faq-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="dashboard-faq-title">
        <button type="button" className="dashboard-faq-close" onClick={onClose}>×</button>
        <div className="dashboard-faq-header">
          <span className="dashboard-faq-icon">?</span>
          <div>
            <h2 id="dashboard-faq-title">VelkTrade Quick FAQ</h2>
            <p className="muted">A quick rundown of the main menu and what each option does.</p>
          </div>
        </div>

        <div className="dashboard-faq-grid">
          <article>
            <h3>My Inventory</h3>
            <p>Add your items, organize folders, set Bazaar prices, lock items, use bulk tools, and manage notes/cleanup options.</p>
          </article>
          <article>
            <h3>Trades</h3>
            <p>View incoming/outgoing trade offers, buy offers, counters, accepted trades, completed trades, declined trades, and trade history.</p>
          </article>
          <article>
            <h3>Bazaar</h3>
            <p>Browse listed items, save filters, use the watchlist, mark interest, and access verified-user auctions with bids and buyouts.</p>
          </article>
          <article>
            <h3>Create Room</h3>
            <p>Starts a live trade room you can share with another player for real-time trading.</p>
          </article>
          <article>
            <h3>Join Room</h3>
            <p>Enter a room code from another player to join their live trade room.</p>
          </article>
          <article>
            <h3>View Player Inventory</h3>
            <p>Open another player's public profile and inventory by username.</p>
          </article>
          <article>
            <h3>Make Offline Trade Offer</h3>
            <p>Send a trade offer to another player without needing both players online at the same time.</p>
          </article>
          <article>
            <h3>Admin Panel</h3>
            <p>Visible only to admins/developers. Used for moderation, user controls, audit logs, verified status, and maintenance actions.</p>
          </article>
        </div>

        <div className="dashboard-faq-verify-box">
          <strong>Getting verified</strong>
          <p>To get verified, copy your profile link and message Salt on Discord with that link. Verification unlocks verified-only features like auctions and improves trust on the Bazaar.</p>
        </div>

        <div className="dashboard-faq-actions">
          <button type="button" onClick={onClose}>Got it</button>
        </div>
      </section>
    </div>
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
  const [showFaq, setShowFaq] = useState(false);

  useEffect(() => {
    const hasSeenFaq = window.localStorage.getItem(DASHBOARD_FAQ_KEY) === 'true';
    if (!hasSeenFaq) setShowFaq(true);
  }, []);

  function closeFaq() {
    window.localStorage.setItem(DASHBOARD_FAQ_KEY, 'true');
    setShowFaq(false);
  }

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
      {showFaq && <DashboardFaqModal onClose={closeFaq} />}
      <div className="charts-panel">
        <StatLineChart inventory={inventory} trades={trades} user={user} />
        <TradesPieChart trades={trades} />
      </div>

      <div className="dashboard-menu">
        <div className="dashboard-welcome">
          <h2>Welcome, {user.username}</h2>
          <p className="muted dashboard-subtitle-with-help">
            <span>Manage inventory, trades, rooms, and player profiles.</span>
            <button type="button" className="dashboard-faq-help-button" onClick={() => setShowFaq(true)} aria-label="Open VelkTrade FAQ">?</button>
          </p>
        </div>

        <button className="dashboard-tile" onClick={() => onNavigate('inventory')}>
          My Inventory
        </button>

        <button className="dashboard-tile" onClick={() => onNavigate('trades')}>
          Trades
        </button>

        <button className="dashboard-tile" onClick={() => onNavigate('bazaar')}>
          Bazaar
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
