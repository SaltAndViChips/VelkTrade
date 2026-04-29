import { useMemo, useState } from 'react';
import { api } from '../api';

const FILTERS = ['all', 'pending', 'countered', 'accepted', 'completed', 'declined'];

export default function Trades({ trades, currentUser, onRefresh, onCounter }) {
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    if (filter === 'all') return trades;
    return trades.filter(trade => trade.status === filter);
  }, [filter, trades]);

  async function action(path) {
    setError('');

    try {
      await api(path, { method: 'POST' });
      await onRefresh();
    } catch (err) {
      setError(err.message);
    }
  }

  function otherName(trade) {
    return trade.fromUser === currentUser.id ? trade.toUsername : trade.fromUsername;
  }

  return (
    <section className="card">
      <div className="panel-title-row">
        <h2>Trades</h2>
        <button onClick={onRefresh}>Refresh</button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="inline-controls filter-row">
        {FILTERS.map(item => (
          <button key={item} className={filter === item ? 'selected-filter' : 'ghost'} onClick={() => setFilter(item)}>
            {item}
          </button>
        ))}
      </div>

      {filtered.length === 0 && <p className="muted">No trades match this filter.</p>}

      <div className="trade-history-list">
        {filtered.map(trade => (
          <article className="trade-history-item" key={trade.id}>
            <div className="panel-title-row">
              <strong>Trade #{trade.id}</strong>
              <span className={`status-pill status-${trade.status}`}>{trade.status}</span>
            </div>

            <span>With: {otherName(trade)}</span>
            <span>{trade.fromUsername} offers item IDs: {(trade.fromItems || []).join(', ') || 'none'}</span>
            <span>{trade.toUsername} requested item IDs: {(trade.toItems || []).join(', ') || 'none'}</span>
            <small>{trade.createdAt}</small>

            <details>
              <summary>Chat / message history ({trade.chatHistory?.length || 0})</summary>
              <div className="history-chat">
                {(trade.chatHistory || []).map(message => (
                  <p key={message.id}><strong>{message.username}:</strong> {message.message}</p>
                ))}
              </div>
            </details>

            <div className="inline-controls">
              {['pending', 'countered'].includes(trade.status) && (
                <>
                  <button onClick={() => action(`/api/trades/${trade.id}/accept`)}>Accept</button>
                  <button className="ghost" onClick={() => onCounter(trade)}>Counter</button>
                  <button className="danger" onClick={() => action(`/api/trades/${trade.id}/decline`)}>Decline</button>
                </>
              )}

              {trade.status === 'accepted' && (
                <>
                  <button onClick={() => action(`/api/trades/${trade.id}/confirm`)}>Confirm / Complete</button>
                  <button className="danger" onClick={() => action(`/api/trades/${trade.id}/decline`)}>Decline</button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
