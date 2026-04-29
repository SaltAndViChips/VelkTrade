import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

function MiniTradeItem({ item }) {
  return (
    <div className="mini-trade-item">
      <img src={item.image} alt={item.title} />
      <span>{item.title}</span>
      <div className="item-full-preview">
        <img src={item.image} alt={item.title} />
        <strong>{item.title}</strong>
      </div>
    </div>
  );
}

function tradeSearchText(trade) {
  const itemNames = [
    ...(trade.fromItemDetails || []).map(item => item.title),
    ...(trade.toItemDetails || []).map(item => item.title)
  ];

  const chatText = (trade.chatHistory || [])
    .map(message => `${message.username || ''} ${message.message || ''}`)
    .join(' ');

  return [
    trade.id,
    trade.roomId,
    trade.status,
    trade.fromUsername,
    trade.toUsername,
    trade.createdAt,
    ...(trade.fromItems || []),
    ...(trade.toItems || []),
    ...itemNames,
    chatText
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export default function AdminPanel() {
  const [trades, setTrades] = useState([]);
  const [users, setUsers] = useState([]);

  const [tradeStatusFilter, setTradeStatusFilter] = useState('all');
  const [tradeSearch, setTradeSearch] = useState('');

  const [targetUsername, setTargetUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [adminUsername, setAdminUsername] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [adminFilter, setAdminFilter] = useState('all');

  // Sorting is always by ID. This state only controls direction.
  const [idSortDirection, setIdSortDirection] = useState('asc');

  const [usersOpen, setUsersOpen] = useState(false);
  const [tradesOpen, setTradesOpen] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const filteredUsers = useMemo(() => {
    const needle = userSearch.trim().toLowerCase();

    return users
      .filter(user => {
        const matchesAdminFilter =
          adminFilter === 'all' ||
          (adminFilter === 'admins' && user.isAdmin) ||
          (adminFilter === 'non-admins' && !user.isAdmin);

        const matchesSearch =
          !needle ||
          String(user.username || '').toLowerCase().includes(needle) ||
          String(user.id).includes(needle) ||
          (user.isAdmin ? 'admin' : 'user').includes(needle);

        return matchesAdminFilter && matchesSearch;
      })
      .sort((a, b) => {
        const aId = Number(a.id);
        const bId = Number(b.id);

        return idSortDirection === 'asc' ? aId - bId : bId - aId;
      });
  }, [users, userSearch, adminFilter, idSortDirection]);

  const filteredTrades = useMemo(() => {
    const needle = tradeSearch.trim().toLowerCase();

    return trades.filter(trade => {
      const matchesStatus = tradeStatusFilter === 'all' || trade.status === tradeStatusFilter;
      const matchesSearch = !needle || tradeSearchText(trade).includes(needle);

      return matchesStatus && matchesSearch;
    });
  }, [trades, tradeStatusFilter, tradeSearch]);

  async function loadTrades() {
    setError('');

    try {
      const data = await api('/api/admin/trades');
      setTrades(data.trades || []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadUsers() {
    setError('');

    try {
      const data = await api('/api/admin/users');
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    setMessage('');
    setError('');

    try {
      const data = await api('/api/admin/reset-password', {
        method: 'POST',
        body: JSON.stringify({ username: targetUsername.trim(), newPassword })
      });

      setMessage(data.message || 'Password reset');
      setTargetUsername('');
      setNewPassword('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function setAdmin(username, isAdmin) {
    setMessage('');
    setError('');

    try {
      const data = await api('/api/admin/set-admin', {
        method: 'POST',
        body: JSON.stringify({ username, isAdmin })
      });

      setMessage(data.message || 'Admin flag updated');
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function setAdminFromForm(event) {
    event.preventDefault();

    if (!adminUsername.trim()) return;

    await setAdmin(adminUsername.trim(), true);
    setAdminUsername('');
  }

  function toggleIdSortDirection() {
    setIdSortDirection(current => current === 'asc' ? 'desc' : 'asc');
  }

  useEffect(() => {
    loadTrades();
    loadUsers();
  }, []);

  return (
    <section className="card admin-panel">
      <div className="panel-title-row">
        <h2>Admin Panel</h2>
        <span className="status-pill">Admin</span>
      </div>

      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      <section className="card">
        <div className="panel-title-row">
          <button
            type="button"
            className="ghost"
            onClick={() => setUsersOpen(open => !open)}
            aria-expanded={usersOpen}
          >
            {usersOpen ? '▼' : '▶'} User Search / Admin Flags
          </button>

          <button type="button" onClick={loadUsers}>Refresh Users</button>
        </div>

        {usersOpen && (
          <>
            <form className="inline-controls" onSubmit={setAdminFromForm}>
              <input
                value={adminUsername}
                onChange={event => setAdminUsername(event.target.value)}
                placeholder="Username to make admin"
              />
              <button>Grant Admin</button>
            </form>

            <div className="inline-controls">
              <input
                value={userSearch}
                onChange={event => setUserSearch(event.target.value)}
                placeholder="Search users by ID, username, admin..."
                aria-label="Search users"
              />

              <select
                value={adminFilter}
                onChange={event => setAdminFilter(event.target.value)}
                aria-label="Filter users by admin flag"
              >
                <option value="all">All users</option>
                <option value="admins">Admins only</option>
                <option value="non-admins">Non-admins only</option>
              </select>

              <button type="button" className="ghost" onClick={toggleIdSortDirection}>
                ID {idSortDirection === 'asc' ? '↑' : '↓'}
              </button>
            </div>

            <p className="muted">
              Showing {filteredUsers.length} of {users.length} users. Sorted by ID {idSortDirection === 'asc' ? 'ascending' : 'descending'}.
            </p>

            <div className="trade-history-list">
              {filteredUsers.map(user => (
                <div className="trade-history-item" key={user.id}>
                  <div className="panel-title-row">
                    <strong>#{user.id} · {user.username}</strong>
                    <span className={`status-pill ${user.isAdmin ? 'status-completed' : 'status-pending'}`}>
                      {user.isAdmin ? 'admin' : 'user'}
                    </span>
                  </div>

                  <div className="inline-controls">
                    {!user.isAdmin && (
                      <button type="button" onClick={() => setAdmin(user.username, true)}>
                        Grant Admin
                      </button>
                    )}

                    {user.isAdmin && user.username.toLowerCase() !== 'salt' && (
                      <button type="button" className="danger" onClick={() => setAdmin(user.username, false)}>
                        Revoke Admin
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {filteredUsers.length === 0 && <p className="muted">No users match this search/filter.</p>}
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h3>Reset User Password</h3>

        <form className="inline-controls" onSubmit={resetPassword}>
          <input
            value={targetUsername}
            onChange={event => setTargetUsername(event.target.value)}
            placeholder="Player username"
          />
          <input
            value={newPassword}
            onChange={event => setNewPassword(event.target.value)}
            placeholder="New password"
            type="password"
          />
          <button>Reset Password</button>
        </form>
      </section>

      <section className="card">
        <div className="admin-header">
          <button
            type="button"
            className="ghost"
            onClick={() => setTradesOpen(open => !open)}
            aria-expanded={tradesOpen}
          >
            {tradesOpen ? '▼' : '▶'} All Trades
          </button>

          <button type="button" onClick={loadTrades}>Refresh Trades</button>
        </div>

        {tradesOpen && (
          <>
            <div className="inline-controls filter-row">
              <input
                value={tradeSearch}
                onChange={event => setTradeSearch(event.target.value)}
                placeholder="Search trades by user, item, status, room, chat..."
                aria-label="Search admin trades"
              />

              {['all', 'pending', 'countered', 'accepted', 'completed', 'declined'].map(item => (
                <button
                  key={item}
                  type="button"
                  className={tradeStatusFilter === item ? 'selected-filter' : 'ghost'}
                  onClick={() => setTradeStatusFilter(item)}
                >
                  {item}
                </button>
              ))}
            </div>

            <p className="muted">
              Showing {filteredTrades.length} of {trades.length} trades.
            </p>

            {filteredTrades.length === 0 && <p className="muted">No trades match this filter/search.</p>}

            <div className="trade-history-list">
              {filteredTrades.map(trade => (
                <div className="trade-history-item" key={trade.id}>
                  <div className="panel-title-row">
                    <strong>Trade #{trade.id}</strong>
                    <span className={`status-pill status-${trade.status}`}>{trade.status}</span>
                  </div>

                  <span>{trade.fromUsername} ↔ {trade.toUsername}</span>
                  <span>{trade.createdAt}</span>
                  <small>Room: {trade.roomId}</small>

                  <div className="grid two trade-items-grid">
                    <div>
                      <strong>{trade.fromUsername} offers</strong>
                      <div className="mini-trade-grid">
                        {(trade.fromItemDetails || []).map(item => <MiniTradeItem key={item.id} item={item} />)}
                      </div>
                    </div>

                    <div>
                      <strong>{trade.toUsername} offers/requested</strong>
                      <div className="mini-trade-grid">
                        {(trade.toItemDetails || []).map(item => <MiniTradeItem key={item.id} item={item} />)}
                      </div>
                    </div>
                  </div>

                  <details>
                    <summary>Chat history ({trade.chatHistory?.length || 0})</summary>
                    <div className="history-chat">
                      {(trade.chatHistory || []).map(message => (
                        <p key={message.id}><strong>{message.username}:</strong> {message.message}</p>
                      ))}
                    </div>
                  </details>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </section>
  );
}
