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

export default function AdminPanel() {
  const [trades, setTrades] = useState([]);
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('all');
  const [targetUsername, setTargetUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [userSearch, setUserSearch] = useState('');

  const filteredTrades = useMemo(
    () => filter === 'all' ? trades : trades.filter(trade => trade.status === filter),
    [filter, trades]
  );

  const filteredUsers = useMemo(() => {
    const needle = userSearch.trim().toLowerCase();

    if (!needle) return users;

    return users.filter(user =>
      String(user.username || '').toLowerCase().includes(needle) ||
      String(user.id).includes(needle) ||
      (user.isAdmin ? 'admin' : 'user').includes(needle)
    );
  }, [users, userSearch]);

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
          <h3>User Admin Flags</h3>
          <button type="button" onClick={loadUsers}>Refresh Users</button>
        </div>

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
            placeholder="Search users..."
          />
        </div>

        <div className="trade-history-list">
          {filteredUsers.map(user => (
            <div className="trade-history-item" key={user.id}>
              <div className="panel-title-row">
                <strong>{user.username}</strong>
                <span className={`status-pill ${user.isAdmin ? 'status-completed' : 'status-pending'}`}>
                  {user.isAdmin ? 'admin' : 'user'}
                </span>
              </div>

              <small>ID: {user.id}</small>

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
        </div>
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
          <h3>All Trades</h3>
          <button type="button" onClick={loadTrades}>Refresh</button>
        </div>

        <div className="inline-controls filter-row">
          {['all', 'pending', 'countered', 'accepted', 'completed', 'declined'].map(item => (
            <button key={item} className={filter === item ? 'selected-filter' : 'ghost'} onClick={() => setFilter(item)}>{item}</button>
          ))}
        </div>

        {filteredTrades.length === 0 && <p className="muted">No trades yet.</p>}

        <div className="trade-history-list">
          {filteredTrades.map(trade => (
            <div className="trade-history-item" key={trade.id}>
              <strong>Trade #{trade.id}</strong>
              <span>{trade.fromUsername} ↔ {trade.toUsername}</span>
              <span>Status: {trade.status}</span>
              <span>{trade.createdAt}</span>

              <div className="grid two trade-items-grid">
                <div className="mini-trade-grid">
                  {(trade.fromItemDetails || []).map(item => <MiniTradeItem key={item.id} item={item} />)}
                </div>
                <div className="mini-trade-grid">
                  {(trade.toItemDetails || []).map(item => <MiniTradeItem key={item.id} item={item} />)}
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
      </section>
    </section>
  );
}
