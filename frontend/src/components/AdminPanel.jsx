import { useEffect, useState } from 'react';
import { api } from '../api';

export default function AdminPanel() {
  const [trades, setTrades] = useState([]);
  const [targetUsername, setTargetUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadTrades() {
    setError('');

    try {
      const data = await api('/api/admin/trades');
      setTrades(data.trades || []);
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

  useEffect(() => {
    loadTrades();
  }, []);

  return (
    <section className="card admin-panel">
      <div className="panel-title-row">
        <h2>Salt Admin Panel</h2>
        <span className="status-pill">Admin</span>
      </div>

      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

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

      <div className="admin-header">
        <h3>All Trade History</h3>
        <button type="button" onClick={loadTrades}>Refresh</button>
      </div>

      {trades.length === 0 && <p className="muted">No trades yet.</p>}

      <div className="trade-history-list">
        {trades.map(trade => (
          <div className="trade-history-item" key={trade.id}>
            <strong>Trade #{trade.id}</strong>
            <span>{trade.fromUsername} ↔ {trade.toUsername}</span>
            <span>Status: {trade.status}</span>
            <span>{trade.createdAt}</span>
            <small>From items: {trade.fromItems}</small>
            <small>To items: {trade.toItems}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
