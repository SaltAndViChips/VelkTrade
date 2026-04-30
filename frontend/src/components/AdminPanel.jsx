import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

function getTradeMeta(trade) {
  const metaMessage = (trade.chatHistory || []).find(message => message.type === 'trade-meta');

  if (!metaMessage?.message) return { icOffers: {} };

  try {
    return JSON.parse(metaMessage.message);
  } catch {
    return { icOffers: {} };
  }
}

function getIcForUser(trade, userId) {
  const meta = getTradeMeta(trade);
  return meta.icOffers?.[userId] || '';
}

function itemCountText(count) {
  return `${count} item${count === 1 ? '' : 's'}`;
}

function buildSideSummary(username, items, icAmount) {
  const parts = [itemCountText(items.length)];
  if (icAmount) parts.push(icAmount);
  return `${username}: ${parts.join(' + ')}`;
}

function MiniAdminItem({ item }) {
  return (
    <div className="admin-mini-item">
      <img src={item.image} alt={item.title} />
      <div>
        <span>{item.title}</span>
        {item.price && <strong className="item-price">{item.price}</strong>}
      </div>
    </div>
  );
}

function AdminTradeSide({ label, items, icAmount }) {
  return (
    <section className="admin-trade-side">
      <div className="panel-title-row">
        <h4>{label}</h4>
        <span className="status-pill">{itemCountText(items.length)}{icAmount ? ` + ${icAmount}` : ''}</span>
      </div>

      {icAmount && (
        <div className="admin-ic-line">
          <div className="ic-token mini">IC</div>
          <strong>{icAmount}</strong>
        </div>
      )}

      <div className="admin-mini-item-grid">
        {items.length === 0 && !icAmount && <p className="muted">No items or IC.</p>}
        {items.map(item => (
          <MiniAdminItem key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function AdminTradeCard({ trade }) {
  const [open, setOpen] = useState(false);

  const fromItems = trade.fromItemDetails || [];
  const toItems = trade.toItemDetails || [];
  const fromIc = getIcForUser(trade, trade.fromUser);
  const toIc = getIcForUser(trade, trade.toUser);
  const visibleMessages = (trade.chatHistory || []).filter(message => message.type !== 'trade-meta');

  const fromSummary = buildSideSummary(trade.fromUsername, fromItems, fromIc);
  const toSummary = buildSideSummary(trade.toUsername, toItems, toIc);

  return (
    <article className={`tidy-trade-card admin-trade-card ${open ? 'open' : ''}`}>
      <button
        type="button"
        className="admin-expand-arrow"
        onClick={() => setOpen(current => !current)}
        aria-label={open ? 'Collapse trade details' : 'Expand trade details'}
        title={open ? 'Collapse details' : 'Expand details'}
      >
        {open ? '▼' : '▶'}
      </button>

      <div className="admin-trade-main">
        <div className="tidy-card-header">
          <div>
            <strong>Trade #{trade.id}</strong>
            <small>{trade.fromUsername} ⇄ {trade.toUsername}</small>
            <small>Room {trade.roomId}</small>
          </div>

          <span className={`status-pill status-${trade.status}`}>{trade.status}</span>
        </div>

        <div className="admin-trade-summary">
          <span>{fromSummary}</span>
          <span>{toSummary}</span>
        </div>

        <small className="muted">{trade.createdAt}</small>

        {open && (
          <div className="admin-trade-expanded">
            <div className="admin-trade-sides">
              <AdminTradeSide
                label={`${trade.fromUsername} offered`}
                items={fromItems}
                icAmount={fromIc}
              />

              <AdminTradeSide
                label={`${trade.toUsername} offered/requested`}
                items={toItems}
                icAmount={toIc}
              />
            </div>

            <section className="admin-chat-log">
              <div className="panel-title-row">
                <h4>Chat Log</h4>
                <span className="status-pill">{visibleMessages.length} message{visibleMessages.length === 1 ? '' : 's'}</span>
              </div>

              {visibleMessages.length === 0 && <p className="muted">No chat messages recorded.</p>}

              <div className="history-chat">
                {visibleMessages.map(message => (
                  <p key={message.id}>
                    <strong>{message.username || 'System'}:</strong> {message.message}
                    {message.createdAt && <small> · {message.createdAt}</small>}
                  </p>
                ))}
              </div>
            </section>

            <section className="admin-trade-meta">
              <h4>Metadata</h4>
              <div className="tidy-meta-grid">
                <span><strong>Trade ID</strong>{trade.id}</span>
                <span><strong>Room ID</strong>{trade.roomId}</span>
                <span><strong>Status</strong>{trade.status}</span>
                <span><strong>Created</strong>{trade.createdAt}</span>
              </div>
            </section>
          </div>
        )}
      </div>
    </article>
  );
}

function RoomPlayerSummary({ player, room }) {
  const itemCount = room.offers?.[player.id]?.length || 0;
  const icAmount = room.icOffers?.[player.id] || '';
  const accepted = Boolean(room.accepted?.[player.id]);
  const confirmed = Boolean(room.confirmed?.[player.id]);

  return (
    <div className="admin-room-player">
      <strong>{player.username}</strong>
      <span>{itemCount} item{itemCount === 1 ? '' : 's'} offered</span>
      {icAmount && <span className="item-price">{icAmount}</span>}
      <span className={`status-pill ${confirmed ? 'status-completed' : accepted ? 'status-accepted' : 'status-pending'}`}>
        {confirmed ? 'confirmed' : accepted ? 'accepted' : 'editing'}
      </span>
    </div>
  );
}

export default function AdminPanel({ onJoinRoom }) {
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [allTrades, setAllTrades] = useState([]);
  const [search, setSearch] = useState('');
  const [showAdminsOnly, setShowAdminsOnly] = useState(false);
  const [showOnlineOnly, setShowOnlineOnly] = useState(false);
  const [resetUsername, setResetUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [tradeSearch, setTradeSearch] = useState('');

  async function loadAdminData() {
    const [usersData, roomsData, tradesData] = await Promise.all([
      api('/api/admin/users'),
      api('/api/admin/rooms'),
      api('/api/admin/trades').catch(() => ({ trades: [] }))
    ]);

    setUsers(usersData.users || []);
    setRooms(roomsData.rooms || []);
    setAllTrades(tradesData.trades || []);
  }

  useEffect(() => {
    loadAdminData();
  }, []);

  const filteredUsers = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return [...users]
      .sort((a, b) => Number(a.id) - Number(b.id))
      .filter(user => {
        const matchesSearch =
          !needle ||
          String(user.id).includes(needle) ||
          String(user.username || '').toLowerCase().includes(needle);

        const matchesAdmin = !showAdminsOnly || user.isAdmin;
        const matchesOnline = !showOnlineOnly || user.online;

        return matchesSearch && matchesAdmin && matchesOnline;
      });
  }, [users, search, showAdminsOnly, showOnlineOnly]);

  const filteredTrades = useMemo(() => {
    const needle = tradeSearch.trim().toLowerCase();

    if (!needle) return allTrades;

    return allTrades.filter(trade => {
      const fromIc = getIcForUser(trade, trade.fromUser);
      const toIc = getIcForUser(trade, trade.toUser);
      const fromItems = (trade.fromItemDetails || []).map(item => `${item.title} ${item.price || ''}`).join(' ');
      const toItems = (trade.toItemDetails || []).map(item => `${item.title} ${item.price || ''}`).join(' ');
      const chat = (trade.chatHistory || []).map(message => `${message.username || ''} ${message.message || ''}`).join(' ');

      return [
        trade.id,
        trade.roomId,
        trade.status,
        trade.fromUsername,
        trade.toUsername,
        trade.createdAt,
        fromIc,
        toIc,
        fromItems,
        toItems,
        chat
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [allTrades, tradeSearch]);

  async function resetPassword(event) {
    event.preventDefault();
    setMessage('');

    const data = await api('/api/admin/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        username: resetUsername,
        newPassword
      })
    });

    setMessage(data.message || 'Password reset.');
    setResetUsername('');
    setNewPassword('');
  }

  async function setAdminFlag(username, isAdmin) {
    setMessage('');

    const data = await api('/api/admin/set-admin', {
      method: 'POST',
      body: JSON.stringify({
        username,
        isAdmin
      })
    });

    setMessage(data.message || 'Admin flag updated.');
    await loadAdminData();
  }

  function makeRoomLink(roomId) {
    const base = import.meta.env.BASE_URL || '/';
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${window.location.origin}${cleanBase}/room/${roomId}`;
  }

  return (
    <section className="card admin-panel tidy-admin-page">
      <div className="panel-title-row">
        <div>
          <h2>Admin Panel</h2>
          <p className="muted">Manage players, rooms, trades, and admin access.</p>
        </div>

        <button type="button" onClick={loadAdminData}>Refresh</button>
      </div>

      {message && <p className="success">{message}</p>}

      <div className="segmented-control trades-tabs">
        <button className={activeTab === 'users' ? 'active' : ''} onClick={() => setActiveTab('users')}>
          Users
        </button>
        <button className={activeTab === 'rooms' ? 'active' : ''} onClick={() => setActiveTab('rooms')}>
          Open Rooms
        </button>
        <button className={activeTab === 'trades' ? 'active' : ''} onClick={() => setActiveTab('trades')}>
          All Trades
        </button>
        <button className={activeTab === 'tools' ? 'active' : ''} onClick={() => setActiveTab('tools')}>
          Tools
        </button>
      </div>

      {activeTab === 'users' && (
        <section className="tidy-tab-panel">
          <div className="tidy-toolbar admin-toolbar">
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search users by ID or username..."
            />

            <label className="admin-filter-toggle">
              <input
                type="checkbox"
                checked={showAdminsOnly}
                onChange={event => setShowAdminsOnly(event.target.checked)}
              />
              Admins only
            </label>

            <label className="admin-filter-toggle">
              <input
                type="checkbox"
                checked={showOnlineOnly}
                onChange={event => setShowOnlineOnly(event.target.checked)}
              />
              Online only
            </label>
          </div>

          <p className="muted tidy-count">
            Showing {filteredUsers.length} of {users.length} users. Sorted by ID.
          </p>

          <div className="admin-user-grid">
            {filteredUsers.map(user => (
              <article className="tidy-trade-card admin-user-card" key={user.id}>
                <div className="tidy-card-header">
                  <div>
                    <strong>#{user.id} · {user.username}</strong>
                    <small>{user.isAdmin ? 'Admin' : 'Player'}</small>
                  </div>

                  <div className="inline-controls">
                    {user.online ? <span className="online-status">Online</span> : <span className="offline-status">Offline</span>}
                    {user.isAdmin && <span className="status-pill">admin</span>}
                  </div>
                </div>

                <div className="tidy-card-actions">
                  {user.isAdmin ? (
                    <button className="danger" onClick={() => setAdminFlag(user.username, false)}>
                      Remove Admin
                    </button>
                  ) : (
                    <button onClick={() => setAdminFlag(user.username, true)}>
                      Make Admin
                    </button>
                  )}

                  <button
                    className="ghost"
                    onClick={() => {
                      setResetUsername(user.username);
                      setActiveTab('tools');
                    }}
                  >
                    Reset Password
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'rooms' && (
        <section className="tidy-tab-panel">
          <div className="panel-title-row">
            <div>
              <h3>Open Rooms</h3>
              <p className="muted">Showing rooms with exactly 2 players.</p>
            </div>
            <button type="button" onClick={loadAdminData}>Refresh Rooms</button>
          </div>

          {rooms.length === 0 && <p className="muted tidy-empty">No full live rooms are currently open.</p>}

          <div className="tidy-list">
            {rooms.map(room => (
              <article className="tidy-trade-card admin-room-card" key={room.roomId}>
                <div className="tidy-card-header">
                  <div>
                    <strong>Room {room.roomId}</strong>
                    <small>{room.messagesCount || 0} chat message{room.messagesCount === 1 ? '' : 's'}</small>
                  </div>

                  <span className="status-pill">{room.players.length}/2 players</span>
                </div>

                <div className="admin-room-players">
                  {room.players.map(player => (
                    <RoomPlayerSummary key={player.id} player={player} room={room} />
                  ))}
                </div>

                <div className="admin-room-link">
                  <input value={makeRoomLink(room.roomId)} readOnly />
                </div>

                <div className="tidy-card-actions">
                  <button type="button" onClick={() => onJoinRoom?.(room.roomId)}>
                    Enter Room
                  </button>
                  <button type="button" className="ghost" onClick={() => navigator.clipboard?.writeText(makeRoomLink(room.roomId))}>
                    Copy Link
                  </button>
                  <button type="button" className="ghost" onClick={() => navigator.clipboard?.writeText(room.roomId)}>
                    Copy ID
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'trades' && (
        <section className="tidy-tab-panel">
          <div className="tidy-toolbar">
            <input
              value={tradeSearch}
              onChange={event => setTradeSearch(event.target.value)}
              placeholder="Search trades by user, item, IC, chat, room, status..."
            />
          </div>

          <p className="muted tidy-count">
            Showing {filteredTrades.length} of {allTrades.length} trades. Use the side arrow to expand details.
          </p>

          <div className="tidy-list">
            {filteredTrades.map(trade => (
              <AdminTradeCard key={trade.id} trade={trade} />
            ))}
          </div>
        </section>
      )}

      {activeTab === 'tools' && (
        <section className="tidy-tab-panel">
          <form className="admin-tool-card" onSubmit={resetPassword}>
            <h3>Reset Player Password</h3>
            <input
              value={resetUsername}
              onChange={event => setResetUsername(event.target.value)}
              placeholder="Username"
            />
            <input
              value={newPassword}
              onChange={event => setNewPassword(event.target.value)}
              placeholder="New password"
              type="password"
            />
            <button type="submit">Reset Password</button>
          </form>
        </section>
      )}
    </section>
  );
}
