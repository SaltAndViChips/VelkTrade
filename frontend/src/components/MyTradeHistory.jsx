import { useMemo, useState } from 'react';

const FILTERS = ['all', 'accepted', 'confirmed', 'completed', 'declined'];

export default function MyTradeHistory({ trades }) {
  const [filter, setFilter] = useState('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return trades;
    if (filter === 'confirmed') return trades.filter(trade => trade.status === 'completed');
    return trades.filter(trade => trade.status === filter);
  }, [filter, trades]);

  return (
    <section className="card">
      <div className="panel-title-row">
        <h2>My Trade History</h2>
        <div className="inline-controls">
          {FILTERS.map(item => (
            <button key={item} className={filter === item ? 'selected-filter' : 'ghost'} onClick={() => setFilter(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && <p className="muted">No trades match this filter.</p>}

      <div className="trade-history-list">
        {filtered.map(trade => (
          <article className="trade-history-item" key={trade.id}>
            <strong>Trade #{trade.id}</strong>
            <span>{trade.fromUsername} ↔ {trade.toUsername}</span>
            <span>Status: {trade.status}</span>
            <span>{trade.createdAt}</span>
            <small>From items: {(trade.fromItems || []).join(', ') || 'none'}</small>
            <small>To items: {(trade.toItems || []).join(', ') || 'none'}</small>

            <details>
              <summary>Chat history ({trade.chatHistory?.length || 0})</summary>
              <div className="history-chat">
                {(trade.chatHistory || []).map(message => (
                  <p key={message.id}><strong>{message.username}:</strong> {message.message}</p>
                ))}
              </div>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}
